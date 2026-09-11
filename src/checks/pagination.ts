import type { CheckPack, CheckResult, PackContext } from "../types.js";

/**
 * Search-pagination behavior: how the server pages, whether its own `next` links can dead-end,
 * and whether cursor pagination is available. Motivated by production incidents where
 * offset-based `next` links silently strand records past a server-side offset cap.
 */
export const paginationPack: CheckPack = {
  name: "pagination",
  description: "Bundle next-link style, offset-cap behavior, cursor support",
  async run(ctx: PackContext): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    // 1. What do the server's own next links look like?
    const firstPage = await ctx.client.search("Patient", "_count=1");
    const nextLink: string | undefined = firstPage.json?.link?.find((l: any) => l.relation === "next")?.url;
    if (nextLink) {
      const style = /_cursor=/.test(nextLink) ? "cursor" : /_offset=/.test(nextLink) ? "offset" : "other";
      results.push({
        id: "pagination.next-link-style",
        title: "Pagination style of server-issued next links",
        status: style === "offset" ? "warn" : "info",
        details:
          style === "offset"
            ? "Server issues offset-based next links. If the server also caps _offset, clients that follow these links can hit a hard error mid-pagination and silently miss records past the cap."
            : `Server issues ${style}-based next links.`,
        evidence: { nextLink: nextLink.slice(0, 300) },
        references: ["FHIR R4 §3.1.0.5 Paging"],
      });
    } else {
      results.push({
        id: "pagination.next-link-style",
        title: "Pagination style of server-issued next links",
        status: "info",
        details: "No next link on a _count=1 search (dataset may hold fewer than 2 matches).",
      });
    }

    // 2. Offset-cap probe: does a large _offset produce a hard error?
    const probe = await ctx.client.search("Patient", "_offset=10001&_count=1");
    if (probe.status === 400) {
      results.push({
        id: "pagination.offset-cap",
        title: "Server enforces a maximum search offset",
        status: "warn",
        details:
          "Requests beyond the offset cap fail with HTTP 400. Combined with offset-based next links, sync jobs paging a large result set will crash mid-run and records past the cap become unreachable by offset pagination — a data-completeness hazard. Use cursor/keyset pagination for large sets.",
        evidence: {
          status: probe.status,
          outcome: probe.json?.issue?.[0]?.details?.text ?? probe.text.slice(0, 200),
        },
      });
    } else {
      results.push({
        id: "pagination.offset-cap",
        title: "Server enforces a maximum search offset",
        status: "info",
        details: `_offset=10001 returned HTTP ${probe.status} (no hard cap observed at this offset).`,
      });
    }

    // 3. Cursor support probe.
    const cursorProbe = await ctx.client.search("Patient", "_sort=_lastUpdated&_count=20");
    const cursorNext: string | undefined = cursorProbe.json?.link?.find(
      (l: any) => l.relation === "next",
    )?.url;
    results.push({
      id: "pagination.cursor-support",
      title: "Cursor pagination availability (_sort=_lastUpdated ascending)",
      status: cursorNext && /_cursor=/.test(cursorNext) ? "pass" : "info",
      details:
        cursorNext && /_cursor=/.test(cursorNext)
          ? "Server supports cursor-based next links for _lastUpdated-ascending searches — the safe pattern for large syncs."
          : "No cursor-based next link observed; verify the server's documented pagination limits before relying on offset paging for large datasets.",
      evidence: cursorNext ? { nextLink: cursorNext.slice(0, 300) } : undefined,
    });

    // 4. Unsorted paging warning (correctness, not just limits).
    results.push({
      id: "pagination.unsorted-stability",
      title: "Unsorted offset paging over a mutating dataset",
      status: "info",
      details:
        "Reminder check: offset paging without an explicit _sort can silently skip or duplicate records when the dataset changes between pages. Sync jobs should always pass an explicit _sort plus cursor/keyset iteration.",
    });

    return results;
  },
};
