import type { CheckPack, CheckResult } from "./types.js";
import type { RunReport } from "./report.js";

/**
 * Quality-gate policy. Lets an organization encode its own risk posture on top
 * of the suite's defaults, ESLint-style:
 *  - `allow`: check IDs whose WARN is an accepted, documented risk → downgraded to INFO
 *  - `deny`:  check IDs whose WARN violates org policy → upgraded to FAIL (blocks the gate)
 *  - `require`: packs that MUST have run — a gate that silently skips its checks is no gate
 *  - `failOn`: 'fail' (default) or 'warn'
 */
export interface GatePolicy {
  failOn?: "fail" | "warn";
  allow?: string[];
  deny?: string[];
  require?: string[];
}

/** Apply a gate policy to a finished report. Returns the transformed report; annotations are appended to details so reports stay self-explanatory. */
export function applyGatePolicy(report: RunReport, policy: GatePolicy): RunReport {
  const allow = new Set(policy.allow ?? []);
  const deny = new Set(policy.deny ?? []);
  const transform = (r: CheckResult): CheckResult => {
    if (r.status === "warn" && allow.has(r.id)) {
      return { ...r, status: "info", details: `${r.details} [gate: accepted risk per policy]` };
    }
    if (r.status === "warn" && deny.has(r.id)) {
      return { ...r, status: "fail", details: `${r.details} [gate: denied by policy]` };
    }
    return r;
  };
  const packs = report.packs.map((p) => ({ name: p.name, results: p.results.map(transform) }));

  const ranPacks = new Set(packs.map((p) => p.name));
  const missing = (policy.require ?? []).filter((name) => !ranPacks.has(name));
  if (missing.length) {
    packs.push({
      name: "gate",
      results: missing.map((name) => ({
        id: `gate.required-pack-missing.${name}`,
        title: `Required pack "${name}" did not run`,
        status: "fail" as const,
        details: `Gate policy requires pack "${name}", but it was not executed in this run. A gate whose checks silently do not run is not a gate.`,
      })),
    });
  }
  return { ...report, packs };
}

/** Load external check packs (local .mjs/.js files or installed npm packages) that export a CheckPack as `default` or `pack`. Plugins run with full process privileges — load only code you trust. */
export async function loadPlugins(specs: string[]): Promise<{ packs: CheckPack[]; errors: string[] }> {
  const packs: CheckPack[] = [];
  const errors: string[] = [];
  for (const spec of specs) {
    try {
      const href =
        spec.startsWith(".") || spec.startsWith("/") ? new URL(spec, `file://${process.cwd()}/`).href : spec;
      const mod: any = await import(href);
      const candidate = mod.default ?? mod.pack;
      if (
        candidate &&
        typeof candidate.name === "string" &&
        /^[a-z0-9][a-z0-9-]*$/.test(candidate.name) &&
        typeof candidate.description === "string" &&
        typeof candidate.run === "function"
      ) {
        packs.push(candidate as CheckPack);
      } else {
        errors.push(`${spec}: module does not export a valid CheckPack ({name, description, run})`);
      }
    } catch (err) {
      errors.push(`${spec}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { packs, errors };
}
