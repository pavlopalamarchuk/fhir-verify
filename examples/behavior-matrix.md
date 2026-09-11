# FHIR Server Behavior Matrix — v0.1 (September 2026)

Four implementations, six operational behavior packs, one command each. All runs used
synthetic data only, against public sandboxes or a fresh local deployment. Reports for
every cell are in `fhir-verify-reports/` history (JSON + Markdown).

| Behavior | HAPI (hapi.fhir.org) | Medplum v5.1.37 (local) | Firely (server.fire.ly) | SMART Health IT (r4.smarthealthit.org) |
|---|---|---|---|---|
| CRUD roundtrip | PASS (delete→410) | PASS (delete→410) | PASS (204/410) | PASS (200/410) |
| Next-link style | opaque page tokens | offset-based (per docs; small dataset in run) | other | other |
| Offset cap at 10,001 | none observed (200) | **HTTP 400 — WARN** | none observed (200) | none observed (200) |
| Cursor pagination observed | no | no (offset links) | no | no |
| Rate-limit budget visible | **none — WARN** | `RateLimit` draft header — PASS | **none — WARN** | **none — WARN** |
| Binary: `application/fhir+json` | JSON resource | JSON resource | JSON resource | JSON resource |
| Binary: `application/json` | **raw bytes — WARN** | **raw bytes — WARN** | JSON resource — PASS | **raw bytes — WARN** |
| Binary: default `*/*` | raw | raw | raw | raw |
| $validate: exists + flags malformed | (not run) | PASS / PASS | PASS / PASS | PASS / PASS |

## Three observations

1. **Four servers, three different Binary content-negotiation profiles.** The same two-header
   probe returns three distinct behavior combinations across implementations — the
   portability trap is real and vendor-specific. Only `application/fhir+json` is safe everywhere.
2. **Rate-limit opacity is the norm, not the exception.** Three of four servers expose no
   budget information on normal responses; Medplum is the only one emitting the draft
   `RateLimit` header. Clients discover limits by failing.
3. **The offset cap is implementation-specific** — present on Medplum (hard 400), absent on
   the other three at 10,001 — which is precisely why a portable probe matters: the same
   sync-job code is safe on one server and silently lossy on another.

*Caveats: single-run snapshots of public sandboxes (September 2026); sandbox configuration
may differ from vendors' production defaults; "no cap observed at 10,001" does not prove no
cap exists at higher offsets.*
