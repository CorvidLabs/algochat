---
id: CHG-0003-migrate-the-typescript-algochat-package-to-nodenext-module-resolution-so-the-com
state: archived
type: migration
base_commit: e628bb5d8813c3d6c78ff2b594aae6ff82e55a5a
---

# Migrate the TypeScript AlgoChat package to NodeNext module resolution so the compiled dist output is importable by raw Node.js ESM; rewrite relative import specifiers with explicit .js extensions and directory imports to index.js, with no public API or behavior change

## Intent

Migrate the TypeScript AlgoChat package to NodeNext module resolution so the compiled dist output is importable by raw Node.js ESM; rewrite relative import specifiers with explicit .js extensions and directory imports to index.js, with no public API or behavior change

## Affected Canonical Specs

- None

## Acceptance Criteria

- tsconfig uses NodeNext module and moduleResolution; bun run tsc type-check passes; bun run build emits dist; all 454 Bun tests pass; raw Node.js ESM can import the compiled package entrypoint; no public export
- protocol behavior
- or test expectation changes relative to main

## No-spec Rationale

Packaging-only migration: tsconfig module/moduleResolution switch to NodeNext and mechanical import-specifier rewrites across 44 files; public exports, protocol behavior, and tests are unchanged, so the canonical algochat spec remains accurate
