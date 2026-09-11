import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeReports } from "../dist/report.js";
import { renderRunHtml, renderMatrixHtml } from "../dist/html-report.js";
import { resolvePacks, allPacks } from "../dist/checks/index.js";

const sample = {
  tool: "fhir-verify",
  version: "0.0.0-test",
  serverUrl: "https://example.test",
  startedAt: "2026-01-01T00:00:00.000Z",
  finishedAt: "2026-01-01T00:00:30.000Z",
  packs: [
    {
      name: "demo",
      results: [
        { id: "demo.pass", title: "Passing check", status: "pass", details: "ok" },
        {
          id: "demo.warn",
          title: "Warning check <script>",
          status: "warn",
          details: 'has "quotes" & <tags>',
          evidence: { code: 400 },
          references: ["RFC 0000"],
        },
      ],
    },
  ],
};

test("resolvePacks returns all packs for 'all' and filters by name", () => {
  assert.equal(resolvePacks(["all"]).length, allPacks.length);
  assert.deepEqual(
    resolvePacks(["pagination", "binary"]).map((p) => p.name),
    ["pagination", "binary"],
  );
  assert.equal(resolvePacks(["nonexistent"]).length, 0);
});

test("every pack has a unique name and a description", () => {
  const names = allPacks.map((p) => p.name);
  assert.equal(new Set(names).size, names.length);
  for (const p of allPacks) assert.ok(p.description.length > 10, `${p.name} needs a description`);
});

test("writeReports emits json, md and html with matching content", () => {
  const dir = mkdtempSync(join(tmpdir(), "fv-test-"));
  const { jsonPath, mdPath, htmlPath } = writeReports(sample, dir);
  const json = JSON.parse(readFileSync(jsonPath, "utf8"));
  assert.equal(json.serverUrl, sample.serverUrl);
  assert.match(readFileSync(mdPath, "utf8"), /Passing check/);
  assert.match(readFileSync(htmlPath, "utf8"), /Passing check/);
});

test("renderRunHtml escapes untrusted strings", () => {
  const html = renderRunHtml(sample);
  assert.ok(!html.includes("<script>ალ") || true);
  assert.ok(!html.includes("Warning check <script>"), "raw tag must not pass through");
  assert.match(html, /Warning check &lt;script&gt;/);
  assert.match(html, /has &quot;quotes&quot; &amp; &lt;tags&gt;/);
});

test("renderMatrixHtml builds one column per report and honors labels", () => {
  const a = { ...sample, label: "Server A" };
  const b = { ...sample, serverUrl: "https://other.test" };
  const html = renderMatrixHtml([a, b]);
  assert.match(html, /Server A/);
  assert.match(html, /other\.test/);
  const columns = html.match(/<th>/g) ?? [];
  assert.equal(columns.length, 2);
});

import { renderJUnit, computeExitCode } from "../dist/report.js";

test("renderJUnit maps statuses and escapes XML", () => {
  const xml = renderJUnit({
    ...sample,
    packs: [
      {
        name: "p",
        results: [
          { id: "a", title: 'Bad "title" <tag>', status: "fail", details: "broke & burned" },
          { id: "b", title: "Skipped one", status: "skip", details: "no creds" },
          { id: "c", title: "Warned one", status: "warn", details: "careful" },
        ],
      },
    ],
  });
  assert.match(xml, /failures="1"/);
  assert.match(xml, /skipped="1"/);
  assert.match(xml, /Bad &quot;title&quot; &lt;tag&gt;/);
  assert.match(xml, /<failure message="broke &amp; burned"\/>/);
  assert.match(xml, /\[WARN\] careful/);
});

test("computeExitCode honors fail-on policy", () => {
  const mk = (status) => ({
    ...sample,
    packs: [{ name: "p", results: [{ id: "x", title: "t", status, details: "d" }] }],
  });
  assert.equal(computeExitCode(mk("pass"), "fail"), 0);
  assert.equal(computeExitCode(mk("warn"), "fail"), 0);
  assert.equal(computeExitCode(mk("warn"), "warn"), 1);
  assert.equal(computeExitCode(mk("fail"), "fail"), 1);
});

import { applyGatePolicy } from "../dist/gate.js";

test("applyGatePolicy downgrades allowed warns, upgrades denied warns, fails missing required packs", () => {
  const rep = {
    ...sample,
    packs: [
      {
        name: "p",
        results: [
          { id: "p.accepted", title: "a", status: "warn", details: "d" },
          { id: "p.denied", title: "b", status: "warn", details: "d" },
          { id: "p.plain", title: "c", status: "warn", details: "d" },
        ],
      },
    ],
  };
  const out = applyGatePolicy(rep, { allow: ["p.accepted"], deny: ["p.denied"], require: ["p", "ghost"] });
  const byId = Object.fromEntries(out.packs.flatMap((pk) => pk.results.map((r) => [r.id, r.status])));
  assert.equal(byId["p.accepted"], "info");
  assert.equal(byId["p.denied"], "fail");
  assert.equal(byId["p.plain"], "warn");
  assert.equal(byId["gate.required-pack-missing.ghost"], "fail");
});
