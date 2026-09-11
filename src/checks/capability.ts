import type { CheckPack, CheckResult, PackContext } from "../types.js";

/**
 * CapabilityStatement versus reality: does the server actually do what its
 * /metadata declares? Published conformance research has repeatedly found
 * divergence between declared capabilities and observed behavior; this pack
 * probes a small, safe subset of declarations against live responses.
 */
export const capabilityPack: CheckPack = {
  name: "capability",
  description: "CapabilityStatement present; declared behaviors compared with observed ones",
  async run(ctx: PackContext): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const meta = await ctx.client.request("GET", `${ctx.client.prefix}/metadata`, {
      accept: "application/fhir+json",
    });
    if (meta.status !== 200 || meta.json?.resourceType !== "CapabilityStatement") {
      return [
        {
          id: "capability.metadata-available",
          title: "CapabilityStatement is served at /metadata",
          status: "fail",
          details: `GET /metadata returned HTTP ${meta.status} (${meta.json?.resourceType ?? "no FHIR body"}). Clients cannot discover this server's contract at all.`,
          references: ["FHIR R4 §capabilities interaction"],
        },
      ];
    }
    const cs = meta.json;
    const rest = cs.rest?.find((r: any) => r.mode === "server") ?? cs.rest?.[0];
    const patient = rest?.resource?.find((r: any) => r.type === "Patient");
    results.push({
      id: "capability.metadata-available",
      title: "CapabilityStatement is served at /metadata",
      status: "pass",
      details: `FHIR ${cs.fhirVersion ?? "?"} · ${rest?.resource?.length ?? 0} resource types declared · Patient declares ${patient?.interaction?.length ?? 0} interactions and ${patient?.searchParam?.length ?? 0} search parameters.`,
      evidence: { fhirVersion: cs.fhirVersion, software: cs.software?.name },
    });

    // Declared vs observed 1: Patient read interaction.
    const declaresRead = !!patient?.interaction?.some((i: any) => i.code === "read");
    const readProbe = await ctx.client.read("Patient", `fhir-verify-cap-${Date.now()}`);
    const readObserved = [200, 404, 410].includes(readProbe.status); // endpoint exists; 404 for random id is correct
    results.push({
      id: "capability.read-declared-vs-observed",
      title: "Patient read: declared capability matches observed endpoint behavior",
      status: declaresRead === readObserved ? "pass" : "warn",
      details:
        declaresRead === readObserved
          ? `Declared read=${declaresRead}, observed endpoint behavior consistent (HTTP ${readProbe.status} on a random id).`
          : `Declared read=${declaresRead} but observed HTTP ${readProbe.status} — the contract and the behavior disagree; integrations built from /metadata alone will be surprised.`,
      evidence: { declared: declaresRead, probeStatus: readProbe.status },
    });

    // Declared vs observed 2: $validate operation.
    const declaresValidate =
      !!patient?.operation?.some((o: any) => (o.name ?? "").includes("validate")) ||
      !!rest?.operation?.some((o: any) => (o.name ?? "").includes("validate"));
    const valProbe = await ctx.client.request("POST", `${ctx.client.prefix}/Patient/$validate`, {
      body: { resourceType: "Patient" },
      accept: "application/fhir+json",
    });
    const validateObserved = valProbe.status !== 404;
    if (declaresValidate === validateObserved) {
      results.push({
        id: "capability.validate-declared-vs-observed",
        title: "$validate: declaration matches observation",
        status: "pass",
        details: `Declared=${declaresValidate}, observed=${validateObserved} (HTTP ${valProbe.status}).`,
      });
    } else {
      results.push({
        id: "capability.validate-declared-vs-observed",
        title: "$validate: declaration matches observation",
        status: "warn",
        details: `Declared=${declaresValidate} but observed=${validateObserved} (HTTP ${valProbe.status}). Divergence between CapabilityStatement and live behavior — the documented pattern that makes runtime probing necessary.`,
        evidence: { declared: declaresValidate, probeStatus: valProbe.status },
      });
    }
    return results;
  },
};
