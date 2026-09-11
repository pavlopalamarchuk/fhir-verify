import type { CheckPack, CheckResult, PackContext } from "../types.js";
import { createdId, syntheticPatient } from "../client.js";

/** Core workflow sanity: a resource survives the full create → read → update → delete cycle intact. */
export const crudPack: CheckPack = {
  name: "crud",
  description: "Create/read/update/delete roundtrip integrity for a synthetic Patient",
  async run(ctx: PackContext): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const tag = `crud-${Date.now()}`;
    const created = await ctx.client.create("Patient", syntheticPatient(tag));
    if (created.status !== 201 && created.status !== 200) {
      return [
        {
          id: "crud.create",
          title: "Create synthetic Patient",
          status: "fail",
          details: `POST Patient returned ${created.status}; cannot continue pack.`,
          evidence: { status: created.status, body: created.text.slice(0, 500) },
        },
      ];
    }
    const id = createdId("Patient", created);
    if (!id) {
      return [
        {
          id: "crud.create",
          title: "Create synthetic Patient",
          status: "fail",
          details: `POST Patient returned HTTP ${created.status} but neither the body nor the Location header carries the new id (Prefer: return=representation was sent). Cannot continue the pack — and the created resource cannot be cleaned up.`,
          evidence: { status: created.status, location: created.headers["location"] },
        },
      ];
    }
    ctx.trackForCleanup("Patient", id);
    results.push({
      id: "crud.create",
      title: "Create synthetic Patient",
      status: "pass",
      details: `Created Patient/${id} (HTTP ${created.status}).`,
    });

    const read = await ctx.client.read("Patient", id);
    const nameOk = read.json?.name?.[0]?.family === "FhirVerify";
    results.push({
      id: "crud.read",
      title: "Read returns the stored resource as FHIR JSON",
      status: read.status === 200 && nameOk ? "pass" : "fail",
      details:
        read.status === 200 && nameOk
          ? "Read-back matches the created resource."
          : `Read returned HTTP ${read.status}; family-name match: ${nameOk}.`,
      evidence: { status: read.status, contentType: read.contentType },
    });

    const updated = await ctx.client.update("Patient", id, { ...read.json, active: false });
    const verify = await ctx.client.read("Patient", id);
    const updateOk = updated.status === 200 && verify.json?.active === false;
    results.push({
      id: "crud.update",
      title: "Update persists and versions the resource",
      // 412 without If-Match is spec-permitted (§3.1.0.3 version-aware updates
      // required) — a conformance choice, not a defect.
      status: updateOk ? "pass" : updated.status === 412 ? "warn" : "fail",
      details: updateOk
        ? `Update persisted (versionId ${verify.json?.meta?.versionId ?? "n/a"}).`
        : updated.status === 412
          ? "Update without If-Match returned HTTP 412 — this server requires version-aware updates. Clients must send If-Match with the current versionId."
          : `Update HTTP ${updated.status}; read-back active=${verify.json?.active}.`,
      references: ["FHIR R4 §3.1.0 RESTful API"],
    });

    const del = await ctx.client.delete("Patient", id);
    const afterDelete = await ctx.client.read("Patient", id);
    results.push({
      id: "crud.delete",
      title: "Delete removes the resource (subsequent read is 404/410)",
      status: [404, 410].includes(afterDelete.status) ? "pass" : "warn",
      details: `DELETE returned ${del.status}; subsequent read returned ${afterDelete.status}.`,
    });
    return results;
  },
};
