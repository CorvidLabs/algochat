# Release verification

REQ-release-1 through REQ-release-8 are qualified by the hosted Release qualification workflow and scripts/release/test_release.py. Unit tests exercise rejected evidence and provenance ranges. The hosted workflow exercises real artifacts outside the checkout. Root trust includes unit tests but does not imply all-language qualification. See docs/RELEASE.md for exact coverage and open owner gates.


Local evidence replay uses `python3 scripts/parity/mesh.py --output NEWDIR` and requires all six helpers, including Apple ML-KEM. `python3 -m unittest discover -s scripts/parity -p 'test_*.py' -v` checks fail-closed helper protocol, output-directory and regression-result classification behavior without language toolchains.

Opt-in `rust_replay.py` and `swift_history.py` must return exit 1 on audited `237a974` for the actual replay/history invariant failures; missing tools, incomplete output or build errors are exit 2 and cannot substitute for a reproduction. Run them in temporary external output directories and verify source preservation. A future implementation fix must turn the same invariant probes green. Current probes are manual, distinct from the existing root 18 release-check tests and hosted package qualification.
