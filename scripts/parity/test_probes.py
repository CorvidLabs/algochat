"""Regression probe evidence cannot pass on missing reports or inconsistent exits."""

import json
import tempfile
import unittest
from pathlib import Path

from rust_replay import _read_probe_report
from swift_history import read_observation


class ProbeClassificationTests(unittest.TestCase):
    def rust_report(self, **changes):
        value = {
            "iterations": 100,
            "duplicate_trials": 0,
            "both_rejected_trials": 0,
            "unexpected_plaintext_returns": 0,
            "successful_plaintext_returns": 100,
        }
        value.update(changes)
        return "ALGOCHAT_PARITY_REPLAY_RESULT=" + json.dumps(value)

    def test_rust_no_executed_probe_is_infrastructure_failure(self):
        with self.assertRaises(ValueError):
            _read_probe_report("test result: ok. 0 passed", 100, 0)

    def test_rust_duplicate_plaintext_is_behavior_failure(self):
        _, passed = _read_probe_report(
            self.rust_report(duplicate_trials=100, successful_plaintext_returns=200),
            100,
            101,
        )
        self.assertFalse(passed)

    def test_rust_false_green_command_status_is_rejected(self):
        with self.assertRaises(ValueError):
            _read_probe_report(
                self.rust_report(
                    duplicate_trials=100, successful_plaintext_returns=200
                ),
                100,
                0,
            )

    def test_rust_inconsistent_counts_are_rejected(self):
        with self.assertRaises(ValueError):
            _read_probe_report(self.rust_report(successful_plaintext_returns=0), 100, 0)

    def test_swift_missing_phase_checks_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "observations.json"
            path.write_text(
                json.dumps(
                    {
                        "schema": 1,
                        "phase": "restart",
                        "checks": [],
                        "violations": [],
                        "result": "passed",
                    }
                )
            )
            with self.assertRaises(RuntimeError):
                read_observation(path, "restart", 0)

    def test_swift_false_green_command_status_is_rejected(self):
        name = "same_transaction_after_process_restart"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "observations.json"
            path.write_text(
                json.dumps(
                    {
                        "schema": 1,
                        "phase": "restart",
                        "checks": [{"name": name, "passed": False}],
                        "violations": [name],
                        "result": "behavior_violation",
                    }
                )
            )
            with self.assertRaises(RuntimeError):
                read_observation(path, "restart", 0)


if __name__ == "__main__":
    unittest.main()
