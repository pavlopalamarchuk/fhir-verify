import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult } from "./types.js";
import { renderRunHtml } from "./html-report.js";

/** Server-derived text can carry newlines and control bytes; flatten them so it cannot break out of a Markdown table cell or produce invalid JUnit XML. */
const flatten = (v: string) =>
  // eslint-disable-next-line no-control-regex
  v.replace(/[\r\n]+/g, " ").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

const xmlEsc = (v: string) =>
  flatten(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** JUnit XML for CI systems (Jenkins, GitLab, GitHub test summaries). FAILs map to <failure>, SKIPs to <skipped>; WARNs pass but carry the finding in system-out. */
export function renderJUnit(report: RunReport): string {
  const suites = report.packs
    .map((p) => {
      const cases = p.results
        .map((r) => {
          const body =
            r.status === "fail"
              ? `<failure message="${xmlEsc(r.details)}"/>`
              : r.status === "skip"
                ? `<skipped message="${xmlEsc(r.details)}"/>`
                : `<system-out>${xmlEsc(`[${r.status.toUpperCase()}] ${r.details}`)}</system-out>`;
          return `    <testcase classname="${xmlEsc(p.name)}" name="${xmlEsc(r.title)}">${body}</testcase>`;
        })
        .join("\n");
      const fails = p.results.filter((r) => r.status === "fail").length;
      const skips = p.results.filter((r) => r.status === "skip").length;
      return `  <testsuite name="${xmlEsc(p.name)}" tests="${p.results.length}" failures="${fails}" skipped="${skips}">\n${cases}\n  </testsuite>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="fhir-verify ${xmlEsc(report.serverUrl)}">\n${suites}\n</testsuites>\n`;
}

/** Exit-code policy: 'fail' gates on FAIL only (default); 'warn' also gates on WARN. */
export function computeExitCode(report: RunReport, failOn: "fail" | "warn" = "fail"): number {
  const flat = report.packs.flatMap((p) => p.results);
  if (flat.some((r) => r.status === "fail")) return 1;
  if (failOn === "warn" && flat.some((r) => r.status === "warn")) return 1;
  return 0;
}

export interface RunReport {
  tool: string;
  version: string;
  serverUrl: string;
  startedAt: string;
  finishedAt: string;
  packs: { name: string; results: CheckResult[] }[];
}

const ICONS: Record<string, string> = {
  pass: "PASS",
  fail: "FAIL",
  warn: "WARN",
  info: "INFO",
  skip: "SKIP",
};

export function printSummary(report: RunReport): void {
  for (const pack of report.packs) {
    console.log(`\n== ${pack.name} ==`);
    for (const r of pack.results) {
      console.log(`  [${ICONS[r.status]}] ${r.title}`);
      console.log(`         ${r.details}`);
    }
  }
  const flat = report.packs.flatMap((p) => p.results);
  const count = (s: string) => flat.filter((r) => r.status === s).length;
  console.log(
    `\nTotal: ${flat.length} checks — ${count("pass")} pass, ${count("warn")} warn, ${count("fail")} fail, ${count("info")} info, ${count("skip")} skip`,
  );
}

export function writeReports(
  report: RunReport,
  outDir: string,
): { jsonPath: string; mdPath: string; htmlPath: string; junitPath: string } {
  mkdirSync(outDir, { recursive: true });
  const stamp = report.startedAt.replace(/[:.]/g, "-");
  const jsonPath = join(outDir, `fhir-verify-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const lines: string[] = [
    `# fhir-verify report`,
    ``,
    `- Server: ${report.serverUrl}`,
    `- Run: ${report.startedAt} → ${report.finishedAt}`,
    `- Tool: ${report.tool} v${report.version}`,
    ``,
  ];
  for (const pack of report.packs) {
    lines.push(`## Pack: ${pack.name}`, ``);
    lines.push(`| Status | Check | Details |`, `|---|---|---|`);
    for (const r of pack.results) {
      lines.push(
        `| ${r.status.toUpperCase()} | ${flatten(r.title).replace(/\|/g, "\\|")} | ${flatten(r.details).replace(/\|/g, "\\|")} |`,
      );
    }
    lines.push(``);
  }
  const mdPath = join(outDir, `fhir-verify-${stamp}.md`);
  writeFileSync(mdPath, lines.join("\n"));
  const htmlPath = join(outDir, `fhir-verify-${stamp}.html`);
  writeFileSync(htmlPath, renderRunHtml(report));
  const junitPath = join(outDir, `fhir-verify-${stamp}.junit.xml`);
  writeFileSync(junitPath, renderJUnit(report));
  return { jsonPath, mdPath, htmlPath, junitPath };
}
