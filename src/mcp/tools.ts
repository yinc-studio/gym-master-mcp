import {
  GymMasterClientError,
  type GymMasterClient,
  type GymMasterErrorType,
  type StandardReportSummary,
} from "../lib/gymmaster/index.js";

type ToolError = {
  error_type: GymMasterErrorType;
  message: string;
  candidates?: Array<{ id: number; name: string; category: string }>;
};
type ToolResult = Record<string, unknown> | ToolError;
type Bucket = { name: string; membership_types: string[] };

export interface ToolHandlers {
  listKpiCategories(): Promise<ToolResult>;
  listKpiFields(): Promise<ToolResult>;
  getKpisByFields(input: {
    start_date: string;
    end_date: string;
    fields: string[];
    company_id?: number | null;
  }): Promise<ToolResult>;
  listStandardReports(input?: { predefined_only?: boolean }): Promise<ToolResult>;
  runStandardReport(input: {
    report_id: number;
    start_date: string;
    end_date: string;
    displaymode?: "CURRENT" | "ALL" | "HIDDEN";
    required_columns?: string[];
    company_id?: number | null;
  }): Promise<ToolResult>;
  countMemberships(input: {
    start_date: string;
    end_date: string;
    report_id?: number;
    displaymode?: "CURRENT" | "ALL" | "HIDDEN";
    buckets?: Bucket[];
    match?: "exact" | "prefix";
  }): Promise<ToolResult>;
}

export function createToolHandlers(client: GymMasterClient): ToolHandlers {
  return {
    async listKpiCategories() {
      try {
        const response = await client.listKpiCategories();
        return success({ categories: response.result }, categoryProvenance(response.cachedResult));
      } catch (error) {
        return toToolError(error);
      }
    },

    async listKpiFields() {
      try {
        const response = await client.listKpiFields();
        return success({ fields: response.result }, fieldProvenance(response.cachedResult));
      } catch (error) {
        return toToolError(error);
      }
    },

    async getKpisByFields(input) {
      const validation = validateDateRange(input);
      if (validation) return validation;
      if (!Array.isArray(input.fields) || input.fields.length === 0 || input.fields.some(isBlank)) {
        return invalidInput("fields must be a non-empty array of nonblank strings.");
      }
      try {
        const response = await client.getKpisByFields({
          startDate: input.start_date,
          endDate: input.end_date,
          fields: input.fields,
          companyId: input.company_id,
        });
        return success(
          { kpis: response.result, start_date: input.start_date, end_date: input.end_date },
          {
            endpoint: "/api/v2/report/kpi/fields",
            method: "POST",
            request_summary: { field_count: input.fields.length, has_company_id: input.company_id !== undefined },
            source_fields: input.fields,
            cached_result: response.cachedResult ?? false,
          },
        );
      } catch (error) {
        return toToolError(error);
      }
    },

    async listStandardReports(input = {}) {
      try {
        const predefinedOnly = input.predefined_only ?? true;
        const response = await client.listStandardReports(predefinedOnly);
        return success(
          { reports: response.result },
          {
            endpoint: "/api/v2/report/standard_report/list",
            method: "GET",
            request_summary: { predefined_only: predefinedOnly },
            cached_result: response.cachedResult ?? false,
          },
        );
      } catch (error) {
        return toToolError(error);
      }
    },

    async runStandardReport(input) {
      const validation = validateDateRange(input);
      if (validation) return validation;
      if (!isPositiveInteger(input.report_id)) return invalidInput("report_id must be a positive integer.");
      if (
        input.required_columns !== undefined &&
        (!Array.isArray(input.required_columns) || input.required_columns.some(isBlank))
      ) {
        return invalidInput("required_columns must contain only nonblank strings.");
      }
      try {
        const response = await client.runStandardReport({
          reportId: input.report_id,
          startDate: input.start_date,
          endDate: input.end_date,
          displaymode: input.displaymode,
          requiredColumns: input.required_columns,
          companyId: input.company_id,
        });
        return success(
          { rows: response.result, start_date: input.start_date, end_date: input.end_date },
          {
            endpoint: "/api/v2/report/standard_report",
            method: "POST",
            request_summary: {
              report_id: input.report_id,
              displaymode: input.displaymode,
              required_column_count: input.required_columns?.length ?? 0,
              has_company_id: input.company_id !== undefined,
            },
            report_id: input.report_id,
            cached_result: response.cachedResult ?? false,
          },
        );
      } catch (error) {
        return toToolError(error);
      }
    },

    async countMemberships(input) {
      const validation = validateDateRange(input);
      if (validation) return validation;
      if (input.report_id !== undefined && !isPositiveInteger(input.report_id)) {
        return invalidInput("report_id must be a positive integer.");
      }
      const bucketValidation = validateBuckets(input.buckets ?? [], input.match ?? "exact");
      if (bucketValidation) return bucketValidation;

      try {
        const reportsResponse = await client.listStandardReports(true);
        const report = resolveRosterReport(reportsResponse.result, input.report_id);
        if ("error_type" in report) return report;

        const response = await client.runStandardReport({
          reportId: report.id,
          startDate: input.start_date,
          endDate: input.end_date,
          displaymode: input.displaymode ?? "CURRENT",
          requiredColumns: ["Member ID", "Membership Type Name"],
        });
        const members = rowsToMemberships(response.result);
        if ("error_type" in members) return members;
        const summary = summarizeMemberships(members, input.buckets ?? [], input.match ?? "exact");
        if ("error_type" in summary) return summary;

        return {
          ...summary,
          start_date: input.start_date,
          end_date: input.end_date,
          provenance: {
            endpoint: "/api/v2/report/standard_report",
            method: "POST",
            request_summary: {
              displaymode: input.displaymode ?? "CURRENT",
              required_column_count: 2,
            },
            report_id: report.id,
            report_name: report.name,
            counting_key: "Member ID",
            membership_type_column: "Membership Type Name",
            cached_result: response.cachedResult ?? false,
          },
        };
      } catch (error) {
        return toToolError(error);
      }
    },
  };
}

