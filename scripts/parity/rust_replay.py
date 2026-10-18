#!/usr/bin/env python3
"""Opt-in Rust duplicate-receive probe. Exit 0: pass, 1: invariant fails, 2: infrastructure error.

Run with Python 3.11+, Cargo and Rust installed. The runner snapshots the current
Rust crate and vectors, adds only the companion test to that temporary copy,
and executes one targeted test. It never changes library sources or global
LocalNet fixtures. Results describe these trials, not a statistical guarantee.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

_TEST = "algochat::tests::parity_concurrent_receive_rejects_duplicate_plaintext"
_PREFIX = "ALGOCHAT_PARITY_REPLAY_RESULT="


def _positive_int(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return number


def _snapshot(root, work):
    """Copy crate inputs and vectors; retain source hashes before test injection."""
    tracked = subprocess.check_output(
        ["git", "ls-files", "-z", "--", "rs", "vectors"], cwd=root
    ).split(b"\0")
    names = [Path(os.fsdecode(name)) for name in tracked if name]
    if (root / "rs/Cargo.lock").is_file() and Path("rs/Cargo.lock") not in names:
        names.append(Path("rs/Cargo.lock"))
    manifest = {}
    for name in sorted(names):
        source = root / name
        if (
            source.is_symlink()
            or not source.resolve().is_relative_to(root.resolve())
            or not source.is_file()
        ):
            raise ValueError(f"missing, escaping or nonregular source input: {name}")
        target = work / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        manifest[name.as_posix()] = hashlib.sha256(target.read_bytes()).hexdigest()
    if not manifest:
        raise ValueError("source snapshot has no inputs")
    return manifest


def _inject_test(source, snippet):
    """Insert into the final existing test module, failing closed on layout drift."""
    text = source.read_text()
    headers = list(re.finditer(r"(?m)^#\[cfg\(test\)\]\s*\nmod tests\s*\{", text))
    if len(headers) != 1:
        raise ValueError(
            "expected exactly one cfg(test) tests module in rs/src/algochat.rs"
        )
    # Rustfmt leaves this module's closing brace unindented. Require it to be
    # the final item so a changed source layout cannot silently place the test
    # into another module. Cargo and the exact test name validate the result.
    closing = re.search(r"(?m)^}\s*\Z", text[headers[0].end() :])
    if closing is None:
        raise ValueError("the existing tests module must be the final source item")
    offset = headers[0].end() + closing.start()
    if _TEST.rsplit("::", 1)[-1] in text:
        raise ValueError("the replay probe already exists in this source")
    source.write_text(text[:offset] + "\n" + snippet.rstrip() + "\n" + text[offset:])


def _run(command, cwd, log, timeout, env):
    """Record an exact argv and output, including failed and timed-out commands."""
    log.write("+ " + json.dumps(list(map(str, command))) + "\n")
    log.flush()
    try:
        result = subprocess.run(
            list(map(str, command)),
            cwd=cwd,
            env=env,
            timeout=timeout,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        partial = error.stdout or ""
        if isinstance(partial, bytes):
            partial = partial.decode(errors="replace")
        log.write(partial + "\nCOMMAND TIMED OUT\n")
        log.flush()
        raise
    log.write(result.stdout)
    log.write(f"\nexit_code={result.returncode}\n")
    log.flush()
    return result


def _read_probe_report(output, iterations, cargo_exit_code):
    """Validate a completed test's counters and classify the desired invariant."""
    # libtest may place its `test ...` progress prefix on the same stdout line.
    records = re.findall(re.escape(_PREFIX) + r"(\{[^\r\n]*\})", output)
    if len(records) != 1:
        raise ValueError(
            "targeted test did not emit exactly one completed probe report"
        )
    report = json.loads(records[0])
    names = (
        "iterations",
        "duplicate_trials",
        "both_rejected_trials",
        "unexpected_plaintext_returns",
        "successful_plaintext_returns",
    )
    if not isinstance(report, dict) or any(
        type(report.get(name)) is not int for name in names
    ):
        raise ValueError("invalid probe counters")
    if report["iterations"] != iterations:
        raise ValueError("probe did not complete the requested iterations")
    if any(
        report[name] < 0 or report[name] > iterations
        for name in ("duplicate_trials", "both_rejected_trials")
    ):
        raise ValueError("probe trial counts are out of range")
    successes = report["successful_plaintext_returns"]
    if (
        successes
        != iterations + report["duplicate_trials"] - report["both_rejected_trials"]
    ):
        raise ValueError("probe success counts are inconsistent")
    if not 0 <= report["unexpected_plaintext_returns"] <= successes:
        raise ValueError("probe plaintext counts are out of range")
    invariant_passed = not any(
        report[name]
        for name in (
            "duplicate_trials",
            "both_rejected_trials",
            "unexpected_plaintext_returns",
        )
    )
    if cargo_exit_code != (0 if invariant_passed else 101):
        raise ValueError("Cargo result does not match the completed test invariant")
    return report, invariant_passed


