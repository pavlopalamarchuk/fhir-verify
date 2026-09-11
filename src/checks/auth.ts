import type { CheckPack, CheckResult, PackContext } from "../types.js";

/**
 * OAuth2 token-audience hygiene: with client credentials provided, verifies that the access_token
 * authorizes FHIR requests and that an id_token used as Bearer is rejected (aud validation per
 * RFC 8725 §3.9/§3.12). Motivated by a production outage where a client had always sent the
 * id_token and broke the day the server began validating audiences.
 */
export const authPack: CheckPack = {
  name: "auth",
  description: "Client-credentials token usage: access_token accepted, id_token rejected",
  async run(ctx: PackContext): Promise<CheckResult[]> {
    const { clientId, clientSecret, tokenUrl, serverUrl } = ctx.config;
    if (!clientId || !clientSecret) {
      return [
        {
          id: "auth.skipped",
          title: "Token-audience checks",
          status: "skip",
          details: "No --client-id/--client-secret provided; auth pack skipped.",
        },
      ];
    }
    const results: CheckResult[] = [];
    const url = tokenUrl ?? `${serverUrl.replace(/\/+$/, "")}/oauth2/token`;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    });
    const tokenRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const tokenJson: any = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenJson.access_token) {
      return [
        {
          id: "auth.token-mint",
          title: "Mint client-credentials token",
          status: "fail",
          details: `Token endpoint returned ${tokenRes.status}.`,
        },
      ];
    }
    results.push({
      id: "auth.token-mint",
      title: "Mint client-credentials token",
      status: "pass",
      details: `Token minted (expires_in=${tokenJson.expires_in ?? "n/a"}; id_token ${tokenJson.id_token ? "present" : "absent"}).`,
    });

    const withAccess = await ctx.client.withToken(tokenJson.access_token).search("Patient", "_count=1");
    results.push({
      id: "auth.access-token-works",
      title: "access_token authorizes FHIR requests",
      status: withAccess.status === 200 ? "pass" : "fail",
      details: `GET Patient?_count=1 with access_token → HTTP ${withAccess.status}.`,
    });

    if (tokenJson.id_token) {
      const withId = await ctx.client.withToken(tokenJson.id_token).search("Patient", "_count=1");
      // Only a 2xx means the id_token was ACCEPTED; 401/403/400 are all
      // rejections (403 = authenticated-but-forbidden is still audience
      // validation doing its job).
      const accepted = withId.status >= 200 && withId.status < 300;
      results.push({
        id: "auth.id-token-rejected",
        title: "id_token used as Bearer is rejected (audience validation)",
        status: accepted ? "warn" : "pass",
        details: accepted
          ? `Server accepted an id_token as Bearer (HTTP ${withId.status}). Clients that depend on this will break when audience validation is enabled — send the access_token only.`
          : `Server rejects id_token as Bearer (HTTP ${withId.status}) — audience validation active, per JWT best practices.`,
        references: ["RFC 8725 §3.9, §3.12 (JWT BCP)", "OIDC Core §2 (ID Token audience)"],
      });
    }
    return results;
  },
};