function success(payload: Record<string, unknown>, provenance: Record<string, unknown>): ToolResult {
  return { ...payload, provenance };
}

function categoryProvenance(cachedResult: boolean | undefined): Record<string, unknown> {
  return {
    endpoint: "/api/v2/report/kpi/categories/list",
    method: "GET",
    request_summary: {},
    cached_result: cachedResult ?? false,
  };
}

function fieldProvenance(cachedResult: boolean | undefined): Record<string, unknown> {
  return {
    endpoint: "/api/v2/report/kpi/fields/list",
    method: "GET",
    request_summary: {},
    cached_result: cachedResult ?? false,
  };
}

function validateDateRange(input: { start_date: string; end_date: string }): ToolError | undefined {
  if (!isIsoDate(input.start_date) || !isIsoDate(input.end_date)) {
    return invalidInput("start_date and end_date must be real calendar dates in YYYY-MM-DD format.");
  }
  if (input.start_date > input.end_date) {
    return invalidInput("start_date must not be after end_date.");
  }
  return undefined;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validateBuckets(buckets: Bucket[], match: "exact" | "prefix"): ToolError | undefined {
  const names = new Set<string>();
  const assignedTypes = new Set<string>();
  const prefixes: string[] = [];
  for (const bucket of buckets) {
    if (isBlank(bucket.name) || names.has(bucket.name)) {
      return invalidInput("bucket names must be nonblank and unique.");
    }
    names.add(bucket.name);
    const bucketTypes = new Set<string>();
    for (const type of bucket.membership_types) {
      if (isBlank(type) || bucketTypes.has(type)) {
        return invalidInput("membership_types must be nonblank and unique within each bucket.");
      }
      bucketTypes.add(type);
      if (match === "exact" && assignedTypes.has(type)) {
        return invalidInput("a membership type cannot be assigned to more than one bucket.");
      }
      assignedTypes.add(type);
      if (match === "prefix") prefixes.push(type);
    }
  }
  if (
    match === "prefix" &&
    prefixes.some((prefix, index) =>
      prefixes.slice(index + 1).some((other) => prefix.startsWith(other) || other.startsWith(prefix)),
    )
  ) {
    return invalidInput("prefix bucket membership types must not overlap.");
  }
  return undefined;
}

function resolveRosterReport(
  reports: StandardReportSummary[],
  reportId: number | undefined,
): StandardReportSummary | ToolError {
  if (reportId !== undefined) {
    const match = reports.find((report) => report.id === reportId);
    return match ?? unsupportedContract("report_id was not found in the predefined standard report list.");
  }
  const candidates = reports.filter((report) => normalizeName(report.name) === "current memberships");
  if (candidates.length !== 1) {
    return {
      error_type: "unsupported_contract",
      message: `Expected one predefined report named Current Memberships; found ${candidates.length}.`,
      candidates: candidates.map(({ id, name, category }) => ({ id, name, category })),
    };
  }
  const candidate = candidates[0]!;
  if (!isPositiveInteger(candidate.id)) {
    return unsupportedContract("Current Memberships report must have a positive integer report id.");
  }
  return candidate;
}

function rowsToMemberships(
  rows: Record<string, unknown>[],
): Map<string, string> | ToolError {
  const members = new Map<string, string>();
  for (const row of rows) {
    const memberId = row["Member ID"];
    const type = row["Membership Type Name"];
    if (
      (typeof memberId !== "string" && typeof memberId !== "number") ||
      (typeof memberId === "string" && memberId.trim() === "") ||
      (typeof memberId === "number" && !Number.isFinite(memberId))
    ) {
      return unsupportedContract("Current Memberships rows must contain a Member ID column.");
    }
    if (typeof type !== "string" || type.trim() === "") {
      return unsupportedContract("Current Memberships rows must contain a Membership Type Name column.");
    }
    const key = String(memberId);
    const previous = members.get(key);
    if (previous !== undefined && previous !== type) {
      return unsupportedContract("A member appears with multiple membership types; row grain is unsupported.");
    }
    members.set(key, type);
  }
  return members;
}

function summarizeMemberships(
  members: Map<string, string>,
  buckets: Bucket[],
  match: "exact" | "prefix",
): Record<string, unknown> | ToolError {
  const perType = new Map<string, number>();
  for (const type of members.values()) perType.set(type, (perType.get(type) ?? 0) + 1);

  const bucketResults = buckets.map((bucket) => ({ name: bucket.name, count: 0, matched_types: new Set<string>() }));
  const unmatched = new Map<string, number>();
  let matchedTotal = 0;
  for (const type of members.values()) {
    const matching = buckets
      .map((bucket, index) => ({ bucket, index }))
      .filter(({ bucket }) =>
        bucket.membership_types.some((candidate) => (match === "exact" ? type === candidate : type.startsWith(candidate))),
      );
    if (matching.length > 1) {
      return invalidInput(`membership type ${JSON.stringify(type)} matches multiple buckets.`);
    }
    if (matching.length === 1) {
      const target = bucketResults[matching[0]!.index]!;
      target.count += 1;
      target.matched_types.add(type);
      matchedTotal += 1;
    } else {
      unmatched.set(type, (unmatched.get(type) ?? 0) + 1);
    }
  }

  return {
    roster_total: members.size,
    matched_total: matchedTotal,
    per_type: [...perType.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((left, right) => left.type.localeCompare(right.type)),
    buckets: bucketResults.map(({ name, count, matched_types }) => ({
      name,
      count,
      matched_types: [...matched_types].sort(),
    })),
    unmatched: [...unmatched.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((left, right) => left.type.localeCompare(right.type)),
  };
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "";
}

function invalidInput(message: string): ToolError {
  return { error_type: "invalid_input", message };
}

function unsupportedContract(message: string): ToolError {
  return { error_type: "unsupported_contract", message };
}

function toToolError(error: unknown): ToolError {
  if (error instanceof GymMasterClientError) {
    return { error_type: error.type, message: error.message };
  }
  return { error_type: "api", message: "Unexpected GymMaster tool failure." };
}
