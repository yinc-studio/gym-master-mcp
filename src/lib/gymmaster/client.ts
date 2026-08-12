const DEFAULT_TIMEOUT_MS = 10_000;
const CLUB_DNS_LABEL = /^(?!-)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export type GymMasterErrorType =
  | "auth"
  | "network"
  | "timeout"
  | "api"
  | "invalid_input"
  | "unsupported_contract";

export class GymMasterClientError extends Error {
  constructor(
    readonly type: GymMasterErrorType,
    message: string,
  ) {
    super(message);
    this.name = "GymMasterClientError";
  }
}

interface GymMasterConfig {
  club: string;
  apiKey: string;
}

export interface GymMasterResponse<T> {
  result: T;
  cachedResult?: boolean;
}

export interface GymMasterClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface KpiFieldsRequest {
  startDate: string;
  endDate: string;
  fields: string[];
  companyId?: number | null;
}

export interface StandardReportRequest {
  reportId: number;
  startDate: string;
  endDate: string;
  displaymode?: "CURRENT" | "ALL" | "HIDDEN";
  requiredColumns?: string[];
  companyId?: number | null;
}

export interface StandardReportSummary {
  id: number;
  name: string;
  category: string;
}

export interface KpiRow {
  name: string;
  id: number;
  metric: string;
  quantity: number | null;
  taxvalue: string | null;
  tooltip: string | null;
  value: number | null;
  formatted_value: string;
}

export interface GymMasterClient {
  listKpiCategories(): Promise<GymMasterResponse<string[]>>;
  listKpiFields(): Promise<GymMasterResponse<string[]>>;
  getKpisByFields(request: KpiFieldsRequest): Promise<GymMasterResponse<Record<string, KpiRow>>>;
  listStandardReports(predefinedOnly?: boolean): Promise<GymMasterResponse<StandardReportSummary[]>>;
  runStandardReport(request: StandardReportRequest): Promise<GymMasterResponse<Record<string, unknown>[]>>;
}

export function createGymMasterConfig(
  env: NodeJS.ProcessEnv = process.env,
): GymMasterConfig {
  const club = requireNonblank(env.GYMMASTER_CLUB, "GYMMASTER_CLUB");
  const apiKey = requireNonblank(env.GYMMASTER_API_KEY, "GYMMASTER_API_KEY");

  if (!CLUB_DNS_LABEL.test(club)) {
    throw new GymMasterClientError(
      "invalid_input",
      "GYMMASTER_CLUB must be a single subdomain DNS label, not a URL or hostname.",
    );
  }

  return { club, apiKey };
}

export function createGymMasterClient(
  options: GymMasterClientOptions = {},
): GymMasterClient {
  const config = createGymMasterConfig();
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const request = createRequester(config, fetchImpl, timeoutMs);

  return {
    async listKpiCategories() {
      const response = await request("/api/v2/report/kpi/categories/list", "GET");
      return withExpectedResult(response, isStringArray, "KPI categories must be a string array.");
    },
    async listKpiFields() {
      const response = await request("/api/v2/report/kpi/fields/list", "GET");
      return withExpectedResult(response, isStringArray, "KPI fields must be a string array.");
    },
    async getKpisByFields(input) {
      const body: Record<string, unknown> = {
        date: { start: input.startDate, end: input.endDate },
        selected_fields: input.fields,
      };
      if (input.companyId !== undefined) body.company_id = input.companyId;
      const response = await request("/api/v2/report/kpi/fields", "POST", body);
      return withExpectedResult(
        response,
        isKpiResult,
        "KPI fields response has an unexpected row shape.",
      );
    },
    async listStandardReports(predefinedOnly = true) {
      const response = await request(
        `/api/v2/report/standard_report/list?predefined_only=${predefinedOnly}`,
        "GET",
      );
      return withExpectedResult(
        response,
        isStandardReportList,
        "Standard report list has an unexpected shape.",
      );
    },
    async runStandardReport(input) {
      const body: Record<string, unknown> = {
        report_id: input.reportId,
        start_date: input.startDate,
        end_date: input.endDate,
      };
      if (input.displaymode !== undefined) body.displaymode = input.displaymode;
      if (input.requiredColumns !== undefined) body.required_columns = input.requiredColumns;
      if (input.companyId !== undefined) body.company_id = input.companyId;

      const response = await request("/api/v2/report/standard_report", "POST", body);
      const normalized = normalizeInnerReportEnvelope(response);
      return withExpectedResult(
        normalized,
        isRecordArray,
        "Standard report result must be an array of row objects.",
      );
    },
  };
}

