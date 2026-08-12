import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGymMasterClient,
  createGymMasterConfig,
  GymMasterClientError,
} from "./client.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function kpiRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "New memberships",
    id: 1,
    metric: "memberships",
    quantity: null,
    taxvalue: null,
    tooltip: "Memberships sold in the period",
    value: 4,
    formatted_value: "4 memberships",
    ...overrides,
  };
}

describe("GymMaster client", () => {
  const originalClub = process.env.GYMMASTER_CLUB;
  const originalKey = process.env.GYMMASTER_API_KEY;

  beforeEach(() => {
    process.env.GYMMASTER_CLUB = "sample-club";
    process.env.GYMMASTER_API_KEY = "test-api-key";
  });

  afterEach(() => {
    process.env.GYMMASTER_CLUB = originalClub;
    process.env.GYMMASTER_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("trims nonblank environment values and makes category requests", async () => {
    process.env.GYMMASTER_CLUB = " sample-club ";
    process.env.GYMMASTER_API_KEY = " test-api-key ";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { result: ["member_statistics"], error: null }),
    );

    const client = createGymMasterClient({ fetchImpl: fetchMock as typeof fetch });

    await expect(client.listKpiCategories()).resolves.toEqual({
      result: ["member_statistics"],
      cachedResult: undefined,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sample-club.gymmasteronline.com/api/v2/report/kpi/categories/list",
      expect.objectContaining({
        method: "GET",
        headers: { "X-GM-API-KEY": "test-api-key" },
      }),
    );
  });

  it.each([
    ["GYMMASTER_CLUB", "  "],
    ["GYMMASTER_API_KEY", "\t"],
  ])("rejects a blank trimmed %s", (name, value) => {
    process.env[name] = value;

    expect(() => createGymMasterConfig()).toThrow(GymMasterClientError);
    expect(() => createGymMasterConfig()).toThrow(/nonblank/);
  });

  it.each(["https://sample-club", "sample-club.gymmasteronline.com", "bad club", "-bad", "bad-"])(
    "rejects %j as a club subdomain",
    (club) => {
      process.env.GYMMASTER_CLUB = club;

      expect(() => createGymMasterConfig()).toThrow(GymMasterClientError);
      expect(() => createGymMasterConfig()).toThrow(/subdomain DNS label/);
    },
  );

  it("maps KPI inputs to date and selected_fields wire fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        result: {
          new_memberships: kpiRow(),
        },
        error: [],
      }),
    );
    const client = createGymMasterClient({ fetchImpl: fetchMock as typeof fetch });

    await expect(
      client.getKpisByFields({
        startDate: "2026-07-24",
        endDate: "2026-07-30",
        fields: ["new_memberships"],
        companyId: 7,
      }),
    ).resolves.toMatchObject({
      result: { new_memberships: { value: 4 } },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://sample-club.gymmasteronline.com/api/v2/report/kpi/fields",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          date: { start: "2026-07-24", end: "2026-07-30" },
          selected_fields: ["new_memberships"],
          company_id: 7,
        }),
      }),
    );
  });

  it("provides list fields and standard report helpers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { result: ["current_members"], error: null }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          result: [{ id: 20, name: "Synthetic Report", category: "Member" }],
          error: null,
        }),
      );
    const client = createGymMasterClient({ fetchImpl: fetchMock as typeof fetch });

    await expect(client.listKpiFields()).resolves.toMatchObject({
      result: ["current_members"],
    });
    await expect(client.listStandardReports()).resolves.toMatchObject({
      result: [{ id: 20, name: "Synthetic Report", category: "Member" }],
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://sample-club.gymmasteronline.com/api/v2/report/standard_report/list?predefined_only=true",
    );
  });

  it("returns cached_result and fails closed on an inner standard-report error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          result: [{ "Synthetic ID": "1" }],
          error: null,
          cached_result: true,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          result: { result: [], error: "report unavailable" },
          error: null,
        }),
      );
    const client = createGymMasterClient({ fetchImpl: fetchMock as typeof fetch });

    await expect(
      client.runStandardReport({
        reportId: 20,
        startDate: "2026-07-24",
        endDate: "2026-07-30",
      }),
    ).resolves.toEqual({
      result: [{ "Synthetic ID": "1" }],
      cachedResult: true,
    });
    expect(fetchMock.mock.calls[0]).toEqual([
      "https://sample-club.gymmasteronline.com/api/v2/report/standard_report",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          report_id: 20,
          start_date: "2026-07-24",
          end_date: "2026-07-30",
        }),
      }),
    ]);
    await expect(
      client.runStandardReport({
        reportId: 20,
        startDate: "2026-07-24",
        endDate: "2026-07-30",
      }),
    ).rejects.toMatchObject({ type: "api" });
  });

  it("normalizes a nested standard-report envelope without dropping cached_result", async () => {
    const client = createGymMasterClient({
      fetchImpl: vi.fn().mockResolvedValue(
        jsonResponse(200, {
          result: {
            result: [{ "Synthetic ID": "1" }],
            error: [],
            cached_result: true,
          },
          error: null,
        }),
      ) as typeof fetch,
    });

    await expect(
      client.runStandardReport({
        reportId: 20,
        startDate: "2026-07-24",
        endDate: "2026-07-30",
      }),
    ).resolves.toEqual({
      result: [{ "Synthetic ID": "1" }],
      cachedResult: true,
    });
  });

  it.each([
    [401, { result: null, error: "denied" }, "auth"],
    [403, { result: null, error: "denied" }, "auth"],
    [500, { result: null, error: "server error" }, "api"],
  ])("classifies HTTP %i as %s without exposing the API key", async (status, body, type) => {
    const client = createGymMasterClient({
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(status, body)) as typeof fetch,
    });

    await expect(client.listKpiCategories()).rejects.toMatchObject({ type });
    await client.listKpiCategories().catch((error: unknown) => {
      expect(error).toBeInstanceOf(GymMasterClientError);
      expect((error as Error).message).not.toContain("test-api-key");
    });
  });

  it.each([
    [{ result: [{ id: 1 }], error: null }, "unsupported_contract"],
    [{ result: ["member_statistics"], error: ["permission missing"] }, "api"],
    [{ result: [1], error: null }, "unsupported_contract"],
  ])("fails closed for invalid category responses", async (body, type) => {
    const client = createGymMasterClient({
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(200, body)) as typeof fetch,
    });

    await expect(client.listKpiCategories()).rejects.toMatchObject({ type });
  });

  it.each([
    [{ result: ["member_statistics"] }, "expected {result, error} envelope"],
    [{ result: ["member_statistics"], error: null, cached_result: "yes" }, "cached_result"],
    [{ result: ["member_statistics"], error: "permission missing" }, "API error"],
  ])("rejects malformed or errored top-level envelopes", async (body, message) => {
    const client = createGymMasterClient({
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(200, body)) as typeof fetch,
    });

    await expect(client.listKpiCategories()).rejects.toThrow(message);
  });

  it("rejects malformed KPI rows and inner cache metadata", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          result: { new_memberships: kpiRow({ formatted_value: 4 }) },
          error: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          result: { result: [], error: null, cached_result: "false" },
          error: null,
        }),
      );
    const client = createGymMasterClient({ fetchImpl: fetchMock as typeof fetch });

    await expect(
      client.getKpisByFields({
        startDate: "2026-07-24",
        endDate: "2026-07-30",
        fields: ["new_memberships"],
      }),
    ).rejects.toMatchObject({ type: "unsupported_contract" });
    await expect(
      client.runStandardReport({
        reportId: 20,
        startDate: "2026-07-24",
        endDate: "2026-07-30",
      }),
    ).rejects.toMatchObject({ type: "unsupported_contract" });
  });

  it("classifies malformed JSON, network, and timeout failures", async () => {
    const malformed = createGymMasterClient({
      fetchImpl: vi.fn().mockResolvedValue(new Response("not JSON", { status: 200 })) as typeof fetch,
    });
    const network = createGymMasterClient({
      fetchImpl: vi.fn().mockRejectedValue(new TypeError("fetch failed")) as typeof fetch,
    });
    const timeoutError = new Error("aborted");
    timeoutError.name = "AbortError";
    const timeout = createGymMasterClient({
      fetchImpl: vi.fn().mockRejectedValue(timeoutError) as typeof fetch,
    });

    await expect(malformed.listKpiCategories()).rejects.toMatchObject({ type: "unsupported_contract" });
    await expect(network.listKpiCategories()).rejects.toMatchObject({ type: "network" });
    await expect(timeout.listKpiCategories()).rejects.toMatchObject({ type: "timeout" });
  });

  it("classifies response-body transport failures as network or timeout", async () => {
    const unreadable = new Response(null, { status: 200 });
    vi.spyOn(unreadable, "text").mockRejectedValue(new TypeError("socket closed"));
    const aborted = new Response(null, { status: 200 });
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.spyOn(aborted, "text").mockRejectedValue(abortError);

    const network = createGymMasterClient({
      fetchImpl: vi.fn().mockResolvedValue(unreadable) as typeof fetch,
    });
    const timeout = createGymMasterClient({
      fetchImpl: vi.fn().mockResolvedValue(aborted) as typeof fetch,
    });

    await expect(network.listKpiCategories()).rejects.toMatchObject({ type: "network" });
    await expect(timeout.listKpiCategories()).rejects.toMatchObject({ type: "timeout" });
  });
});
