#!/usr/bin/env python3
"""Build all six local helpers and replay the low-level interoperability matrix.

Outputs are local observations, not hosted release receipts or confidence scores.
Exit 0: all asserted paths passed; 1: behavioral checks failed; 2: execution error.
"""

import argparse
import datetime
import hashlib
import json
import os
import select
import shutil
import subprocess
import time
import traceback
from pathlib import Path

LANGS = ["ts", "go", "rs", "py", "kt", "swift"]


class Tool:
    def __init__(self, name, cmd, cwd, out, timeout):
        self.name = name
        self.seq = 0
        self.timeout = timeout
        self.err = (out / f"mesh-{name}.stderr").open("w")
        try:
            self.p = subprocess.Popen(
                cmd,
                cwd=cwd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=self.err,
                text=True,
                bufsize=1,
            )
        except Exception:
            self.err.close()
            raise

    def call(self, body):
        self.seq += 1
        q = {"id": self.seq, **body}
        self.p.stdin.write(json.dumps(q, ensure_ascii=True) + "\n")
        self.p.stdin.flush()
        if not select.select([self.p.stdout], [], [], self.timeout)[0]:
            raise RuntimeError(f"{self.name} timeout {body['op']}")
        line = self.p.stdout.readline()
        if not line:
            raise RuntimeError(f"{self.name} exited {self.p.poll()}")
        r = json.loads(line)
        if r.get("id") != self.seq:
            raise RuntimeError(f"{self.name} wrong response id {r}")
        return r

    def stop(self):
        if self.p.poll() is None:
            self.p.terminate()
            try:
                self.p.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.p.kill()
                self.p.wait(timeout=10)
        self.p.stdin.close()
        self.p.stdout.close()
        self.err.close()


