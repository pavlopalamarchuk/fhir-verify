/**
 * Example community/organization check pack for fhir-verify.
 * Run it with:  fhir-verify --server ... --plugin ./examples/custom-pack-example.mjs --packs all
 * (or select it explicitly: --packs org-policy)
 *
 * The contract is three fields: name, description, run(ctx).
 * ctx gives you: ctx.client (FhirClient with prefix + auth wired), ctx.config,
 * and ctx.trackForCleanup(resourceType, id) for anything you create.
 * Rules of the house: synthetic data only, passive-safe, one bounded interaction per probe.
 */
export default {
  name: "org-policy",
  description: "Example organizational policy checks (identifier search + response-time budget)",
  async run(ctx) {
    const results = [];

    // Org rule 1: our integrations depend on Patient?identifier — the server must declare it.
    const meta = await ctx.client.request("GET", `${ctx.client.prefix}/metadata`, {
      accept: "application/fhir+json",
    });
    const patient = meta.json?.rest?.[0]?.resource?.find((r) => r.type === "Patient");
    const hasIdentifier = !!patient?.searchParam?.some((sp) => sp.name === "identifier");
    results.push({
      id: "org-policy.identifier-search-declared",
      title: "Patient?identifier search is declared (org integration dependency)",
      status: hasIdentifier ? "pass" : "fail",
      details: hasIdentifier
        ? "Declared in CapabilityStatement."
        : "Our integrations page patients by identifier; a server without it is not deployable for us.",
    });

    // Org rule 2: interactive read must answer within our UX budget.
    const t0 = Date.now();
    await ctx.client.search("Patient", "_count=1");
    const ms = Date.now() - t0;
    results.push({
      id: "org-policy.read-latency-budget",
      title: "Single search answers within the 2000 ms interactive budget",
      status: ms <= 2000 ? "pass" : "warn",
      details: `Observed ${ms} ms (single sample — indicative, not a benchmark).`,
      evidence: { ms },
    });

    return results;
  },
};