function createRequester(
  config: GymMasterConfig,
  fetchImpl: typeof fetch,
  timeoutMs: number,
) {
  return async (
    path: string,
    method: "GET" | "POST",
    body?: Record<string, unknown>,
  ): Promise<GymMasterResponse<unknown>> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response: Response;
      try {
        response = await fetchImpl(
          `https://${config.club}.gymmasteronline.com${path}`,
          {
            method,
            headers: {
              "X-GM-API-KEY": config.apiKey,
              ...(body ? { "content-type": "application/json" } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: controller.signal,
          },
        );
      } catch (error) {
        if (isAbortError(error)) {
          throw new GymMasterClientError("timeout", `GymMaster request timed out after ${timeoutMs}ms.`);
        }
        throw new GymMasterClientError("network", "Could not reach the GymMaster Reporting API.");
      }

      if (response.status === 401 || response.status === 403) {
        throw new GymMasterClientError("auth", `GymMaster authentication failed (HTTP ${response.status}).`);
      }
      if (!response.ok) {
        throw new GymMasterClientError("api", `GymMaster returned HTTP ${response.status}.`);
      }

      let bodyText: string;
      try {
        bodyText = await response.text();
      } catch (error) {
        if (isAbortError(error)) {
          throw new GymMasterClientError("timeout", `GymMaster request timed out after ${timeoutMs}ms.`);
        }
        throw new GymMasterClientError(
          "network",
          "GymMaster response body could not be read from the network.",
        );
      }

      let payload: unknown;
      try {
        payload = JSON.parse(bodyText);
      } catch {
        throw new GymMasterClientError(
          "unsupported_contract",
          "GymMaster returned malformed JSON instead of its reporting envelope.",
        );
      }

      return normalizeEnvelope(payload);
    } finally {
      clearTimeout(timeout);
    }
  };
}

function normalizeEnvelope(payload: unknown): GymMasterResponse<unknown> {
  if (!isRecord(payload) || !("result" in payload) || !("error" in payload)) {
    throw new GymMasterClientError(
      "unsupported_contract",
      "GymMaster response did not match the expected {result, error} envelope.",
    );
  }
  if (hasApiError(payload.error)) {
    throw new GymMasterClientError("api", "GymMaster response envelope carries an API error.");
  }
  if ("cached_result" in payload && typeof payload.cached_result !== "boolean") {
    throw new GymMasterClientError(
      "unsupported_contract",
      "GymMaster response cached_result must be boolean when present.",
    );
  }

  return {
    result: payload.result,
    cachedResult: typeof payload.cached_result === "boolean" ? payload.cached_result : undefined,
  };
}

function normalizeInnerReportEnvelope(
  response: GymMasterResponse<unknown>,
): GymMasterResponse<unknown> {
  if (!isRecord(response.result) || !("error" in response.result)) return response;
  if (hasApiError(response.result.error)) {
    throw new GymMasterClientError("api", "GymMaster standard report carries an inner API error.");
  }
  if (!("result" in response.result)) {
    throw new GymMasterClientError(
      "unsupported_contract",
      "GymMaster standard report inner envelope has no result.",
    );
  }
  if (
    "cached_result" in response.result &&
    typeof response.result.cached_result !== "boolean"
  ) {
    throw new GymMasterClientError(
      "unsupported_contract",
      "GymMaster standard report inner cached_result must be boolean when present.",
    );
  }
  return {
    result: response.result.result,
    cachedResult:
      typeof response.result.cached_result === "boolean"
        ? response.result.cached_result
        : response.cachedResult,
  };
}

function withExpectedResult<T>(
  response: GymMasterResponse<unknown>,
  guard: (value: unknown) => value is T,
  message: string,
): GymMasterResponse<T> {
  if (!guard(response.result)) {
    throw new GymMasterClientError("unsupported_contract", message);
  }
  return { result: response.result, cachedResult: response.cachedResult };
}

function requireNonblank(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new GymMasterClientError("invalid_input", `${name} must be nonblank.`);
  }
  return trimmed;
}

function hasApiError(value: unknown): boolean {
  return value !== null && !(Array.isArray(value) && value.length === 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

function isKpiResult(value: unknown): value is Record<string, KpiRow> {
  return isRecord(value) && Object.values(value).every(isKpiRow);
}

function isKpiRow(value: unknown): value is KpiRow {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.id === "number" &&
    Number.isInteger(value.id) &&
    typeof value.metric === "string" &&
    (value.quantity === null ||
      (typeof value.quantity === "number" && Number.isInteger(value.quantity))) &&
    (value.taxvalue === null || typeof value.taxvalue === "string") &&
    (value.tooltip === null || typeof value.tooltip === "string") &&
    (value.value === null || typeof value.value === "number") &&
    typeof value.formatted_value === "string"
  );
}

function isStandardReportList(value: unknown): value is StandardReportSummary[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === "number" &&
        typeof item.name === "string" &&
        typeof item.category === "string",
    )
  );
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
