---
change: implement-the-1-3-0-hybrid-session-in-python-kotlin-and-swift
artifact: testing
---

# Testing

pytest in py, ./gradlew test in kt, and swift test from the repository root. Each new test reads vectors/pq-mlkem768.json. The LocalNet capture at /tmp/pq-live.json is checked when the file is present.
