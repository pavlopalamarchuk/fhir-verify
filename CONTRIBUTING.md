# Contributing to fhir-verify

Thanks for your interest. Two rules keep this project honest:

## 1. Checks grow from real incidents

Every check pack in this suite encodes a production failure mode that actually
happened, generalized so any team can probe any FHIR R4 server for it. To propose
a new check, open an issue describing:

- the real-world failure you observed (anonymized — no PHI, no internal URLs,
  no confidential details);
- why resource/profile validation and certification testing could not have
  caught it;
- how a bounded, passive-safe probe could detect the behavior on any server
  using synthetic data only.

Spec-derived checks without a motivating incident are out of scope — that layer
belongs to conformance suites like Inferno and the profile validators.

## 2. Safety invariants are non-negotiable

- Synthetic data only, tagged with `urn:fhir-verify:synthetic`, cleaned up at run end.
- No probe may flood, fuzz, or attempt to exhaust a server's resources or quota.
- Never point the tool at systems holding real patient data; PRs weakening these
  invariants will be declined.

## Development

```bash
npm ci
npm run build
npm test        # node:test, no extra dependencies
```

Please keep PRs focused and include a test where behavior changes.
