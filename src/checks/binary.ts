import type { CheckPack, CheckResult, PackContext } from "../types.js";
import { createdId, TEST_IDENTIFIER_SYSTEM } from "../client.js";

/**
 * Binary read contract: what shape does GET Binary/:id return under different Accept headers?
 * Motivated by an integration break where one environment returned raw bytes and another JSON.
 * Per FHIR R4, Binary is served in its native form unless FHIR JSON is explicitly requested —
 * and `Accept: application/json` is NOT the same as `application/fhir+json`.
 */
export const binaryPack: CheckPack = {
  name: "binary",
  description: "Binary read response shape under different Accept headers",
  async run(ctx: PackContext): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const payload = "fhir-verify synthetic binary payload";
    // FHIR-JSON form (not a raw-body POST) so the Binary can carry a synthetic
    // marker: R4 Binary has no identifier element, so meta.tag is the marker.
    const created = await ctx.client.create("Binary", {
      resourceType: "Binary",
      meta: { tag: [{ system: TEST_IDENTIFIER_SYSTEM, code: `binary-${Date.now()}` }] },
      contentType: "text/plain",
      data: Buffer.from(payload).toString("base64"),
    });
    const id = [200, 201].includes(created.status) ? createdId("Binary", created) : undefined;
    if (!id) {
      return [
        {
          id: "binary.create",
          title: "Create Binary",
          status: "skip",
          details: `POST Binary returned ${created.status}${[200, 201].includes(created.status) ? " but no id could be determined from body or Location header" : ""}; pack skipped (server may restrict Binary).`,
        },
      ];
    }
    ctx.trackForCleanup("Binary", id);

    const asFhirJson = await ctx.client.read("Binary", id, "application/fhir+json");
    const asPlainJson = await ctx.client.read("Binary", id, "application/json");
    const asDefault = await ctx.client.request("GET", `${ctx.client.prefix}/Binary/${id}`, { accept: "*/*" });

    const shape = (r: { json?: any; contentType: string }) =>
      r.json?.resourceType === "Binary" ? "fhir-json" : `raw (${r.contentType || "no content-type"})`;

    results.push({
      id: "binary.accept-contract",
      title: "Binary read shape depends on the Accept header",
      status: "info",
      details: `Accept application/fhir+json → ${shape(asFhirJson)}; application/json → ${shape(asPlainJson)}; */* → ${shape(asDefault)}. Integrations must send application/fhir+json when they expect the JSON resource — application/json may still yield raw bytes.`,
      evidence: {
        fhirJson: { status: asFhirJson.status, contentType: asFhirJson.contentType },
        plainJson: { status: asPlainJson.status, contentType: asPlainJson.contentType },
        default: { status: asDefault.status, contentType: asDefault.contentType },
      },
      references: ["FHIR R4 Binary §2.42.5 (native-form serving)"],
    });

    const mismatch = shape(asPlainJson) !== shape(asFhirJson);
    results.push({
      id: "binary.plain-json-trap",
      title: "application/json vs application/fhir+json divergence",
      status: mismatch ? "warn" : "pass",
      details: mismatch
        ? "The two Accept values return different shapes — a portability trap between environments and server versions. Pin clients to application/fhir+json."
        : "Both Accept values return the same shape on this server.",
    });

    return results;
  },
};
