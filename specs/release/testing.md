# Release verification

REQ-release-1 through REQ-release-8 are qualified by the hosted Release qualification workflow and scripts/release/test_release.py. Unit tests exercise rejected evidence and provenance ranges. The hosted workflow exercises real artifacts outside the checkout. Root trust includes unit tests but does not imply all-language qualification. See docs/RELEASE.md for exact coverage and open owner gates.
