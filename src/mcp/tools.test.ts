import { describe, expect, it, vi } from "vitest";
import type { GymMasterClient } from "../lib/gymmaster/index.js";
import { createToolHandlers } from "./tools.js";

function clientStub(overrides: Partial<GymMasterClient> = {}): GymMasterClient {
  return {
    listKpiCategories: vi.fn().mockResolvedValue({ result: ["attendance"], cachedResult: false }),
    listKpiFields: vi.fn().mockResolvedValue({ result: ["member_count"], cachedResult: false }),
    getKpisByFields: vi.fn().mockResolvedValue({ result: {}, cachedResult: false }),
    listStandardReports: vi.fn().mockResolvedValue({
      result: [{ id: 42, name: "Current Memberships", category: "Members" }],
      cachedResult: true,
    }),
    runStandardReport: vi.fn().mockResolvedValue({
      result: [
        { "Member ID": "m-1", "Membership Type Name": "Alpha Plan" },
        { "Member ID": "m-1", "Membership Type Name": "Alpha Plan" },
        { "Member ID": "m-2", "Membership Type Name": "Beta Plan" },
      ],
      cachedResult: false,
    }),
    ...overrides,
  };
}

describe("MCP tool handlers", () => {
  it("rejects an invalid date before invoking the client", async () => {
    const client = clientStub();
    const result = await createToolHandlers(client).getKpisByFields({
      start_date: "2026-02-30",
      end_date: "2026-03-01",
      fields: ["member_count"],
    });

    expect(result).toMatchObject({ error_type: "invalid_input" });
    expect(client.getKpisByFields).not.toHaveBeenCalled();
  });

  it("rejects an inverted range and empty fields before invoking the client", async () => {
    const client = clientStub();
    const handlers = createToolHandlers(client);

    await expect(
      handlers.getKpisByFields({
        start_date: "2026-03-02",
        end_date: "2026-03-01",
        fields: [],
      }),
    ).resolves.toMatchObject({ error_type: "invalid_input" });
    expect(client.getKpisByFields).not.toHaveBeenCalled();
  });

  it("returns source-level provenance for KPI and standard-report calls", async () => {
    const client = clientStub({
      getKpisByFields: vi.fn().mockResolvedValue({
        result: {
          member_count: {
            name: "Members",
            id: 1,
            metric: "count",
            quantity: 2,
            taxvalue: null,
            tooltip: "Synthetic member count.",
            value: 2,
            formatted_value: "2",
          },
        },
        cachedResult: true,
      }),
    });
    const handlers = createToolHandlers(client);

    await expect(
      handlers.getKpisByFields({
        start_date: "2026-03-01",
        end_date: "2026-03-07",
        fields: ["member_count"],
      }),
    ).resolves.toMatchObject({
      start_date: "2026-03-01",
      end_date: "2026-03-07",
      provenance: {
        endpoint: "/api/v2/report/kpi/fields",
        method: "POST",
        source_fields: ["member_count"],
        cached_result: true,
      },
    });
    await expect(
      handlers.runStandardReport({
        report_id: 42,
        start_date: "2026-03-01",
        end_date: "2026-03-07",
      }),
    ).resolves.toMatchObject({
      start_date: "2026-03-01",
      end_date: "2026-03-07",
      provenance: {
        endpoint: "/api/v2/report/standard_report",
        method: "POST",
        report_id: 42,
      },
    });
  });

  it("rejects invalid report IDs before invoking the client", async () => {
    const client = clientStub();
    const handlers = createToolHandlers(client);

    await expect(
      handlers.runStandardReport({
        report_id: 1.5,
        start_date: "2026-03-01",
        end_date: "2026-03-07",
      }),
    ).resolves.toMatchObject({ error_type: "invalid_input" });
    await expect(
      handlers.countMemberships({
        report_id: 0,
        start_date: "2026-03-01",
        end_date: "2026-03-07",
      }),
    ).resolves.toMatchObject({ error_type: "invalid_input" });
    expect(client.listStandardReports).not.toHaveBeenCalled();
    expect(client.runStandardReport).not.toHaveBeenCalled();
  });

  it("counts distinct members, preserves unmatched types, and includes provenance", async () => {
    const client = clientStub();
    const result = await createToolHandlers(client).countMemberships({
      start_date: "2026-03-01",
      end_date: "2026-03-07",
      buckets: [{ name: "Core", membership_types: ["Alpha Plan"] }],
    });

    expect(result).toMatchObject({
      roster_total: 2,
      matched_total: 1,
      per_type: [
        { type: "Alpha Plan", count: 1 },
        { type: "Beta Plan", count: 1 },
      ],
      buckets: [{ name: "Core", count: 1, matched_types: ["Alpha Plan"] }],
      unmatched: [{ type: "Beta Plan", count: 1 }],
      provenance: {
        report_id: 42,
        report_name: "Current Memberships",
        counting_key: "Member ID",
        membership_type_column: "Membership Type Name",
      },
    });
  });

  it("supports unbucketed membership-type discovery deterministically", async () => {
    const client = clientStub();
    const result = await createToolHandlers(client).countMemberships({
      start_date: "2026-03-01",
      end_date: "2026-03-07",
    });

    expect(result).toMatchObject({
      roster_total: 2,
      matched_total: 0,
      per_type: [
        { type: "Alpha Plan", count: 1 },
        { type: "Beta Plan", count: 1 },
      ],
      buckets: [],
      unmatched: [
        { type: "Alpha Plan", count: 1 },
        { type: "Beta Plan", count: 1 },
      ],
    });
  });

  it("rejects exact membership types assigned to multiple buckets before network access", async () => {
    const client = clientStub();
    const result = await createToolHandlers(client).countMemberships({
      start_date: "2026-03-01",
      end_date: "2026-03-07",
      buckets: [
        { name: "A", membership_types: ["Alpha Plan"] },
        { name: "B", membership_types: ["Alpha Plan"] },
      ],
    });

    expect(result).toMatchObject({ error_type: "invalid_input" });
    expect(client.listStandardReports).not.toHaveBeenCalled();
    expect(client.runStandardReport).not.toHaveBeenCalled();
  });

  it("rejects overlapping prefix buckets before invoking the client", async () => {
    const client = clientStub();
    const result = await createToolHandlers(client).countMemberships({
      start_date: "2026-03-01",
      end_date: "2026-03-07",
      match: "prefix",
      buckets: [
        { name: "A", membership_types: ["Alpha"] },
        { name: "B", membership_types: ["Alpha Plan"] },
      ],
    });

    expect(result).toMatchObject({ error_type: "invalid_input" });
    expect(client.listStandardReports).not.toHaveBeenCalled();
    expect(client.runStandardReport).not.toHaveBeenCalled();
  });

  it("fails closed when report discovery is ambiguous", async () => {
    const client = clientStub({
      listStandardReports: vi.fn().mockResolvedValue({
        result: [
          { id: 42, name: "Current Memberships", category: "Members" },
          { id: 43, name: " current   memberships ", category: "Members" },
        ],
      }),
    });

    const result = await createToolHandlers(client).countMemberships({
      start_date: "2026-03-01",
      end_date: "2026-03-07",
    });

    expect(result).toMatchObject({ error_type: "unsupported_contract" });
    expect(client.runStandardReport).not.toHaveBeenCalled();
  });

  it("fails closed when the discovered roster report has an invalid id", async () => {
    const client = clientStub({
      listStandardReports: vi.fn().mockResolvedValue({
        result: [{ id: 0, name: "Current Memberships", category: "Members" }],
      }),
    });

    const result = await createToolHandlers(client).countMemberships({
      start_date: "2026-03-01",
      end_date: "2026-03-07",
    });

    expect(result).toMatchObject({ error_type: "unsupported_contract" });
    expect(client.runStandardReport).not.toHaveBeenCalled();
  });

  it("fails closed when a roster row lacks the verified membership columns", async () => {
    const client = clientStub({
      runStandardReport: vi.fn().mockResolvedValue({
        result: [{ "Member Code": "m-1", "Membership Type": "Alpha Plan" }],
      }),
    });

    const result = await createToolHandlers(client).countMemberships({
      start_date: "2026-03-01",
      end_date: "2026-03-07",
    });

    expect(result).toMatchObject({ error_type: "unsupported_contract" });
  });

  it("fails closed when the verified member key is blank", async () => {
    const client = clientStub({
      runStandardReport: vi.fn().mockResolvedValue({
        result: [{ "Member ID": "  ", "Membership Type Name": "Alpha Plan" }],
      }),
    });

    const result = await createToolHandlers(client).countMemberships({
      start_date: "2026-03-01",
      end_date: "2026-03-07",
    });

    expect(result).toMatchObject({ error_type: "unsupported_contract" });
  });
});
