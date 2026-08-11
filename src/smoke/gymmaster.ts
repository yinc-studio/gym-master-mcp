import type { Probe, ProbeResult } from "./types.js";

const TIMEOUT_MS = 10_000;
const EXCERPT_MAX_CHARS = 300;

/**
 * GymMaster Reporting API v2 smoke probe.
 *
 * Makes a single GET to the categories/list endpoint — the cheapest
 * authenticated call available — and classifies the outcome into one of:
 * unreachable club subdomain, bad/rejected key, malformed response, or pass.
 *
 * `fetchImpl` is injectable so tests can exercise the classification logic
 * without making real network calls.
 */
export function createGymMasterProbe(
  fetchImpl: typeof fetch = fetch,
): Probe {
  return {
    name: "gymmaster",
    requiredEnv: ["GYMMASTER_CLUB", "GYMMASTER_API_KEY"],
    async run(): Promise<ProbeResult> {
      const club = process.env.GYMMASTER_CLUB;
      const apiKey = process.env.GYMMASTER_API_KEY;
      const url = `https://${club}.gymmasteronline.com/api/v2/report/kpi/categories/list`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        let response: Response;
        try {
          response = await fetchImpl(url, {
            method: "GET",
            headers: { "X-GM-API-KEY": apiKey ?? "" },
            signal: controller.signal,
          });
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            return {
              ok: false,
              detail: `Timed out after ${TIMEOUT_MS}ms waiting for ${url}. The club subdomain may be wrong, or the API is slow/unreachable.`,
            };
          }
          const cause = err instanceof Error ? err.message : String(err);
          return {
            ok: false,
            detail: `Network error reaching ${url}: ${cause}. This usually means GYMMASTER_CLUB is wrong (the "${club}" subdomain does not resolve) or there is no network path to it.`,
          };
        }

        const bodyText = await response.text();

        if (response.status === 401 || response.status === 403) {
          return {
            ok: false,
            detail: `Authentication failed (HTTP ${response.status}) for ${url}. GYMMASTER_API_KEY is likely invalid, revoked, or lacks Reporting API v2 access. Body: ${excerpt(bodyText)}`,
          };
        }

        if (response.status < 200 || response.status >= 300) {
          return {
            ok: false,
            detail: `Unexpected HTTP status ${response.status} from ${url}. Body: ${excerpt(bodyText)}`,
          };
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(bodyText);
        } catch {
          return {
            ok: false,
            detail: `Got HTTP ${response.status} but the response body was not valid JSON. Body: ${excerpt(bodyText)}`,
          };
        }

        const envelopeError = extractEnvelopeError(parsed);
        if (envelopeError !== undefined) {
          return {
            ok: false,
            detail: `HTTP ${response.status} from ${url}, but the response envelope carries an error: ${envelopeError}. The key may lack Reporting API v2 permissions.`,
          };
        }

        return {
          ok: true,
          detail: `HTTP ${response.status} from ${url}. ${summarize(parsed)}`,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function excerpt(text: string, max = EXCERPT_MAX_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "(empty body)";
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function extractEnvelopeError(parsed: unknown): string | undefined {
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const error = (parsed as Record<string, unknown>).error;
    if (error !== undefined && error !== null && error !== false && error !== "") {
      return JSON.stringify(error);
    }
  }
  return undefined;
}

function summarize(parsed: unknown): string {
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.result)) {
      const count = obj.result.length;
      return `Received ${count} categor${count === 1 ? "y" : "ies"}.`;
    }
  }
  return "Parsed as JSON, but it did not match the expected {result, error} envelope shape.";
}

export const gymmasterProbe = createGymMasterProbe();
