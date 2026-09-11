#!/usr/bin/env node
import { FhirClient } from "./client.js";
import { allPacks } from "./checks/index.js";
import { printSummary, writeReports, computeExitCode, type RunReport } from "./report.js";
import { renderMatrixHtml } from "./html-report.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { RunConfig } from "./types.js";
import { applyGatePolicy, loadPlugins, type GatePolicy } from "./gate.js";

import { createRequire } from "node:module";

const VERSION: string = createRequire(import.meta.url)("../package.json").version;

function loadConfigFile(path: string, explicit: boolean): Partial<Record<string, string>> {
  try {
    if (!existsSync(path)) {
      // A typo'd --config path must never silently drop the gate policy.
      if (explicit) {
        console.error(`Config file not found: ${path}`);
        process.exit(2);
      }
      return {};
    }
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return typeof raw === "object" && raw !== null ? raw : {};
  } catch {
    console.error(`Warning: could not parse ${path}; ignoring it.`);
    return {};
  }
}

function parseArgs(argv: string[]): RunConfig & { gate: GatePolicy; plugins: string[] } {
  const fileIdx = argv.indexOf("--config");
  const file: any = loadConfigFile(
    fileIdx >= 0 ? argv[fileIdx + 1] : "fhir-verify.config.json",
    fileIdx >= 0,
  );
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    if (i >= 0) return argv[i + 1];
    return file[flag.replace(/^--/, "")] as string | undefined;
  };
  const getAll = (flag: string): string[] => {
    const out: string[] = [];
    argv.forEach((a, i) => {
      if (a === flag && argv[i + 1]) out.push(argv[i + 1]);
    });
    const fromFile = file[flag.replace(/^--/, "")];
    if (Array.isArray(fromFile)) out.push(...fromFile);
    return out;
  };
  const serverUrl = get("--server") ?? process.env.FHIR_VERIFY_SERVER ?? "";
  if (!serverUrl) {
    console.error(
      `fhir-verify — automated verification suite for FHIR R4 servers\n\n` +
        `Usage: fhir-verify --server <base-url> [--token <bearer>] [--prefix </fhir/R4|"">] [--packs all|${allPacks.map((p) => p.name).join(",")}]\n` +
        `                   [--client-id <id> --client-secret <secret> [--token-url <url>]] [--out <dir>]\n\n` +
        `Run only against test/staging servers with synthetic data. Never point this tool at production PHI.`,
    );
    process.exit(2);
  }
  return {
    serverUrl,
    token: get("--token") ?? process.env.FHIR_VERIFY_TOKEN,
    clientId: get("--client-id"),
    clientSecret: get("--client-secret"),
    tokenUrl: get("--token-url"),
    prefix: get("--prefix") ?? "/fhir/R4",
    // Config files may naturally use an array ("packs": ["crud"]) — accept both.
    packs: (() => {
      const raw = get("--packs") ?? "all";
      return Array.isArray(raw)
        ? raw.map(String)
        : String(raw)
            .split(",")
            .map((s) => s.trim());
    })(),
    outDir: get("--out") ?? "./fhir-verify-reports",
    failOn: get("--fail-on") === "warn" ? "warn" : "fail",
    plugins: getAll("--plugin"),
    gate: {
      failOn: get("--fail-on") === "warn" ? "warn" : "fail",
      allow: Array.isArray(file.gate?.allow) ? file.gate.allow : [],
      deny: Array.isArray(file.gate?.deny) ? file.gate.deny : [],
      require: Array.isArray(file.gate?.require) ? file.gate.require : [],
    },
  };
}

