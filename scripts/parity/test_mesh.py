"""Runner protocol and fail-closed command-line checks; no language toolchains."""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from mesh import Tool

ROOT = Path(__file__).resolve().parents[2]


class HelperProtocolTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.output = Path(self.temp.name)

    def helper(self, program, timeout=1):
        tool = Tool(
            "fixture", [sys.executable, "-u", "-c", program], ROOT, self.output, timeout
        )
        self.addCleanup(tool.stop)
        return tool

    def test_reply_id_must_match_request(self):
        tool = self.helper(
            'import sys; sys.stdin.readline(); print(\'{"id": 99, "ok": true}\',flush=True)'
        )
        with self.assertRaisesRegex(RuntimeError, "wrong response id"):
            tool.call({"op": "identity"})

    def test_truncated_reply_is_execution_error(self):
        tool = self.helper('import sys; sys.stdin.readline(); print("{",flush=True)')
        with self.assertRaises(ValueError):
            tool.call({"op": "identity"})

    def test_exited_helper_cannot_count_as_pass(self):
        tool = self.helper("import sys; sys.stdin.readline(); sys.exit(7)")
        with self.assertRaisesRegex(RuntimeError, "exited"):
            tool.call({"op": "identity"})

    def test_unresponsive_helper_times_out_and_is_reaped(self):
        tool = self.helper(
            "import sys,time; sys.stdin.readline(); time.sleep(20)", 0.05
        )
        with self.assertRaisesRegex(RuntimeError, "timeout"):
            tool.call({"op": "identity"})
        tool.stop()
        self.assertIsNotNone(tool.p.returncode)
        # stop is idempotent for cleanup after interrupted runs.
        self.assertTrue(tool.err.closed)

    def test_missing_helper_is_not_skipped(self):
        with self.assertRaises(FileNotFoundError):
            Tool("missing", [str(self.output / "absent")], ROOT, self.output, 1)


class CommandLineTests(unittest.TestCase):
    def run_mesh(self, *arguments):
        return subprocess.run(
            [sys.executable, str(ROOT / "scripts/parity/mesh.py"), *arguments],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_existing_output_is_rejected_before_builds(self):
        with tempfile.TemporaryDirectory() as directory:
            result = self.run_mesh("--output", directory)
            self.assertEqual(result.returncode, 2)
            self.assertIn("new directory outside", result.stderr)

    def test_output_inside_checkout_is_rejected(self):
        result = self.run_mesh("--output", str(ROOT / "parity-output-must-not-exist"))
        self.assertEqual(result.returncode, 2)
        self.assertFalse((ROOT / "parity-output-must-not-exist").exists())


if __name__ == "__main__":
    unittest.main()
