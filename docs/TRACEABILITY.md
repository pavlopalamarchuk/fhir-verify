# Traceability Matrix

*Requirement→test traceability, QA-style: every check traces back to a motivating production incident (anonymized) and forward to the specification or standard it exercises, with its risk tier under the suite's risk model (clinical consequence × data-integrity criticality × failure detectability).*

| Check ID | Motivating incident (anonymized) | Behavior class | Risk tier* | Spec / standard exercised | Status semantics |
|---|---|---|---|---|---|
| crud.create / read / update / delete | Baseline (no incident — foundation for all other packs) | B1 Workflow integrity | prerequisite | FHIR R4 RESTful API | FAIL on broken roundtrip |
| pagination.next-link-style | Nightly patient sync followed server-issued links into a hard failure | B2 Pagination | T1 amplifier (silent, boundary) | FHIR R4 §Paging | WARN on offset-based links |
| pagination.offset-cap | Same incident: records past cap silently never synced (data completeness) | B2 Pagination | T1 amplifier | server-specific limit behavior | WARN on hard cap |
| pagination.cursor-support | Same incident: safe alternative availability | B2 Pagination | mitigation probe | server cursor implementation | PASS if available |
| pagination.unsorted-stability | Industry-known skip/duplicate hazard on mutating datasets | B2 Pagination | advisory | FHIR search semantics | INFO (reminder) |
| rate-limits.headers-present | Background jobs exhausted shared budget; clinician-facing actions failed with generic errors | B3 Rate-limit transparency | T3→T1 spillover | draft-ietf-httpapi-ratelimit-headers | WARN if invisible |
| rate-limits.retry-after-guidance | Same incident: off-the-shelf clients honor only Retry-After | B3 Rate-limit transparency | advisory | RFC 9110 §10.2.3 | INFO (passive) |
| binary.accept-contract | Document display broke between environments on a one-word Accept difference | B4 Content negotiation | T2 (clinical documents) | FHIR R4 Binary native-form serving | INFO (documents contract) |
| binary.plain-json-trap | Same incident, generalized portability trap | B4 Content negotiation | T2 | media-type semantics | WARN on divergence |
| auth.access-token-works | Platform-wide 401 outage when audience validation was enforced | B5 Token-audience hygiene | T1 (all workflows) | RFC 8725 §3.9, §3.12 | FAIL if rejected |
| auth.id-token-rejected | Same incident: id_token had been silently accepted for years | B5 Token-audience hygiene | T1 | RFC 8725; OIDC Core | WARN if accepted |
| validate-op.available | Spec observation: not all servers expose $validate | B6 Validation gate | T2 | FHIR R4 $validate operation | WARN if absent |
| validate-op.accepts-valid | A gate that rejects well-formed resources blocks legitimate writes | B6 Validation gate | T2 | FHIR R4 $validate operation | WARN if valid resource rejected |
| validate-op.rejects-invalid | Gate that passes broken data turns client bugs into data-integrity incidents | B6 Validation gate | T2 | FHIR R4 datatypes / bindings | FAIL if malformed passes |
| reference-integrity.dangling-accepted | Dangling clinical references unreachable via patient-centric queries | B7 Reference integrity | T1 amplifier (silent) | FHIR R4 references (server policy) | WARN if accepted |
| reference-integrity.delete-protection | Deleting referenced resources silently orphans dependent clinical data | B7 Reference integrity | T1 amplifier (silent) | server delete policy | WARN if unprotected |
| operation-outcome.not-found / parse-error | Clinicians saw generic "API request error"; true cause invisible at every layer | B8 Error diagnosability | cross-tier | FHIR R4 OperationOutcome | WARN if undiagnosable |
| operation-outcome.unknown-param | Typoed search parameter silently returns unfiltered results | B8 Error diagnosability | T2 | FHIR search lenient/strict handling | WARN if silent |
| capability.metadata-available / *-declared-vs-observed | Literature-documented divergence between declared and actual behavior | B9 Capability honesty | cross-tier | FHIR R4 capabilities interaction | WARN on divergence |

\* Risk tier per the suite's risk model (clinical consequence × data criticality × detectability); "T1 amplifier" = silent boundary failure rule.

