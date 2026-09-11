# fhir-verify

**The operational basics every production FHIR integration depends on — 20+ checks across nine packs, in one run.**

Automated verification suite for FHIR R4 servers. Runs behavior checks that production
healthcare integrations actually break on — pagination dead-ends, invisible rate limits,
Binary content-negotiation traps, OAuth token-audience mistakes — and produces a traceable
report (console + JSON + Markdown + visual HTML + JUnit XML).

Every check pack encodes a failure mode observed in real clinical-platform operation,
generalized so any team can test any FHIR R4 server for it before it reaches production.
And not just ours: [docs/TRACEABILITY.md](docs/TRACEABILITY.md#field-evidence--the-same-failure-modes-in-the-wild)
maps each behavior class to publicly reported incidents across HAPI, Azure, Medplum, Aidbox,
Google, and Cerner — these failures are ecosystem-wide, not anecdotes.

## Why

Interoperable healthcare software in the United States runs on FHIR APIs (45 CFR
§ 170.315(g)(10), CMS interoperability rules). The failure modes this tool checks are not
cosmetic: an offset-paging dead-end silently strands patient records from a sync; an
invisible rate limit fails clinician-facing actions when background jobs consume the budget;
a wrong `Accept` header changes the shape of a `Binary` read between environments; an
`id_token` sent as a Bearer works until the day the server starts validating audiences.
Catching these classes of defect systematically — before deployment — is the point.

## Install / run

```bash
npm install
npm run build

# Against a local Medplum docker (default prefix /fhir/R4):
node dist/cli.js --server http://localhost:8103 --token <bearer> --packs all

# Against a HAPI-style base (prefix is part of the base path):
node dist/cli.js --server https://hapi.fhir.org --prefix /baseR4 --packs crud,pagination,binary

# Individual packs:
node dist/cli.js --server http://localhost:8103 --packs pagination,binary

# Public test servers (no auth required) — verified targets:
node dist/cli.js --server https://hapi.fhir.org --prefix /baseR4 --packs crud,pagination,rate-limits,binary,validate-op
node dist/cli.js --server https://server.fire.ly --prefix "" --packs crud,pagination,rate-limits,binary,validate-op
node dist/cli.js --server https://r4.smarthealthit.org --prefix "" --packs crud,pagination,rate-limits,binary,validate-op

# With client credentials (enables the auth pack):
node dist/cli.js --server http://localhost:8103 \
  --client-id <id> --client-secret <secret>
```

Exit code is non-zero when any check fails (`--fail-on warn` also gates on warnings), so it drops into CI as a gate. Every run emits console, JSON, Markdown, styled HTML, and **JUnit XML** reports — CI systems render results natively. Defaults can live in `fhir-verify.config.json` (CLI flags override).

### Use as a quality gate

The suite is a policy-driven gate, not a fixed checklist. In `fhir-verify.config.json`:

```json
{
  "gate": {
    "require": ["crud", "validate-op"],
    "allow": ["binary.plain-json-trap"],
    "deny": ["reference-integrity.delete-protection"]
  }
}
```

- `allow` — check IDs whose WARN is an accepted, documented risk → reported as INFO
- `deny` — WARNs that violate _your_ policy → upgraded to FAIL (blocks the pipeline)
- `require` — packs that must have run; a gate whose checks silently don't run fails loudly

Every transformation is annotated in the reports (`[gate: accepted risk per policy]` / `[gate: denied by policy]`), so an auditor sees both the raw finding and the policy decision.

### Write your own checks

The suite is extensible — organizations and the community add their own packs without forking:

```bash
fhir-verify --server ... --plugin ./my-checks/org-policy.mjs --packs all
```

A pack is one module exporting `{ name, description, run(ctx) }` — see
[`examples/custom-pack-example.mjs`](examples/custom-pack-example.mjs) for a complete, commented
example (an org-specific CapabilityStatement dependency + a latency budget). House rules for
plugins are the same as for core packs (synthetic data, passive-safe); note that plugins execute
with full process privileges — load only code you trust. Checks worth sharing upstream follow
the incident-driven rule in [CONTRIBUTING.md](CONTRIBUTING.md).

### GitHub Action

```yaml
- uses: <owner>/fhir-verify@main
  with:
    server: https://staging.example.org
    prefix: /fhir/R4
    token: ${{ secrets.FHIR_TOKEN }}
    fail-on: warn
```

## Example: local Medplum v5.1.37

A run against a fresh local Medplum (docker, synthetic data only) — see
[`examples/medplum-v5.1.37-local-report.md`](examples/medplum-v5.1.37-local-report.md) —
confirms in a clean-room environment: the search offset cap returns HTTP 400 past 10,000
while next links are offset-based (pagination WARN), and `Binary` reads return raw bytes
for `Accept: application/json` but FHIR JSON for `application/fhir+json` (binary WARN).

## Check packs

| Pack                  | What it verifies                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `crud`                | Create → read → update → delete roundtrip integrity for a synthetic Patient                                                                      |
| `pagination`          | Next-link style (offset vs cursor), offset-cap behavior, cursor availability, unsorted-paging hazards                                            |
| `rate-limits`         | Whether clients can see their budget (`RateLimit` / `X-RateLimit-*`) and get standard `Retry-After` guidance — passive, never induces throttling |
| `binary`              | `Binary` read shape under `application/fhir+json` vs `application/json` vs default `Accept`                                                      |
| `auth`                | Client-credentials flow: `access_token` authorizes; `id_token` as Bearer is rejected (RFC 8725 audience validation)                              |
| `validate-op`         | Server `$validate` gate: present, passes a valid resource, flags a malformed one                                                                 |
| `reference-integrity` | Dangling-reference acceptance; delete protection for still-referenced resources                                                                  |
| `operation-outcome`   | Diagnosable `OperationOutcome` on three failure paths: missing resource, malformed body, unknown search parameter                                |
| `capability`          | `CapabilityStatement` served at `/metadata`; declared behaviors (Patient read, `$validate`) compared with observed ones                          |

## What fhir-verify is not

It is **not a profile validator**. For resource-level conformance — profiles,
terminology bindings, invariants — use the Firely or HAPI validators, Simplifier
Quality Control, or your server's `$validate` with profiles. `fhir-verify` covers the
layer those tools don't: the **server's runtime behavior** (paging, limits, auth,
content negotiation) that production integrations actually break on. The `validate-op`
pack checks that the server's own validation gate exists and works — it does not replace it.

## QA documentation

The suite is organized as a QA artifact, not just code: [docs/TEST-PLAN.md](docs/TEST-PLAN.md) (scope, out-of-scope with owners, result semantics, entry/exit criteria) and [docs/TRACEABILITY.md](docs/TRACEABILITY.md) (every check traced to its motivating incident, risk tier, and the spec it exercises — plus acknowledged coverage gaps).

## Development

```bash
npm ci && npm run build
npm test          # unit tests (node:test, zero extra dependencies)
```

CI builds and tests every push (`.github/workflows/ci.yml`).

## Comparing servers

Turn several run reports into one side-by-side behavior matrix:

```bash
fhir-verify matrix hapi=reports/hapi.json medplum=reports/medplum.json --out matrix.html
```

Each `label=report.json` becomes a column; the HTML shows every check's status across servers.

## Credentials

Prefer `FHIR_VERIFY_TOKEN` (and `FHIR_VERIFY_SERVER`) environment variables over `--token` on
the command line — argv is visible in shell history and `ps` output on shared machines and CI
runners. Note that plugins can also be listed in `fhir-verify.config.json` (`"plugin": [...]`);
like `--plugin`, they run with full process privileges, and the CLI announces every loaded
plugin on stderr — treat a config file in the working directory as executable code review-wise.

## Safety rules

- **Synthetic data only.** The tool creates its own test resources (stamped with the
  identifier system `urn:fhir-verify:synthetic`) and deletes them at the end of the run.
- **Never point it at a production system or any server holding real patient data.**
- The rate-limit pack is deliberately passive: it inspects headers on normal responses and
  will not attempt to exhaust a server's quota.

## Roadmap

- State-transition packs (Encounter/Task/ServiceRequest workflows)
- Report mapping to § 170.315(g)(10) certification themes
- Synthetic FHIR bundle generator for workflow-level scenarios

## Contributing

Issues and PRs welcome. Please describe the real-world failure mode a proposed check
addresses — this suite grows by encoding production lessons, not spec trivia.

## Maintainer

Built and maintained by **Pavlo Palamarchuk** ([Palamarchuk Technologies LLC](https://palamarchuk.tech), Sacramento, CA) — automated verification for FHIR-based clinical applications. Consulting inquiries welcome.

## License

Apache-2.0 · Copyright © 2026 Pavlo Palamarchuk / Palamarchuk Technologies LLC. See [NOTICE](NOTICE).