def main(argv=None):
    """Run the isolated opt-in probe and write an auditable result directory."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", required=True, type=Path, help="new directory outside the checkout"
    )
    parser.add_argument("--iterations", type=_positive_int, default=100)
    parser.add_argument(
        "--timeout", type=_positive_int, default=600, help="seconds per command"
    )
    parser.add_argument(
        "--offline", action="store_true", help="require cached Cargo dependencies"
    )
    parser.add_argument(
        "--target-dir",
        type=Path,
        help="optional Cargo cache; defaults to rs/target if it exists",
    )
    args = parser.parse_args(argv)
    root = Path(__file__).resolve().parents[2]
    output = args.output.resolve()
    if output.is_relative_to(root):
        parser.error("--output must be outside the checkout")
    try:
        output.mkdir(parents=True, exist_ok=False)
    except OSError as error:
        parser.error(f"--output must be a new writable directory: {error}")

    started = time.time()
    summary = {
        "schema": 1,
        "probe": "rust-concurrent-psk-replay",
        "status": "infrastructure_error",
        "iterations": args.iterations,
        "scope": "two simultaneous receives per trial; no statistical correctness guarantee",
        "log": "cargo-test.log",
        "source_manifest": "source-manifest.json",
    }
    exit_code = 2
    with (output / "cargo-test.log").open("w") as log:
        try:
            for tool in ("cargo", "rustc", "git"):
                if shutil.which(tool) is None:
                    raise ValueError(f"required tool is unavailable: {tool}")
            env = os.environ.copy()
            env["ALGOCHAT_PARITY_REPLAY_ITERATIONS"] = str(args.iterations)
            summary["toolchain"] = {}
            for tool in ("cargo", "rustc"):
                version = _run([tool, "--version"], root, log, args.timeout, env)
                if version.returncode:
                    raise ValueError(f"cannot read {tool} version")
                summary["toolchain"][tool] = version.stdout.strip()
            candidate = _run(["git", "rev-parse", "HEAD"], root, log, args.timeout, env)
            state = _run(
                ["git", "status", "--porcelain", "--", "rs", "vectors"],
                root,
                log,
                args.timeout,
                env,
            )
            if candidate.returncode or state.returncode:
                raise ValueError("cannot identify the source checkout")
            summary["candidate_sha"] = candidate.stdout.strip()
            summary["source_status"] = state.stdout.strip()
            with tempfile.TemporaryDirectory(prefix="algochat-replay-") as temporary:
                work = Path(temporary)
                manifest = _snapshot(root, work)
                (output / "source-manifest.json").write_text(
                    json.dumps(manifest, indent=2) + "\n"
                )
                snippet = Path(__file__).with_name("rust_replay_test.rs").read_text()
                summary["test_sha256"] = hashlib.sha256(snippet.encode()).hexdigest()
                summary["source_manifest_sha256"] = hashlib.sha256(
                    (output / "source-manifest.json").read_bytes()
                ).hexdigest()
                _inject_test(work / "rs/src/algochat.rs", snippet)
                target = args.target_dir or (
                    Path(env["CARGO_TARGET_DIR"])
                    if env.get("CARGO_TARGET_DIR")
                    else None
                )
                if target is None:
                    target = (
                        root / "rs/target"
                        if (root / "rs/target").is_dir()
                        else work / "target"
                    )
                target = target.resolve()
                if target.is_relative_to(root) and target != root / "rs/target":
                    raise ValueError(
                        "--target-dir inside this checkout must be rs/target"
                    )
                env["CARGO_TARGET_DIR"] = str(target)
                summary["target_dir"] = str(target)
                command = ["cargo", "test", "--lib", _TEST]
                if (work / "rs/Cargo.lock").exists():
                    command.append("--locked")
                if args.offline:
                    command.append("--offline")
                command += ["--", "--exact", "--nocapture", "--test-threads=1"]
                summary["command"] = command
                result = _run(command, work / "rs", log, args.timeout, env)
                summary["cargo_exit_code"] = result.returncode
                if (work / "rs/Cargo.lock").exists():
                    shutil.copy2(work / "rs/Cargo.lock", output / "Cargo.lock")
                    summary["lock_sha256"] = hashlib.sha256(
                        (output / "Cargo.lock").read_bytes()
                    ).hexdigest()
                changed = [
                    name
                    for name, expected in manifest.items()
                    if not (root / name).is_file()
                    or hashlib.sha256((root / name).read_bytes()).hexdigest()
                    != expected
                ]
                summary["source_preserved"] = not changed
                summary["changed_inputs"] = changed
                if changed:
                    raise ValueError(
                        "source inputs changed during the probe; no files were restored"
                    )
                counters, passed = _read_probe_report(
                    result.stdout, args.iterations, result.returncode
                )
                summary["counters"] = counters
                summary["status"] = "passed" if passed else "invariant_failed"
                exit_code = 0 if passed else 1
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            summary["error"] = str(error)
            log.write(f"\nINFRASTRUCTURE ERROR: {error}\n")
        finally:
            summary["elapsed_seconds"] = round(time.time() - started, 3)
            summary["exit_code"] = exit_code
            (output / "result.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
