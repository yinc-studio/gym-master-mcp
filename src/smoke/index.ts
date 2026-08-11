import type { Probe } from "./types.js";
import { gymmasterProbe } from "./gymmaster.js";

/**
 * Registry of available smoke probes, keyed by CLI argument name.
 *
 * Add a new service (e.g. Paycor) by implementing a Probe and registering
 * it here — the CLI, env-var checks, and PASS/FAIL reporting are shared.
 */
export const probes: Record<string, Probe> = {
  gymmaster: gymmasterProbe,
};
