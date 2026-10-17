---
change: CHG-0002-replace-the-incomplete-no-spec-rationale-with-a-stable-full-library-algochat-con
artifact: context
---

# Context

The rollout change had deliberately recorded a no-spec-change rationale. That
left a nearly 10,000-line security-sensitive protocol library without a
canonical product contract even though the repository already has extensive
native tests and public documentation. The owner requires full SDD coverage,
so this successor documents the existing implementation without changing it.
