/**
 * A single minimal, key-agnostic authenticated-call check against a service.
 *
 * Each Probe knows how to make exactly one low-cost authenticated call and
 * interpret the result — enough to answer "does this credential work?"
 * without hammering the service with retries.
 */
export interface ProbeResult {
  /** True only when the call succeeded and the response matched the expected shape. */
  ok: boolean;
  /** Human-readable explanation of the outcome — printed to the console as-is. */
  detail: string;
}

export interface Probe {
  /** Registry key / CLI argument, e.g. "gymmaster". */
  name: string;
  /** Environment variable names that must be set before run() is called. */
  requiredEnv: string[];
  /** Perform the single authenticated probe call and classify the outcome. */
  run(): Promise<ProbeResult>;
}
