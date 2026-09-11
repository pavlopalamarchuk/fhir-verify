import type { CheckPack, CheckResult, PackContext } from "../types.js";
import { createdId, syntheticPatient, TEST_IDENTIFIER_SYSTEM } from "../client.js";

const syntheticObservation = (tag: string, subjectRef: string) => ({
  resourceType: "Observation",
  identifier: [{ system: TEST_IDENTIFIER_SYSTEM, value: tag }],
  status: "final",
  code: { text: "fhir-verify synthetic reference probe" },
  subject: { reference: subjectRef },
});

/**
 * Referential integrity behavior: does the server accept resources that point at
 * nothing, and does it protect resources that something still points at?
 * FHIR leaves both server-configurable — which is exactly why integrations must
 * know the actual behavior before relying on it. Dangling clinical references are
 * a silent data-integrity hazard: an Observation whose subject no longer resolves
 * is unreachable through every patient-centric workflow.
 */
export const referenceIntegrityPack: CheckPack = {
  name: "reference-integrity",
  description: "Dangling-reference acceptance and delete protection for referenced resources",
  async run(ctx: PackContext): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const stamp = Date.now();

    // Probe 1: create an Observation whose subject does not exist.
    const danglingId = `fhir-verify-nonexistent-${stamp}`;
    const dangling = await ctx.client.create(
      "Observation",
      syntheticObservation(`ref-dangling-${stamp}`, `Patient/${danglingId}`),
    );
    if ([200, 201].includes(dangling.status)) {
      if (dangling.json?.id) ctx.trackForCleanup("Observation", dangling.json.id);
      results.push({
        id: "reference-integrity.dangling-accepted",
        title: "Server accepts references to nonexistent resources",
        status: "warn",
        details:
          "An Observation referencing a nonexistent Patient was accepted. Spec-permissible, but every dangling clinical reference is unreachable through patient-centric queries — integrations must validate reference targets themselves.",
        evidence: { status: dangling.status },
        references: ["FHIR R4 §2.3 resource references (enforcement is server policy)"],
      });
    } else {
      results.push({
        id: "reference-integrity.dangling-accepted",
        title: "Server accepts references to nonexistent resources",
        status: "pass",
        details: `Dangling reference rejected (HTTP ${dangling.status}) — the server enforces reference target existence.`,
        evidence: { status: dangling.status, outcome: dangling.json?.issue?.[0]?.diagnostics },
      });
    }

    // Probe 2: can a still-referenced resource be deleted out from under its dependents?
    const pat = await ctx.client.create("Patient", syntheticPatient(`ref-${stamp}`));
    const patId = [200, 201].includes(pat.status) ? createdId("Patient", pat) : undefined;
    if (!patId) {
      results.push({
        id: "reference-integrity.delete-protection",
        title: "Delete protection for referenced resources",
        status: "skip",
        details: `Could not create probe Patient (HTTP ${pat.status}); probe skipped.`,
      });
      return results;
    }
    ctx.trackForCleanup("Patient", patId);
    const obs = await ctx.client.create(
      "Observation",
      syntheticObservation(`ref-linked-${stamp}`, `Patient/${patId}`),
    );
    if ([200, 201].includes(obs.status) && obs.json?.id) {
      ctx.trackForCleanup("Observation", obs.json.id);
      const del = await ctx.client.delete("Patient", patId);
      // Only a 2xx means the referenced Patient was actually deleted; 409/412 is
      // referential protection; any other rejection (405, 403, …) blocked the
      // delete too, just not as an integrity signal.
      const deleted = del.status >= 200 && del.status < 300;
      const protectedDelete = [409, 412].includes(del.status);
      results.push({
        id: "reference-integrity.delete-protection",
        title: "Delete protection for referenced resources",
        status: protectedDelete ? "pass" : deleted ? "warn" : "info",
        details: protectedDelete
          ? `Deleting a Patient still referenced by an Observation is refused (HTTP ${del.status}) — referential protection active.`
          : deleted
            ? `A Patient still referenced by an Observation was deleted (HTTP ${del.status}), leaving the Observation dangling. Downstream patient-centric workflows silently lose that data.`
            : `Delete was rejected with HTTP ${del.status} — the resource was not deleted, but the status does not indicate referential-integrity enforcement specifically (405 = deletes unsupported, 403 = forbidden, …).`,
        evidence: { deleteStatus: del.status },
      });
    } else {
      results.push({
        id: "reference-integrity.delete-protection",
        title: "Delete protection for referenced resources",
        status: "skip",
        details: `Could not create probe Observation (HTTP ${obs.status}); probe skipped.`,
      });
    }
    return results;
  },
};
