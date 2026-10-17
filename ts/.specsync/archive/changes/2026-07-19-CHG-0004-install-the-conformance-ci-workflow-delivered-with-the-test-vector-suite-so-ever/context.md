---
change: CHG-0004-install-the-conformance-ci-workflow-delivered-with-the-test-vector-suite-so-ever
artifact: context
---

# Context

The conformance test-vector suite merged in #32 ships 79 protocol vectors plus a ready CI template at `conformance/ci/conformance.yml`, but the template is not installed: nothing in `.github/workflows/` runs the vectors today. The suite exists to catch protocol drift — any change that alters deterministic derivation or encoding bytes should fail CI before merge. Installing the template completes the #32 deliverable.
