# Changelog

## 0.1.0

Initial public release.

**Check packs (9):** crud, pagination, rate-limits, binary, auth, validate-op, reference-integrity, operation-outcome, capability — every check traced to a motivating incident or published finding (docs/TRACEABILITY.md).

**Quality-gate architecture:**

- Gate policy in config: `allow` (accepted risks → INFO), `deny` (policy violations → FAIL), `require` (packs that must run — missing ones fail the gate); every transformation annotated in reports for auditability
- **Plugin system**: load external check packs via `--plugin <module>` (local file or npm package) — organizations extend the gate without forking; contract is the public `CheckPack` interface; example in `examples/custom-pack-example.mjs`

**Reports & CI:**

- Console summary, JSON, Markdown, visual HTML, and JUnit XML reports
- Behavior-matrix subcommand comparing multiple servers side by side
- `--fail-on fail|warn` exit-code policy; `fhir-verify.config.json` config file (CLI flags override); reusable GitHub Action (`action.yml`)

**Project:**

- Public API exports (`allPacks`, `FhirClient`, `applyGatePolicy`, `loadPlugins`, report renderers)
- Unit tests (node:test, zero extra dependencies) and CI workflow
- QA documentation: docs/TEST-PLAN.md, docs/TRACEABILITY.md; CONTRIBUTING with incident-driven-growth and safety invariants