## Field evidence — the same failure modes in the wild

*Beyond the motivating incidents, every behavior class corresponds to publicly reported pain on major FHIR platforms (checked September 2026). This is what "checks grow from real incidents" looks like ecosystem-wide.*

| Behavior class | Public incidents (sample) |
|---|---|
| B2 Pagination / silent data loss | [hapi-fhir#4027](https://github.com/hapifhir/hapi-fhir/issues/4027) next link silently missing → truncated results · [hapi-fhir#5346](https://github.com/hapifhir/hapi-fhir/issues/5346) broken next links · [Aidbox#511](https://github.com/Aidbox/Issues/issues/511) unstable pagination skips/duplicates · [microsoft/fhir-server#1567](https://github.com/microsoft/fhir-server/issues/1567) next URL 404 · [fhir-data-pipes#1109](https://github.com/google/fhir-data-pipes/issues/1109) 4.2M of 16.9M resources landed · [medplum#10387](https://github.com/medplum/medplum/issues/10387) cursor fails to progress |
| B3 Rate-limit transparency | [medplum#6747](https://github.com/medplum/medplum/issues/6747) "surprised to discover they were being rate limited" · [medplum#4587](https://github.com/medplum/medplum/issues/4587) 429s absent from logs · [microsoft/fhir-server#2615](https://github.com/microsoft/fhir-server/pull/2615) 429s weren't valid FHIR · [Google quota best-practices](https://cloud.google.com/healthcare-api/docs/best-practices-quota-management) · [chat.fhir.org throttling thread](https://chat-archive.fhir.org/stream/179166-implementers/topic/FHIR.20Throttling.html) — no spec guidance exists |
| B4 Binary content negotiation | [hapi-fhir#5078](https://github.com/hapifhir/hapi-fhir/issues/5078) wrong body per Accept · [hapi-fhir#6630](https://github.com/hapifhir/hapi-fhir/issues/6630) · [IHE MHD#233](https://github.com/IHE/ITI.MHD/issues/233) a standards profile tripped on Binary read · Cerner 406 threads (2018→) |
| B5 Token-audience hygiene | [SMART list: invalid 'aud'](https://groups.google.com/g/smart-on-fhir/c/zRQB5YgJGJs) · [Microsoft BAD_TOKEN/aud troubleshooting page](https://learn.microsoft.com/en-us/azure/healthcare-apis/fhir/troubleshoot-identity-provider-configuration) · InterSystems 2026.2 shipped configurable audiences to defuse exactly this |
| B7 Reference integrity | [microsoft/fhir-server#2281](https://github.com/microsoft/fhir-server/issues/2281) no integrity enforcement, silent deletes · HAPI $expunge corruption ([#4305](https://github.com/hapifhir/hapi-fhir/issues/4305), [#4092](https://github.com/hapifhir/hapi-fhir/issues/4092)) · [Google: disabling referential integrity doc](https://cloud.google.com/healthcare-api/docs/concepts/fhir-referential-integrity) |
| B8 Error diagnosability | [microsoft/fhir-server#2230](https://github.com/microsoft/fhir-server/issues/2230) raw stack trace instead of OperationOutcome · [hapi-fhir#3818](https://github.com/hapifhir/hapi-fhir/issues/3818) wrong diagnostics · [hapi-fhir#6068](https://github.com/hapifhir/hapi-fhir/issues/6068) internal Java error surfaced verbatim |
| B9 Capability honesty | [medplum#4343](https://github.com/medplum/medplum/issues/4343) CapabilityStatement/ONC mismatch · [medplum#3935](https://github.com/medplum/medplum/issues/3935) supported params missing from /metadata · Cerner dev-group: documented-but-undeclared interactions; "treat /metadata as a minimum guarantee" is community folk wisdom |

*Links verified at time of writing; issue states change. Corrections welcome via PR.*

## Coverage gaps (acknowledged, roadmap)

| Behavior class (planned) | Motivating incident exists? | Status |
|---|---|---|
| Attachment/storage URL expiry behavior | Yes (expiring presigned URLs under bulk load) | Not yet covered |
| State-transition legality (Encounter/Task) | Industry-known | Not yet covered |
