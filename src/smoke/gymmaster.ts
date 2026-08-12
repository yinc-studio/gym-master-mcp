import type { Probe, ProbeResult } from "./types.js";
import {
  createGymMasterClient,
  GymMasterClientError,
  type GymMasterClientOptions,
} from "../lib/gymmaster/index.js";

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
  options: GymMasterClientOptions = {},
): Probe {
  return {
    name: "gymmaster",
    requiredEnv: ["GYMMASTER_CLUB", "GYMMASTER_API_KEY"],
    async run(): Promise<ProbeResult> {
      try {
        const categories = await createGymMasterClient(options).listKpiCategories();
        return {
          ok: true,
          detail: `GymMaster categories endpoint returned ${categories.result.length} categor${categories.result.length === 1 ? "y" : "ies"}.`,
        };
      } catch (error) {
        if (error instanceof GymMasterClientError) {
          return { ok: false, detail: `${error.type}: ${error.message}` };
        }
        return { ok: false, detail: "api: GymMaster smoke probe failed unexpectedly." };
      }
    },
  };
}

export const gymmasterProbe = createGymMasterProbe();
