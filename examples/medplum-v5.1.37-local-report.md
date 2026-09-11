# fhir-verify report

- Server: http://localhost:8103
- Run: 2026-09-09T22:04:08.363Z → 2026-09-09T22:04:08.492Z
- Tool: fhir-verify v0.1.0

## Pack: crud

| Status | Check | Details |
|---|---|---|
| PASS | Create synthetic Patient | Created Patient/c0611890-fe2e-4cd4-b4cf-231d7afe31d8 (HTTP 201). |
| PASS | Read returns the stored resource as FHIR JSON | Read-back matches the created resource. |
| PASS | Update persists and versions the resource | Update persisted (versionId 78910f78-d660-44bd-873b-bc06eb3c3a7a). |
| PASS | Delete removes the resource (subsequent read is 404/410) | DELETE returned 200; subsequent read returned 410. |

## Pack: pagination

| Status | Check | Details |
|---|---|---|
| INFO | Pagination style of server-issued next links | No next link on a _count=1 search (dataset may hold fewer than 2 matches). |
| WARN | Server enforces a maximum search offset | Requests beyond the offset cap fail with HTTP 400. Combined with offset-based next links, sync jobs paging a large result set will crash mid-run and records past the cap become unreachable by offset pagination — a data-completeness hazard. Use cursor/keyset pagination for large sets. |
| INFO | Cursor pagination availability (_sort=_lastUpdated ascending) | No cursor-based next link observed; verify the server's documented pagination limits before relying on offset paging for large datasets. |
| INFO | Unsorted offset paging over a mutating dataset | Reminder check: offset paging without an explicit _sort can silently skip or duplicate records when the dataset changes between pages. Sync jobs should always pass an explicit _sort plus cursor/keyset iteration. |

## Pack: rate-limits

| Status | Check | Details |
|---|---|---|
| PASS | Rate-limit budget is visible to clients on normal responses | Server exposes a RateLimit header (""requests";r=59983;t=30"). Clients can implement proactive backoff. |
| INFO | Standard Retry-After guidance on 429 responses | Not observable without inducing throttling (this pack will not do that). Note: many stacks emit only the draft RateLimit header on 429; standard HTTP clients and proxies act only on Retry-After — verify the server sends it when throttling, and that interactive traffic is isolated from background-job quota consumption. |

## Pack: binary

| Status | Check | Details |
|---|---|---|
| INFO | Binary read shape depends on the Accept header | Accept application/fhir+json → fhir-json; application/json → raw (text/plain; charset=utf-8); */* → raw (text/plain; charset=utf-8). Integrations must send application/fhir+json when they expect the JSON resource — application/json may still yield raw bytes. |
| WARN | application/json vs application/fhir+json divergence | The two Accept values return different shapes — a portability trap between environments and server versions. Pin clients to application/fhir+json. |
