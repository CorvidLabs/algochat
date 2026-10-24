#!/usr/bin/env python3
"""Prove a Godot everyday note against the six AlgoChat libraries.

Builds the GDExtension and the existing write01/read01 helpers, then checks
twelve opens: six readers on the Godot note, and Godot on one note from each
library. Writes evidence only under --output, which must be a new directory
outside this checkout. Exit 0 means the opens passed, 1 means a note failed,
and 2 means the run could not complete.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import select
import shutil
import subprocess
import sys
from pathlib import Path

LANGS = ["ts", "go", "rs", "py", "kt", "swift"]
ALICE = "11" * 32
BOB = "22" * 32
GODOT_TEXT = "hello from godot"
NOTICE = "Addresses, timing, and amounts are public."


class Tool:
    def __init__(self, name: str, cmd: list[str], cwd: Path, out: Path, timeout: float):
        self.name = name
        self.seq = 0
        self.timeout = timeout
        self.err = (out / f"{name}.stderr").open("w")
        self.p = subprocess.Popen(
            cmd,
            cwd=cwd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=self.err,
            text=True,
            bufsize=1,
        )

    def call(self, body: dict) -> dict:
        self.seq += 1
        request = {"id": self.seq, **body}
        assert self.p.stdin is not None and self.p.stdout is not None
        self.p.stdin.write(json.dumps(request) + "\n")
        self.p.stdin.flush()
        if not select.select([self.p.stdout], [], [], self.timeout)[0]:
            raise RuntimeError(f"{self.name} timeout on {body.get('op')}")
        line = self.p.stdout.readline()
        if not line:
            raise RuntimeError(f"{self.name} exited {self.p.poll()}")
        response = json.loads(line)
        if response.get("id") != self.seq:
            raise RuntimeError(f"{self.name} wrong response id {response}")
        return response

    def stop(self) -> None:
        if self.p.poll() is None:
            self.p.terminate()
            try:
                self.p.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.p.kill()
                self.p.wait(timeout=10)
        if self.p.stdin:
            self.p.stdin.close()
        if self.p.stdout:
            self.p.stdout.close()
        self.err.close()


def fail(message: str, code: int) -> int:
    print(message, file=sys.stderr)
    return code


def java_runs(path: Path) -> bool:
    proc = subprocess.run([str(path), "-version"], capture_output=True, text=True, check=False)
    return proc.returncode == 0


def resolve_java(explicit: str | None) -> Path | None:
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit))
    java_home = os.environ.get("JAVA_HOME")
    if java_home:
        candidates.append(Path(java_home) / "bin/java")
    candidates.extend(
        [
            Path("/opt/homebrew/opt/openjdk@17/bin/java"),
            Path("/usr/local/opt/openjdk@17/bin/java"),
        ]
    )
    located = shutil.which("java")
    if located:
        candidates.append(Path(located))
    for candidate in candidates:
        if candidate.is_file() and java_runs(candidate):
            return candidate
    return None


def library_name(system: str) -> str:
    if system == "Darwin":
        return "libalgochat_godot.dylib"
    if system == "Windows":
        return "algochat_godot.dll"
    return "libalgochat_godot.so"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--timeout", default=60, type=float)
    parser.add_argument("--build-timeout", default=600, type=float)
    parser.add_argument("--godot", default=os.environ.get("GODOT4_BIN", "godot"))
    parser.add_argument("--gradle", default="./gradlew")
    parser.add_argument("--java")
    parser.add_argument("--python")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    out = args.output.resolve()
    if out.exists() or out.is_relative_to(root):
        return fail("--output must be a new directory outside the checkout", 2)
    if args.timeout <= 0 or args.build_timeout <= 0:
        return fail("timeouts must be positive", 2)
    scene = (root / "godot/example/chat.tscn").read_text()
    if NOTICE not in scene:
        return fail("chat scene is missing the public-metadata notice", 1)

    out.mkdir(parents=True)
    (out / "tools").mkdir()
    godot = shutil.which(args.godot) or args.godot
    if not Path(godot).is_file():
        return fail(f"missing Godot binary {args.godot}", 2)
    env = os.environ.copy()
    env["GODOT4_BIN"] = godot
    extension = root / "godot/extension"
    build = subprocess.run(
        ["cargo", "build", "--manifest-path", str(extension / "Cargo.toml")],
        cwd=root,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=args.build_timeout,
        check=False,
    )
    (out / "build-godot.log").write_text(build.stdout)
    if build.returncode:
        return fail("Godot extension build failed; see build-godot.log", 2)
    built = extension / "target/debug" / library_name(platform.system())
    if not built.is_file():
        return fail(f"extension library missing at {built}", 2)
    dest = root / "godot/example/bin/debug"
    dest.mkdir(parents=True, exist_ok=True)
    shutil.copy2(built, dest / built.name)
    godot_meta = root / "godot/example/.godot"
    godot_meta.mkdir(parents=True, exist_ok=True)
    (godot_meta / "extension_list.cfg").write_text("res://algochat.gdextension\n")

    python = args.python or (
        str(root / "py/.venv/bin/python")
        if (root / "py/.venv/bin/python").is_file()
        else "python3"
    )
    java = resolve_java(args.java)
    if java is None:
        return fail("missing Java runtime; set JAVA_HOME to JDK 17", 2)
    build_env = os.environ.copy()
    build_env["JAVA_HOME"] = str(java.parent.parent)
    gradle = args.gradle
    builds = [
        ("go", ["go", "build", "-o", str(out / "tools/pqcross-go"), "./cmd/pqcross"], root / "go"),
        ("rs", ["cargo", "build", "--bin", "pqcross"], root / "rs"),
        ("kt", [gradle, "pqioClasspath", "--no-daemon"], root / "kt"),
        ("swift", ["swift", "build", "--product", "pqcross"], root),
    ]
    for language, command, cwd in builds:
        executable = shutil.which(command[0]) if "/" not in command[0] else str((cwd / command[0]).resolve())
        if not executable or not Path(executable).is_file():
            return fail(f"{language}: missing build tool {command[0]}", 2)
        command[0] = executable
        proc = subprocess.run(
            command,
            cwd=cwd,
            env=build_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=args.build_timeout,
            check=False,
        )
        (out / f"build-{language}.log").write_text(proc.stdout)
        if proc.returncode:
            return fail(f"{language}: helper build failed; see build-{language}.log", 2)

    classpath = (root / "kt/build/pqio.classpath").read_text().strip()
    commands = {
        "ts": (["bun", "scripts/pq-io.ts"], root / "ts"),
        "go": ([str(out / "tools/pqcross-go")], root),
        "rs": ([str(root / "rs/target/debug/pqcross")], root),
        "py": ([python, str(root / "py/tools/pq_io.py")], root),
        "kt": ([str(java), "-cp", classpath, "com.corvidlabs.algochat.PQIOKt"], root / "kt"),
        "swift": ([str(root / ".build/debug/pqcross")], root),
    }
    tools: dict[str, Tool] = {}
    checks: list[dict] = []
    try:
        for name, (command, cwd) in commands.items():
            tools[name] = Tool(name, command, cwd, out, args.timeout)
        notes = []
        for name, tool in tools.items():
            text = f"hello from {name}"
            written = tool.call(
                {"op": "write01", "aliceSeed": ALICE, "bobSeed": BOB, "text": text}
            )
            ok = bool(written.get("ok") and written.get("note"))
            checks.append({"check": f"write/{name}", "passed": ok, "error": written.get("error")})
            if not ok:
                print("FAIL", f"write/{name}", written.get("error"), flush=True)
                continue
            notes.append({"writer": name, "text": text, "note": written["note"]})
        inbox = out / "inbox.json"
        outbox = out / "outbox.json"
        inbox.write_text(
            json.dumps(
                {
                    "alice_seed": ALICE,
                    "bob_seed": BOB,
                    "seal_text": GODOT_TEXT,
                    "notes": notes,
                }
            )
        )
        godot_run = subprocess.run(
            [
                godot,
                "--headless",
                "--path",
                str(root / "godot/example"),
                "--script",
                "res://parity_check.gd",
                "--",
                "--inbox",
                str(inbox),
                "--outbox",
                str(outbox),
            ],
            cwd=root,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=args.timeout,
            check=False,
        )
        (out / "godot.log").write_text(godot_run.stdout)
        if not outbox.is_file():
            checks.append({"check": "godot", "passed": False, "exit": godot_run.returncode})
            print("FAIL godot", godot_run.returncode, flush=True)
            return 1 if godot_run.returncode == 1 else 2
        opened = json.loads(outbox.read_text())
        note = opened.get("note", "")
        raw = bytes.fromhex(note) if note else b""
        header_ok = (
            opened.get("ok") is True
            and opened.get("notice") == NOTICE
            and len(raw) >= 2
            and raw[0] == 0x02
            and raw[1] == 0x01
            and opened.get("opened_own_sender") == GODOT_TEXT
            and opened.get("opened_own_recipient") == GODOT_TEXT
        )
        checks.append({"check": "godot-seal", "passed": header_ok})
        if not header_ok:
            print("FAIL godot-seal", flush=True)
        foreign = {row["writer"]: row for row in opened.get("opened", [])}
        for name in LANGS:
            row = foreign.get(name, {})
            passed = bool(row.get("ok"))
            checks.append({"check": f"godot-open/{name}", "passed": passed})
            if not passed:
                print("FAIL", f"godot-open/{name}", flush=True)
        for name, tool in tools.items():
            read = tool.call(
                {
                    "op": "read01",
                    "aliceSeed": ALICE,
                    "bobSeed": BOB,
                    "note": note,
                    "text": GODOT_TEXT,
                }
            )
            passed = (
                read.get("ok") is True
                and read.get("recipient") == GODOT_TEXT
                and read.get("sender") == GODOT_TEXT
            )
            checks.append({"check": f"read/{name}", "passed": passed, "error": read.get("error")})
            if not passed:
                print("FAIL", f"read/{name}", read.get("error"), flush=True)
    except Exception as error:  # noqa: BLE001 - report infrastructure separately from a bad note
        (out / "error.txt").write_text(str(error))
        print("ERROR", error, flush=True)
        return 2
    finally:
        for tool in tools.values():
            tool.stop()
        (out / "checks.json").write_text(json.dumps(checks, indent=2) + "\n")
    passed = [row for row in checks if row["passed"]]
    failed = [row for row in checks if not row["passed"]]
    print(f"{len(passed)} passed, {len(failed)} failed", flush=True)
    return 0 if checks and not failed else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.TimeoutExpired as error:
        print("ERROR timeout", error, file=sys.stderr)
        raise SystemExit(2)