def digest(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=True).encode()
    ).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", required=True, type=Path, help="New directory outside the checkout"
    )
    parser.add_argument(
        "--python",
        help="Python interpreter with algochat dependencies; default py/.venv/bin/python or PATH",
    )
    parser.add_argument(
        "--java", help="Java runtime executable; default JAVA_HOME/bin/java or PATH"
    )
    parser.add_argument(
        "--gradle",
        default="./gradlew",
        help="Gradle executable for Kotlin helper build",
    )
    parser.add_argument(
        "--timeout", default=45, type=float, help="Seconds per helper response"
    )
    parser.add_argument(
        "--build-timeout", default=600, type=float, help="Seconds per helper build"
    )
    args = parser.parse_args()
    ROOT = Path(__file__).resolve().parents[2]
    OUT = args.output.resolve()
    if OUT.exists() or OUT.is_relative_to(ROOT):
        parser.error("--output must be a new directory outside the checkout")
    if args.timeout <= 0 or args.build_timeout <= 0:
        parser.error("timeouts must be positive")
    OUT.mkdir(parents=True)
    candidate = {
        "sha": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip(),
        "tree": subprocess.check_output(
            ["git", "rev-parse", "HEAD^{tree}"], cwd=ROOT, text=True
        ).strip(),
        "working_tree_status": subprocess.check_output(
            ["git", "status", "--porcelain"], cwd=ROOT, text=True
        ),
        "started_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "category": "local-replay",
        "scope": "Low-level helper interoperability; a dirty working tree is recorded and is not exact-commit qualification.",
    }
    candidate["tree_state"] = (
        "clean" if not candidate["working_tree_status"] else "dirty"
    )
    (OUT / "candidate.json").write_text(json.dumps(candidate, indent=2) + "\n")
    tools = {}
    results = []
    notes = []
    start = time.time()
    infrastructure_error = False
    transcript = (OUT / "mesh-transcript.jsonl").open("w")

    def check(label, passed, details):
        row = {"check": label, "passed": bool(passed), **details}
        results.append(row)
        transcript.write(json.dumps(row, ensure_ascii=True) + "\n")
        transcript.flush()
        if not passed:
            print("FAIL", label, json.dumps(details)[:350], flush=True)

    try:
        build_commands = [
            (
                "go",
                ["go", "build", "-o", str(OUT / "tools/pqcross-go"), "./cmd/pqcross"],
                ROOT / "go",
            ),
            ("rs", ["cargo", "build", "--bin", "pqcross"], ROOT / "rs"),
            ("kt", [args.gradle, "pqioClasspath", "--no-daemon"], ROOT / "kt"),
            ("swift", ["swift", "build", "--product", "pqcross"], ROOT),
        ]
        (OUT / "tools").mkdir()
        builds = []
        for language, command, cwd in build_commands:
            executable = (
                shutil.which(command[0])
                if "/" not in command[0]
                else str((cwd / command[0]).resolve())
            )
            if not executable or not Path(executable).is_file():
                raise RuntimeError(f"{language}: missing build tool {command[0]}")
            command[0] = executable
            with (OUT / f"build-{language}.log").open("w") as log:
                proc = subprocess.run(
                    command,
                    cwd=cwd,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    timeout=args.build_timeout,
                    check=False,
                )
            builds.append(
                {"language": language, "argv": command, "exit_code": proc.returncode}
            )
            (OUT / "builds.json").write_text(json.dumps(builds, indent=2) + "\n")
            if proc.returncode:
                raise RuntimeError(
                    f"{language}: helper build failed; see build-{language}.log"
                )
        cp = (ROOT / "kt/build/pqio.classpath").read_text().strip()
        java = (
            Path(args.java)
            if args.java
            else Path(os.environ.get("JAVA_HOME", "")) / "bin/java"
        )
        if not java.is_file():
            located = shutil.which("java")
            if not located:
                raise RuntimeError(
                    "missing Java runtime; configure JAVA_HOME or --java"
                )
            java = Path(located)
        python = args.python or (
            str(ROOT / "py/.venv/bin/python")
            if (ROOT / "py/.venv/bin/python").is_file()
            else "python3"
        )
        commands = {
            "ts": (["bun", "scripts/pq-io.ts"], ROOT / "ts"),
            "go": ([str(OUT / "tools/pqcross-go")], ROOT),
            "rs": ([str(ROOT / "rs/target/debug/pqcross")], ROOT),
            "py": ([python, str(ROOT / "py/tools/pq_io.py")], ROOT),
            "kt": (
                [str(java), "-cp", cp, "com.corvidlabs.algochat.PQIOKt"],
                ROOT / "kt",
            ),
            "swift": ([str(ROOT / ".build/debug/pqcross")], ROOT),
        }
        version_commands = {
            "bun": (["bun", "--version"], ROOT),
            "go": (["go", "version"], ROOT),
            "rustc": (["rustc", "--version"], ROOT),
            "cargo": (["cargo", "--version"], ROOT),
            "python": ([python, "--version"], ROOT),
            "java": ([str(java), "-version"], ROOT),
            "swift": (["swift", "--version"], ROOT),
            "gradle": ([args.gradle, "--version"], ROOT / "kt"),
        }
        versions = {}
        for label, (command, cwd) in version_commands.items():
            proc = subprocess.run(
                command,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
            versions[label] = {
                "argv": command,
                "exit_code": proc.returncode,
                "output": proc.stdout + proc.stderr,
            }
            (OUT / "versions.json").write_text(json.dumps(versions, indent=2) + "\n")
            if proc.returncode:
                raise RuntimeError(f"{label} version check failed")
        for name in LANGS:
            tools[name] = Tool(name, *commands[name], OUT, args.timeout)
        (OUT / "helpers.json").write_text(
            json.dumps(
                {
                    name: {"argv": command, "cwd": str(cwd)}
                    for name, (command, cwd) in commands.items()
                },
                indent=2,
            )
            + "\n"
        )
        # Two independent deterministic account pairs, including a zero seed.
        for pair, (a, b) in enumerate([("11" * 32, "22" * 32), ("00" * 32, "ab" * 32)]):
            common = {"aliceSeed": a, "bobSeed": b, "psk": "44" * 32}
            identities = {
                name: tool.call({"op": "identity", "seed": b})
                for name, tool in tools.items()
            }
            reference = identities["ts"]
            for name, r in identities.items():
                check(
                    f"identity/{pair}/{name}",
                    r.get("ok")
                    and r.get("x25519") == reference.get("x25519")
                    and r.get("encapsKey") == reference.get("encapsKey"),
                    {"reader": name, "response_digest": digest(r)},
                )
            for writer, tool in tools.items():
                items = []
                for mode, maximum in [("01", 3954), ("02", 3950)]:
                    cases = [
                        ("empty", "", 0),
                        ("small", "hello", 0),
                        ("unicode", "héllo 🦜\n漢字\u0000", 1),
                        ("large", "L" * 2000, 99),
                        ("maximum", "M" * maximum, 100),
                    ]
                    for size, text, counter in cases:
                        request = {
                            **common,
                            "op": "write" + mode,
                            "text": text,
                            "counter": counter,
                        }
                        r = tool.call(request)
                        check(
                            f"write/{pair}/{writer}/{mode}/{size}",
                            r.get("ok") and bool(r.get("note")),
                            {"writer": writer, "error": r.get("error")},
                        )
                        if not r.get("ok"):
                            continue
                        raw = bytes.fromhex(r["note"])
                        expected_version = 2 if writer == "ts" else 1
                        check(
                            f"framing/{pair}/{writer}/{mode}/{size}",
                            raw[0] == expected_version
                            and raw[1] == int(mode)
                            and len(raw) <= 4096,
                            {"bytes": len(raw), "version": raw[0]},
                        )
                        items.append(
                            {
                                "pair": pair,
                                "writer": writer,
                                "mode": mode,
                                "size": size,
                                "text": text,
                                "counter": counter,
                                "note": r["note"],
                            }
                        )
                    r = tool.call(
                        {
                            **common,
                            "op": "write" + mode,
                            "text": "X" * (maximum + 1),
                            "counter": 0,
                        }
                    )
                    check(
                        f"oversize-write/{pair}/{writer}/{mode}",
                        not r.get("ok"),
                        {"writer": writer, "error": r.get("error")},
                    )
                texts = ["", "hello", "héllo 🦜\n漢字\u0000", "L" * 2000, "Q" * 4002]
                r = tool.call({**common, "op": "write05s", "texts": texts})
                check(
                    f"pq-write/{pair}/{writer}",
                    r.get("ok") and len(r.get("messages", [])) == len(texts),
                    {"writer": writer, "error": r.get("error")},
                )
                if r.get("ok"):
                    h = bytes.fromhex(r["handshake"])
                    check(
                        f"handshake/{pair}/{writer}",
                        len(h) == 2366 and h[:2] == bytes([2, 4]),
                        {"bytes": len(h)},
                    )
                    for size, text, msg in zip(
                        ["empty", "small", "unicode", "large", "maximum"],
                        texts,
                        r["messages"],
                    ):
                        raw = bytes.fromhex(msg)
                        check(
                            f"pq-framing/{pair}/{writer}/{size}",
                            raw[:2] == bytes([2, 5])
                            and len(raw) == 94 + len(text.encode()),
                            {"bytes": len(raw)},
                        )
                        items.append(
                            {
                                "pair": pair,
                                "writer": writer,
                                "mode": "05",
                                "size": size,
                                "text": text,
                                "counter": 0,
                                "note": msg,
                                "handshake": r["handshake"],
                                "sessionKey": r["sessionKey"],
                            }
                        )
                r = tool.call({**common, "op": "write", "text": "X" * 4003})
                check(
                    f"oversize-write/{pair}/{writer}/05",
                    not r.get("ok"),
                    {"writer": writer, "error": r.get("error")},
                )
                for item in items:
                    notes.append(item)
                    mode = item["mode"]
                    req = {
                        **common,
                        "op": "read" if mode == "05" else "read" + mode,
                        "text": item["text"],
                        "counter": item["counter"],
                        "note": item["note"],
                    }
                    if mode == "05":
                        req.update(handshake=item["handshake"], message=item["note"])
                    for reader, reader_tool in tools.items():
                        label = f"read/{pair}/{writer}/{mode}/{item['size']}/{reader}"
                        opened = reader_tool.call(req)
                        good = (
                            opened.get("ok")
                            and opened.get("recipient") == item["text"]
                            and opened.get("sender") == item["text"]
                        )
                        if mode == "05":
                            good = (
                                good and opened.get("sessionKey") == item["sessionKey"]
                            )
                        check(
                            label,
                            good,
                            {
                                "writer": writer,
                                "reader": reader,
                                "mode": mode,
                                "error": opened.get("error"),
                                "response_digest": digest(opened),
                            },
                        )
                        # Test authenticated body, tag, framing, wrong recipient and PSK.
                        if item["size"] == "small":
                            raw = bytearray.fromhex(item["note"])
                            header = 126 if mode == "01" else 130
                            if mode == "05":
                                header = 78
                            variants = {}
                            for kind, offset in [
                                ("ciphertext", header),
                                ("tag", len(raw) - 1),
                            ]:
                                changed = bytearray(raw)
                                changed[offset] ^= 1
                                variants[kind] = bytes(changed).hex()
                            variants["truncated"] = bytes(raw[:-1]).hex()
                            for kind, changed in variants.items():
                                bad = {**req, "note": changed}
                                if mode == "05":
                                    bad["message"] = changed
                                response = reader_tool.call(bad)
                                check(
                                    f"reject/{pair}/{writer}/{mode}/{reader}/{kind}",
                                    not response.get("ok"),
                                    {
                                        "reader": reader,
                                        "writer": writer,
                                        "mode": mode,
                                        "error": response.get("error"),
                                    },
                                )
                            bad = {**req, "bobSeed": "77" * 32}
                            response = reader_tool.call(bad)
                            check(
                                f"reject/{pair}/{writer}/{mode}/{reader}/wrong-recipient",
                                not response.get("ok"),
                                {
                                    "reader": reader,
                                    "writer": writer,
                                    "error": response.get("error"),
                                },
                            )
                            if mode == "02":
                                bad = {**req, "psk": "55" * 32}
                                response = reader_tool.call(bad)
                                check(
                                    f"reject/{pair}/{writer}/{mode}/{reader}/wrong-psk",
                                    not response.get("ok"),
                                    {
                                        "reader": reader,
                                        "writer": writer,
                                        "error": response.get("error"),
                                    },
                                )
                print(
                    f"pair {pair} writer {writer}: {len(items)} notes, checks so far {len(results)}",
                    flush=True,
                )
    except Exception as exc:  # noqa: BLE001 -- CLI boundary must retain a failed receipt for every execution error.
        infrastructure_error = True
        check(
            "harness-completion",
            False,
            {"error": str(exc), "traceback": traceback.format_exc()},
        )
    finally:
        for tool in tools.values():
            try:
                tool.stop()
            except (OSError, ValueError, subprocess.SubprocessError) as exc:
                infrastructure_error = True
                check("helper-cleanup", False, {"error": str(exc)})
        final_status = subprocess.check_output(
            ["git", "status", "--porcelain"], cwd=ROOT, text=True
        )
        check(
            "checkout-preserved",
            final_status == candidate["working_tree_status"],
            {
                "initial_status": candidate["working_tree_status"],
                "final_status": final_status,
            },
        )
        transcript.close()
        (OUT / "mesh-notes.json").write_text(
            json.dumps(notes, ensure_ascii=True) + "\n"
        )
        summary = {
            "candidate": candidate,
            "elapsed_seconds": time.time() - start,
            "checks": len(results),
            "passed": sum(r["passed"] for r in results),
            "failed": [r for r in results if not r["passed"]],
            "notes": len(notes),
            "read_checks": sum(r["check"].startswith("read/") for r in results),
            "scope": "low-level helpers; both sender and recipient, protocols 01/02/04/05; two account pairs, size/UTF-8 boundaries and negative decryption cases; no automatic high-level PQ or replay-state claim",
        }
        (OUT / "mesh-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
        print(json.dumps(summary, indent=2), flush=True)
    return 2 if infrastructure_error else (1 if summary["failed"] else 0)


if __name__ == "__main__":
    raise SystemExit(main())
