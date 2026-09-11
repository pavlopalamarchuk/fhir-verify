import type { CheckPack, CheckResult, PackContext } from "../types.js";

/**
 * Error diagnosability: when the server refuses a request, can a human on call
 * actually tell WHY? Motivated by a production incident in which clinicians saw a
 * generic "API request error" while the true cause (rate limiting) was invisible
 * at every layer above the wire. Servers that answer failures with empty or
 * boilerplate OperationOutcomes convert every incident into archaeology.
 */
export const operationOutcomePack: CheckPack = {
  name: "operation-outcome",
  description: "Diagnostic quality of OperationOutcome payloads on common failure paths",
  async run(ctx: PackContext): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    const grade = (json: any): { ok: boolean; why: string } => {
      if (json?.resourceType !== "OperationOutcome") return { ok: false, why: "no OperationOutcome body" };
      const issue = json.issue?.[0];
      if (!issue) return { ok: false, why: "OperationOutcome without issues" };
      const text: string = issue.details?.text ?? issue.diagnostics ?? "";
      if (!issue.severity || !issue.code) return { ok: false, why: "issue missing severity/code" };
      if (text.trim().length < 10) return { ok: false, why: "no usable human-readable diagnostics" };
      return { ok: true, why: `"${text.slice(0, 90)}"` };
    };

    // Failure path 1: read of a nonexistent resource.
    const notFound = await ctx.client.read("Patient", `fhir-verify-missing-${Date.now()}`);
    const g1 = grade(notFound.json);
    results.push({
      id: "operation-outcome.not-found",
      title: "Read of a missing resource returns a diagnosable outcome",
      status: notFound.status === 404 && g1.ok ? "pass" : "warn",
      details:
        notFound.status === 404 && g1.ok
          ? `HTTP 404 with usable diagnostics: ${g1.why}.`
          : `HTTP ${notFound.status}; diagnosability: ${g1.why}. On-call engineers inherit whatever this payload does not say.`,
      evidence: { status: notFound.status },
      references: ["FHIR R4 OperationOutcome"],
    });

    // Failure path 2: syntactically invalid body.
    const badJson = await ctx.client.request("POST", `${ctx.client.prefix}/Patient`, {
      rawBody: "{ this is not json",
      contentType: "application/fhir+json",
      accept: "application/fhir+json",
    });
    const g2 = grade(badJson.json);
    results.push({
      id: "operation-outcome.parse-error",
      title: "Malformed request body yields a diagnosable outcome",
      status: badJson.status >= 400 && badJson.status < 500 && g2.ok ? "pass" : "warn",
      details:
        badJson.status >= 400 && badJson.status < 500 && g2.ok
          ? `HTTP ${badJson.status} with usable diagnostics: ${g2.why}.`
          : `HTTP ${badJson.status}; diagnosability: ${g2.why}.`,
      evidence: { status: badJson.status },
    });

    // Failure path 3: unknown search parameter — lenient vs strict handling transparency.
    const unknownParam = await ctx.client.search("Patient", `fhirverifybogusparam=1&_count=1`);
    const handled =
      unknownParam.status === 200
        ? unknownParam.json?.resourceType === "Bundle"
          ? "lenient (ignored the parameter" +
            (JSON.stringify(unknownParam.json).includes("OperationOutcome")
              ? ", with an advisory OperationOutcome in the bundle)"
              : ", silently)")
          : "unexpected body"
        : `strict (HTTP ${unknownParam.status})`;
    results.push({
      id: "operation-outcome.unknown-param",
      title: "Unknown search parameter handling is transparent",
      status: handled.includes("silently") ? "warn" : "info",
      details: `Handling: ${handled}. Silent leniency means a typo in a search parameter returns unfiltered results with no signal — a query that looks right and is quietly wrong.`,
      evidence: { status: unknownParam.status },
      references: ["FHIR R4 search: lenient/strict handling (Prefer: handling)"],
    });

    return results;
  },
};
