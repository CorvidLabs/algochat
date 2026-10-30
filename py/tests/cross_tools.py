"""
Test-only driver for each implementation's cross-language tool.

Every language ships a small program that reads JSON lines on stdin
(``{"id", "op", ...}``) and answers ``{"id", "ok", ...}``. These are the same
commands ts/scripts/group-bot-localnet.ts uses. Build them first:

    (cd go && go build -o /tmp/algochat-pqcross-go ./cmd/pqcross)
    (cd rs && cargo build --bin pqcross)
    (cd kt && ./gradlew pqioClasspath)
    (cd ts && bun install)

Swift's tool needs macOS 26 for ML-KEM-768, so on Linux Swift reads a
recorded file through ``swift test`` instead (see ``swift_replay``).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
GO_TOOL = os.environ.get("ALGOCHAT_PQCROSS_GO", "/tmp/algochat-pqcross-go")
MESH = ("ts", "go", "rs", "py", "kt")


class ToolMissing(RuntimeError):
    """A language's tool is not built or its toolchain is not installed."""


def _command(lang: str) -> tuple[list[str], Path, dict[str, str]]:
    env = dict(os.environ)
    if lang == "ts":
        if shutil.which("bun") is None or not (ROOT / "ts/node_modules").is_dir():
            raise ToolMissing("ts: needs bun and `bun install` in ts/")
        return ["bun", "scripts/pq-io.ts"], ROOT / "ts", env
    if lang == "go":
        if not Path(GO_TOOL).is_file():
            raise ToolMissing(f"go: build {GO_TOOL} (see module docstring)")
        return [GO_TOOL], ROOT, env
    if lang == "rs":
        tool = ROOT / "rs/target/debug/pqcross"
        if not tool.is_file():
            raise ToolMissing("rs: run `cargo build --bin pqcross` in rs/")
        return [str(tool)], ROOT, env
    if lang == "py":
        env["PYTHONPATH"] = str(ROOT / "py/src")
        return [sys.executable, "py/tools/pq_io.py"], ROOT, env
    if lang == "kt":
        classpath = ROOT / "kt/build/pqio.classpath"
        if shutil.which("java") is None or not classpath.is_file():
            raise ToolMissing("kt: needs java and `./gradlew pqioClasspath` in kt/")
        return (
            ["java", "-cp", classpath.read_text().strip(), "com.corvidlabs.algochat.PQIOKt"],
            ROOT / "kt",
            env,
        )
    raise ValueError(lang)


class Tool:
    """One running tool process, asked one request at a time."""

    def __init__(self, lang: str) -> None:
        command, cwd, env = _command(lang)
        self.lang = lang
        self._next = 0
        self._proc = subprocess.Popen(
            command,
            cwd=cwd,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )

    def ask(self, op: str, **fields: Any) -> dict[str, Any]:
        self._next += 1
        request = {"id": self._next, "op": op, **fields}
        assert self._proc.stdin is not None and self._proc.stdout is not None
        self._proc.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
        self._proc.stdin.flush()
        line = self._proc.stdout.readline()
        if not line:
            raise RuntimeError(f"{self.lang} tool exited: {self._stderr()}")
        reply = json.loads(line)
        if reply.get("id") != self._next:
            raise RuntimeError(f"{self.lang} answered id {reply.get('id')}, expected {self._next}")
        if reply.get("ok") is False or "error" in reply:
            raise ToolError(self.lang, str(reply.get("error")))
        return reply

    def _stderr(self) -> str:
        self._proc.kill()
        return (self._proc.stderr.read() if self._proc.stderr else "")[-2000:]

    def close(self) -> None:
        if self._proc.stdin:
            self._proc.stdin.close()
        try:
            self._proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self._proc.kill()


class ToolError(RuntimeError):
    def __init__(self, lang: str, message: str) -> None:
        super().__init__(f"{lang}: {message}")
        self.lang = lang


def swift_replay(record_path: Path, done_path: Path) -> subprocess.CompletedProcess[str]:
    """Runs the Swift LocalNet replay test on ``record_path``.

    The test writes ``done_path`` as its last step, so a skipped or filtered-out
    test cannot pass for a run.
    """
    if shutil.which("swift") is None:
        raise ToolMissing("swift: needs a Swift 6 toolchain on PATH")
    env = dict(os.environ)
    env["ALGOCHAT_DM_LOCALNET_RECORD"] = str(record_path)
    env["ALGOCHAT_DM_LOCALNET_DONE"] = str(done_path)
    return subprocess.run(
        ["swift", "test", "--filter", "AgentDirectLocalnetTests"],
        cwd=ROOT / "swift",
        env=env,
        capture_output=True,
        text=True,
        timeout=1800,
        check=False,
    )
