---
change: describe-the-repository-and-run-each-library-ci-only-when-that-library-changes
artifact: context
---

# Context

The import pull request put six libraries and the protocol into one repository. The README was the old protocol page with a table pasted on top. CI ran every language on every pull request, and the daily status job still checked out the old split repositories.