async function main() {
  if (process.argv[2] === "--version" || process.argv[2] === "-v") {
    console.log(`fhir-verify ${VERSION}`);
    return;
  }
  if (process.argv[2] === "matrix") {
    const specs = process.argv
      .slice(3)
      .filter((a) => a.endsWith(".json") || (a.includes("=") && a.split("=")[1]?.endsWith(".json")));
    const outIdx = process.argv.indexOf("--out");
    const outFile = outIdx >= 0 ? process.argv[outIdx + 1] : "behavior-matrix.html";
    if (!specs.length) {
      console.error(
        "Usage: fhir-verify matrix [label=]report1.json [label=]report2.json ... [--out matrix.html]",
      );
      process.exit(2);
    }
    const reports = specs.map((spec) => {
      const eq = spec.indexOf("=");
      const label = eq > 0 ? spec.slice(0, eq) : undefined;
      const file = eq > 0 ? spec.slice(eq + 1) : spec;
      const rep = JSON.parse(readFileSync(file, "utf8")) as RunReport & { label?: string };
      if (label) rep.label = label;
      return rep;
    });
    writeFileSync(outFile, renderMatrixHtml(reports));
    console.log(`Matrix written: ${outFile} (${reports.length} servers)`);
    return;
  }
  const config = parseArgs(process.argv.slice(2));
  const client = new FhirClient(config.serverUrl, config.token, config.prefix);
  const cleanup: { resourceType: string; id: string }[] = [];
  const { packs: pluginPacks, errors: pluginErrors } = await loadPlugins(config.plugins);
  for (const e of pluginErrors) console.error(`Plugin warning: ${e}`);
  // Plugins execute with full process privileges and can also arrive via the
  // auto-discovered config file — always say out loud that one was loaded.
  for (const p of pluginPacks) console.error(`Loaded plugin pack "${p.name}" (external code).`);
  const registry = [...allPacks, ...pluginPacks];
  const packs = config.packs.includes("all")
    ? registry
    : registry.filter((p) => config.packs.includes(p.name));
  if (!packs.length) {
    console.error(
      `No packs matched "${config.packs.join(",")}". Available: ${allPacks.map((p) => p.name).join(", ")}`,
    );
    process.exit(2);
  }
  // A misspelled pack name silently not running is a gate that isn't a gate.
  const known = new Set([...registry.map((p) => p.name), "all"]);
  const unknown = config.packs.filter((n) => !known.has(n));
  if (unknown.length) {
    console.error(
      `Warning: unknown pack name(s) ignored: ${unknown.join(", ")}. Available: ${registry.map((p) => p.name).join(", ")}`,
    );
  }
  const startedAt = new Date().toISOString();
  const report: RunReport = {
    tool: "fhir-verify",
    version: VERSION,
    serverUrl: config.serverUrl,
    startedAt,
    finishedAt: "",
    packs: [],
  };
  for (const pack of packs) {
    try {
      const results = await pack.run({
        client,
        config,
        trackForCleanup: (resourceType, id) => cleanup.push({ resourceType, id }),
      });
      report.packs.push({ name: pack.name, results });
    } catch (err) {
      report.packs.push({
        name: pack.name,
        results: [
          {
            id: `${pack.name}.error`,
            title: `Pack "${pack.name}" aborted`,
            status: "fail",
            details: String(err),
          },
        ],
      });
    }
  }
  // Best-effort cleanup of synthetic resources (delete may already have run in-pack).
  // LIFO order so dependents go before their targets (an Observation before the
  // Patient it references — FIFO would 409 on referentially-protected servers);
  // one retry pass for anything still refused; loudly report what remains.
  let pending = [...cleanup].reverse();
  for (let attempt = 0; attempt < 2 && pending.length; attempt++) {
    const still: typeof pending = [];
    for (const { resourceType, id } of pending) {
      try {
        const res = await client.delete(resourceType, id);
        const gone = res.status < 400 || res.status === 404 || res.status === 410;
        if (!gone) still.push({ resourceType, id });
      } catch {
        still.push({ resourceType, id });
      }
    }
    pending = still;
  }
  for (const { resourceType, id } of pending) {
    console.error(
      `Warning: could not clean up synthetic ${resourceType}/${id} — remove it manually (identifier system urn:fhir-verify:synthetic).`,
    );
  }
  report.finishedAt = new Date().toISOString();
  const gated = applyGatePolicy(report, config.gate);
  printSummary(gated);
  const { jsonPath, mdPath, htmlPath, junitPath } = writeReports(gated, config.outDir);
  console.log(`\nReports written: ${jsonPath} · ${mdPath} · ${htmlPath} · ${junitPath}`);
  process.exit(computeExitCode(gated, config.failOn));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
