import type { CheckPack, CheckResult, PackContext } from "../types.js";
import { syntheticPatient } from "../client.js";

/**
 * Server-side $validate support: does the server expose the FHIR $validate operation,
 * does it accept a well-formed resource, and does it actually reject a malformed one?
 * Complements profile validators (Firely/HAPI): this pack verifies the SERVER's runtime
 * validation gate exists and works — not the resource itself.
 */
export const validateOpPack: CheckPack = {
  name: "validate-op",
  description: "Server $validate operation: present, accepts valid, rejects invalid",
  async run(ctx: PackContext): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    const good = await ctx.client.request("POST", `${ctx.client.prefix}/Patient/$validate`, {
      body: syntheticPatient(`validate-${Date.now()}`),
      accept: "application/fhir+json",
    });
    if (good.status === 404) {
      return [
        {
          id: "validate-op.available",
          title: "$validate operation availability",
          status: "warn",
          details:
            "Server returned 404 for Patient/$validate — no runtime validation gate is exposed. Clients cannot pre-flight resources; malformed data is discovered only on write.",
          references: ["FHIR R4 §3.4.5 Resource $validate"],
        },
      ];
    }
    const goodOutcomeOk =
      good.status === 200 &&
      good.json?.resourceType === "OperationOutcome" &&
      !good.json?.issue?.some((i: any) => i.severity === "error");
    results.push({
      id: "validate-op.accepts-valid",
      title: "$validate accepts a well-formed resource",
      status: goodOutcomeOk ? "pass" : "warn",
      details: goodOutcomeOk
        ? "Valid synthetic Patient passes $validate with no error-severity issues."
        : `$validate returned HTTP ${good.status} / ${good.json?.resourceType ?? "non-JSON"} for a well-formed Patient.`,
      evidence: { status: good.status },
    });

    // Malformed on purpose: birthDate must be a date, gender must be from the required value set.
    const bad = await ctx.client.request("POST", `${ctx.client.prefix}/Patient/$validate`, {
      body: { resourceType: "Patient", birthDate: "not-a-date", gender: "not-a-gender" },
      accept: "application/fhir+json",
    });
    // A 400 for the malformed probe only proves validation if the well-formed
    // probe went through — a server that 400s everything has no gate at all.
    const goodWentThrough = good.status >= 200 && good.status < 300;
    const badCaught =
      (bad.status === 200 && bad.json?.issue?.some((i: any) => i.severity === "error")) ||
      (bad.status === 400 && goodWentThrough);
    const indistinguishable = bad.status === 400 && !goodWentThrough;
    results.push({
      id: "validate-op.rejects-invalid",
      title: "$validate flags a malformed resource",
      status: badCaught ? "pass" : indistinguishable ? "warn" : "fail",
      details: badCaught
        ? "Malformed Patient (bad date primitive, out-of-valueset code) is flagged with error-severity issues."
        : indistinguishable
          ? `Both the well-formed (HTTP ${good.status}) and the malformed (HTTP ${bad.status}) probes were rejected — cannot attribute the 400 to validation; the operation may be failing for unrelated reasons.`
          : `Malformed Patient was NOT flagged (HTTP ${bad.status}) — the validation gate passes broken data.`,
      evidence: {
        status: bad.status,
        firstIssue: bad.json?.issue?.[0]?.details?.text ?? bad.json?.issue?.[0]?.diagnostics,
      },
      references: ["FHIR R4 §3.4.5 Resource $validate", "FHIR R4 Patient (gender required binding)"],
    });

    return results;
  },
};
