import type { CheckPack, CheckResult, PackContext } from "../types.js";

/**
 * Rate-limit transparency: can a well-behaved client know its remaining budget and, on 429,
 * know how long to back off? Motivated by production incidents where background jobs exhausted
 * a shared quota and interactive clinical actions failed with undecipherable errors.
 * Passive by design — this pack never attempts to exhaust a server's quota.
 */
export const rateLimitPack: CheckPack = {
  name: "rate-limits",
  description: "Rate-limit header transparency (passive; never induces throttling)",
  async run(ctx: PackContext): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const res = await ctx.client.search("Patient", "_count=1");
    if (res.status < 200 || res.status >= 300) {
      return [
        {
          id: "rate-limits.headers-present",
          title: "Rate-limit budget is visible to clients on normal responses",
          status: "skip",
          details: `Probe search returned HTTP ${res.status} — header transparency cannot be assessed on a non-2xx response.`,
          evidence: { status: res.status },
        },
      ];
    }
    const h = res.headers;

    const rateLimit = h["ratelimit"] ?? h["ratelimit-limit"];
    const retryAfter = h["retry-after"];
    const xHeaders = Object.keys(h).filter((k) => k.startsWith("x-ratelimit"));

    results.push({
      id: "rate-limits.headers-present",
      title: "Rate-limit budget is visible to clients on normal responses",
      status: rateLimit || xHeaders.length ? "pass" : "warn",
      details: rateLimit
        ? `Server exposes a RateLimit header ("${String(rateLimit).slice(0, 120)}"). Clients can implement proactive backoff.`
        : xHeaders.length
          ? `Server exposes ${xHeaders.join(", ")}.`
          : "No RateLimit / X-RateLimit-* headers observed. Clients cannot see their remaining budget and will discover limits only by failing.",
      references: ["draft-ietf-httpapi-ratelimit-headers", "RFC 9110 §10.2.3 Retry-After"],
      evidence: {
        observedHeaders: Object.fromEntries(Object.entries(h).filter(([k]) => /rate|retry/.test(k))),
      },
    });

    results.push({
      id: "rate-limits.retry-after-guidance",
      title: "Standard Retry-After guidance on 429 responses",
      status: retryAfter ? "pass" : "info",
      details: retryAfter
        ? "Retry-After observed."
        : "Not observable without inducing throttling (this pack will not do that). Note: many stacks emit only the draft RateLimit header on 429; standard HTTP clients and proxies act only on Retry-After — verify the server sends it when throttling, and that interactive traffic is isolated from background-job quota consumption.",
    });

    return results;
  },
};
