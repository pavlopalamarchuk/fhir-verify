export type CheckStatus = "pass" | "fail" | "warn" | "info" | "skip";

export interface CheckResult {
  /** Stable identifier, e.g. "pagination.offset-cap" */
  id: string;
  title: string;
  status: CheckStatus;
  /** Human-readable explanation of what was observed. */
  details: string;
  /** Raw observed values worth keeping in the report (status codes, headers, link shapes). */
  evidence?: Record<string, unknown>;
  /** Related specs or docs (FHIR spec sections, RFCs, certification criteria). */
  references?: string[];
}

export interface RunConfig {
  serverUrl: string;
  /** Bearer token, if the server requires auth. */
  token?: string;
  /** OAuth2 client-credentials pair for the auth pack (optional). */
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  /** Which packs to run. */
  packs: string[];
  /** Path prefix between base URL and resources (default "/fhir/R4"; use "" for HAPI-style bases). */
  prefix: string;
  /** Directory for report output. */
  outDir: string;
  /** Exit-code policy: gate CI on 'fail' only (default) or also on 'warn'. */
  failOn: "fail" | "warn";
}

export interface CheckPack {
  name: string;
  description: string;
  run(ctx: PackContext): Promise<CheckResult[]>;
}

export interface PackContext {
  client: import("./client.js").FhirClient;
  config: RunConfig;
  /** Register a created resource for end-of-run cleanup. */
  trackForCleanup(resourceType: string, id: string): void;
}
