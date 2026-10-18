#!/usr/bin/env python3
"""Check Swift PSK history invariants in an isolated local consumer.

Exit 0 means all assertions passed, 1 means a behavior invariant failed, and 2
means the probe could not complete. Missing tools/dependencies are errors.
No node, indexer, registry publication, or user storage is used.
"""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = Path(__file__).resolve().with_name("swift-history")


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def tracked_snapshot(repository):
    """Hash tracked bytes, including existing uncommitted edits, without writing."""
    result = subprocess.run(
        ["git", "ls-files", "-z"], cwd=repository, capture_output=True, check=True
    )
    snapshot = {}
    for raw in result.stdout.split(b"\0"):
        if not raw:
            continue
        name = os.fsdecode(raw)
        path = repository / name
        if path.is_symlink():
            content = b"symlink\0" + os.fsencode(os.readlink(path))
        elif path.is_file():
            content = path.read_bytes()
        else:
            snapshot[name] = None
            continue
        snapshot[name] = hashlib.sha256(content).hexdigest()
    return snapshot


def run_command(argv, cwd, output, commands, timeout, environment):
    """Retain output even for failed or timed-out compiler/helper commands."""
    log = output / f"command-{len(commands) + 1:02d}.log"
    entry = {"argv": [str(value) for value in argv], "cwd": str(cwd), "log": log.name}
    commands.append(entry)
    try:
        result = subprocess.run(
            entry["argv"],
            cwd=cwd,
            env=environment,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        captured = error.stdout or b""
        log.write_text(
            captured.decode(errors="replace")
            if isinstance(captured, bytes)
            else captured
        )
        entry.update(exit_code=None, timed_out=True)
        raise RuntimeError(f"command timed out; see {log.name}") from error
    except OSError as error:
        log.write_text(str(error) + "\n")
        entry.update(exit_code=None, error=str(error))
        raise RuntimeError(f"could not start command; see {log.name}") from error
    log.write_text(result.stdout)
    entry["exit_code"] = result.returncode
    return result


def read_observation(path, phase, exit_code):
    """Require complete, internally consistent observations before counting checks."""
    value = json.loads(path.read_text())
    expected_names = {
        "prepare": {
            "first_history_read",
            "same_transaction_second_read",
            "new_transaction_same_counter_is_replay",
            "authentication_failure_returns_no_message",
            "authentication_failure_does_not_burn_counter",
        },
        "restart": {"same_transaction_after_process_restart"},
    }[phase]
    if not isinstance(value, dict):
        raise TypeError(f"malformed {phase} observations")
    checks = value.get("checks")
    if (
        value.get("schema") != 1
        or value.get("phase") != phase
        or not isinstance(checks, list)
        or len(checks) != len(expected_names)
        or any(not isinstance(check, dict) for check in checks)
        or {check.get("name") for check in checks} != expected_names
        or any(type(check.get("passed")) is not bool for check in checks)
    ):
        raise RuntimeError(f"malformed {phase} observations")
    violations = [check["name"] for check in checks if not check["passed"]]
    expected_result = "behavior_violation" if violations else "passed"
    if (
        value.get("violations") != violations
        or value.get("result") != expected_result
        or exit_code != (1 if violations else 0)
    ):
        raise RuntimeError(f"inconsistent {phase} observations or exit status")
    return value


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="new evidence directory outside the repository",
    )
    parser.add_argument(
        "--repository",
        type=Path,
        default=ROOT,
        help="AlgoChat repository root (default: this checkout)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=1200,
        help="maximum seconds per command (default: 1200)",
    )
    arguments = parser.parse_args(argv)
    repository = arguments.repository.resolve()
    output = arguments.output.resolve()
    if output.exists() or output.is_relative_to(repository):
        parser.error("--output must be a new directory outside the repository")
    if arguments.timeout <= 0:
        parser.error("--timeout must be positive")
    output.mkdir(parents=True)
    commands = []
    report = {
        "schema": 1,
        "probe": "swift_history",
        "category": "local",
        "repository": str(repository),
        "result": "infrastructure_error",
        "commands": commands,
        "storage": "temporary test-only file adapter; synthetic transaction searcher; no network calls",
        "scope": "same PSK transaction remains readable exactly once on repeated fetch and process restart; a distinct transaction copying its note is rejected as replay; failed authentication never burns its counter",
    }
    before = None
    status = 2
    environment = os.environ.copy()
    environment["ALGOCHAT_PARITY_REPOSITORY"] = str(repository)
    try:
        if not (repository / "Package.swift").is_file():
            raise RuntimeError(
                "repository must contain the root AlgoChat Package.swift"
            )
        if shutil.which("swift") is None:
            raise RuntimeError("Swift is required and was not found on PATH")
        before = tracked_snapshot(repository)
        write_json(output / "tracked-before.json", before)
        candidate = run_command(
            ["git", "rev-parse", "HEAD"],
            repository,
            output,
            commands,
            arguments.timeout,
            environment,
        )
        if candidate.returncode:
            raise RuntimeError("could not determine candidate commit")
        report["candidate"] = candidate.stdout.strip()
        tree = run_command(
            ["git", "status", "--porcelain"],
            repository,
            output,
            commands,
            arguments.timeout,
            environment,
        )
        if tree.returncode:
            raise RuntimeError("could not determine candidate tree state")
        report["tree_state"] = "dirty" if tree.stdout.strip() else "clean"
        report["status_before"] = tree.stdout.splitlines()
        version = run_command(
            ["swift", "--version"],
            repository,
            output,
            commands,
            arguments.timeout,
            environment,
        )
        if version.returncode:
            raise RuntimeError("Swift version command failed")
        report["swift"] = version.stdout.strip()
        with tempfile.TemporaryDirectory(prefix="algochat-swift-history-") as temporary:
            work = Path(temporary)
            consumer = work / "consumer"
            consumer.mkdir()
            shutil.copy2(TEMPLATE / "Package.swift", consumer / "Package.swift")
            shutil.copytree(TEMPLATE / "Sources", consumer / "Sources")
            build = run_command(
                [
                    "swift",
                    "build",
                    "--package-path",
                    consumer,
                    "--scratch-path",
                    work / "build",
                    "--product",
                    "swift-history-probe",
                ],
                consumer,
                output,
                commands,
                arguments.timeout,
                environment,
            )
            if build.returncode:
                raise RuntimeError(
                    f"Swift consumer build failed; see {commands[-1]['log']}"
                )
            resolved = consumer / "Package.resolved"
            if resolved.exists():
                shutil.copy2(resolved, output / "consumer-Package.resolved")
            binary = work / "build/debug/swift-history-probe"
            observations = []
            for phase in ["prepare", "restart"]:
                observation_path = output / f"{phase}-observations.json"
                result = run_command(
                    [binary, phase, work / "fixtures", observation_path],
                    consumer,
                    output,
                    commands,
                    arguments.timeout,
                    environment,
                )
                if result.returncode not in {0, 1}:
                    raise RuntimeError(
                        f"{phase} failed to execute; see {commands[-1]['log']}"
                    )
                observations.append(
                    read_observation(observation_path, phase, result.returncode)
                )
            report["checks"] = [
                check for observation in observations for check in observation["checks"]
            ]
            report["violations"] = [
                check["name"] for check in report["checks"] if not check["passed"]
            ]
            report["result"] = (
                "behavior_violation" if report["violations"] else "passed"
            )
            status = 1 if report["violations"] else 0
    except (
        OSError,
        RuntimeError,
        subprocess.SubprocessError,
        ValueError,
        TypeError,
    ) as error:
        report["error"] = str(error)
    finally:
        if before is not None:
            try:
                after = tracked_snapshot(repository)
                write_json(output / "tracked-after.json", after)
                changed = [
                    name
                    for name in sorted(before.keys() | after.keys())
                    if before.get(name) != after.get(name)
                ]
                report["tracked_tree_preserved"] = not changed
                report["changed_tracked_files"] = changed
                if changed:
                    report["error"] = (
                        "tracked files changed during the probe; no files were restored"
                    )
                    report["result"] = "infrastructure_error"
                    status = 2
            except (OSError, subprocess.SubprocessError) as error:
                report["error"] = f"could not verify tracked tree preservation: {error}"
                report["result"] = "infrastructure_error"
                status = 2
        write_json(output / "result.json", report)
    print(
        f"Swift history probe: {report['result']}; evidence: {output / 'result.json'}"
    )
    return status


if __name__ == "__main__":
    sys.exit(main())
