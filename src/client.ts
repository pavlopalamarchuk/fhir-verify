/** Minimal FHIR R4 HTTP client that captures the raw response details every check needs. */

export interface FhirResponse {
  status: number;
  headers: Record<string, string>;
  /** Parsed JSON body when the payload was JSON, else undefined. */
  json?: any;
  /** Raw text body (always captured, truncated). */
  text: string;
  contentType: string;
}

export class FhirClient {
  constructor(
    public baseUrl: string,
    private token?: string,
    /** Path prefix between the base URL and resource paths, e.g. "/fhir/R4" (Medplum) or "" (HAPI). */
    public prefix: string = "/fhir/R4",
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    // A prefix that is not a path ("evil.com/fhir") would silently redirect
    // token-bearing requests to another host via URL concatenation.
    if (this.prefix !== "" && !this.prefix.startsWith("/")) {
      throw new Error(`prefix must be empty or start with "/" (got "${this.prefix}")`);
    }
  }

  withToken(token: string): FhirClient {
    return new FhirClient(this.baseUrl, token, this.prefix);
  }

  async request(
    method: string,
    path: string,
    opts: {
      body?: unknown;
      accept?: string;
      contentType?: string;
      rawBody?: string;
      headers?: Record<string, string>;
    } = {},
  ): Promise<FhirResponse> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { ...opts.headers };
    if (opts.accept !== undefined) headers["Accept"] = opts.accept;
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    let body: string | undefined;
    if (opts.rawBody !== undefined) {
      body = opts.rawBody;
      headers["Content-Type"] = opts.contentType ?? "text/plain";
    } else if (opts.body !== undefined) {
      body = JSON.stringify(opts.body);
      headers["Content-Type"] = opts.contentType ?? "application/fhir+json";
    }
    const res = await fetch(url, { method, headers, body });
    const outHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => (outHeaders[k.toLowerCase()] = v));
    const text = await res.text();
    const contentType = outHeaders["content-type"] ?? "";
    let json: any;
    if (/json/.test(contentType)) {
      try {
        json = JSON.parse(text);
      } catch {
        /* leave undefined — the mismatch itself is evidence */
      }
    }
    return { status: res.status, headers: outHeaders, json, text: text.slice(0, 20_000), contentType };
  }

  get(path: string, accept = "application/fhir+json") {
    return this.request("GET", path, { accept });
  }
  create(resourceType: string, resource: unknown) {
    // Prefer: return=representation — servers MAY answer 201 with an empty body,
    // and the checks need the assigned id back.
    return this.request("POST", `${this.prefix}/${resourceType}`, {
      body: resource,
      accept: "application/fhir+json",
      headers: { Prefer: "return=representation" },
    });
  }
  read(resourceType: string, id: string, accept = "application/fhir+json") {
    return this.request("GET", `${this.prefix}/${resourceType}/${id}`, { accept });
  }
  update(resourceType: string, id: string, resource: unknown) {
    return this.request("PUT", `${this.prefix}/${resourceType}/${id}`, {
      body: resource,
      accept: "application/fhir+json",
    });
  }
  delete(resourceType: string, id: string) {
    return this.request("DELETE", `${this.prefix}/${resourceType}/${id}`, {
      accept: "application/fhir+json",
    });
  }
  search(resourceType: string, query: string) {
    return this.request("GET", `${this.prefix}/${resourceType}?${query}`, {
      accept: "application/fhir+json",
    });
  }
}

/** Identifier system stamped on every synthetic resource this tool creates. */
export const TEST_IDENTIFIER_SYSTEM = "urn:fhir-verify:synthetic";

/**
 * Resolve the id of a just-created resource: body first, then the Location
 * header (servers may answer 201 with no body even when Prefer is sent).
 * Returns undefined when no id can be determined — callers must then stop
 * rather than probe or track "undefined".
 */
export function createdId(resourceType: string, res: FhirResponse): string | undefined {
  if (typeof res.json?.id === "string" && res.json.id) return res.json.id;
  const loc = res.headers["location"] ?? res.headers["content-location"];
  const m = loc?.match(new RegExp(`${resourceType}/([^/?#]+)`));
  return m?.[1];
}

export function syntheticPatient(tag: string) {
  return {
    resourceType: "Patient",
    identifier: [{ system: TEST_IDENTIFIER_SYSTEM, value: tag }],
    name: [{ family: "FhirVerify", given: ["Synthetic", tag] }],
    active: true,
  };
}
