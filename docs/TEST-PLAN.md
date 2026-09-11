# fhir-verify — Test Plan

*This document applies classical QA test-planning discipline to the suite itself, so that what the tool checks — and, just as importantly, what it does not — is explicit and reviewable.*

## 1. Objective

Verify the **operational behavior** of FHIR R4 servers: the server-boundary behaviors that production integrations break on, which resource/profile validation and certification conformance testing do not exercise.

## 2. Scope

**In scope:** CRUD roundtrip integrity; pagination behavior (link style, offset caps, cursor availability); rate-limit transparency (headers, standard guidance); Binary content negotiation; OAuth token-audience handling; presence and honesty of the server-side `$validate` gate; referential-integrity behavior (dangling references, delete protection); error diagnosability (`OperationOutcome` quality on common failure paths); CapabilityStatement honesty (declared vs observed behavior).

**Out of scope (by design, with owners):**
- Resource/profile/terminology conformance → Firely & HAPI validators, server `$validate` with profiles
- Certification capability requirements (US Core, SMART, Bulk Data) → ONC Inferno test kits
- Load/performance/stress → k6, JMeter, vendor benchmarks
- Security penetration testing → dedicated security tooling
- Partner-connection/integration coordination → continuous partner-testing platforms

## 3. Test design technique

**Incident-driven, risk-based.** Every check generalizes a documented production failure mode (see TRACEABILITY.md) and is prioritized by a risk framework: clinical consequence × data-integrity criticality × failure detectability, with silent boundary failures treated as risk amplifiers.

## 4. Test data strategy

Synthetic only. Every created resource carries identifier system `urn:fhir-verify:synthetic` and is deleted at run end. The suite must never run against systems holding real patient data.

## 5. Environments

Any FHIR R4 endpoint: local deployments (e.g., Medplum Docker), public sandboxes (HAPI, Firely, SMART Health IT), or authorized staging systems. Path prefix and auth are configurable per run.

## 6. Entry / exit criteria

- **Entry:** server reachable; for auth pack, client credentials supplied.
- **Exit:** all selected packs executed; reports (console, JSON, Markdown, HTML, JUnit XML) written; synthetic resources cleaned up.
- **CI gate:** any FAIL → non-zero exit code → pipeline stops.

## 7. Result semantics (severity model)

| Status | Meaning | Gate impact |
|---|---|---|
| FAIL | Behavior violates a contract the check asserts (e.g., $validate passes malformed data) | Blocks (non-zero exit) |
| WARN | Behavior is spec-permissible but operationally hazardous (offset cap + offset links; invisible budgets; Accept divergence) | Reported; consumer decides |
| PASS | Asserted behavior confirmed | — |
| INFO | Observation without a pass/fail contract (e.g., link style on a small dataset) | — |
| SKIP | Preconditions absent (no credentials; feature not exposed) — never silently omitted | — |

## 8. Known limitations & risks of the suite itself

Single-run observations (no statistical weight); passive rate-limit design reports *observability*, not provoked behavior; "no cap observed at offset N" does not prove absence of a cap; sandbox configurations may differ from production defaults.

## 9. Gate policy semantics

The exit-code gate is policy-driven per deployment: organizations may accept documented risks (`allow` → INFO with annotation), tighten policy (`deny` → FAIL), and declare packs whose absence itself fails the gate (`require`). Raw findings are never suppressed — policy decisions are annotated inline so reports remain auditable.

## 10. Maintenance triggers

New check: only from a documented real-world incident (CONTRIBUTING.md). Existing checks: reviewed on FHIR/IG specification changes and on any probed server's major version change.
