import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGymMasterProbe } from "./gymmaster.js";

function jsonResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("gymmaster probe", () => {
  const originalClub = process.env.GYMMASTER_CLUB;
  const originalKey = process.env.GYMMASTER_API_KEY;

  beforeEach(() => {
    process.env.GYMMASTER_CLUB = "performancegaines";
    process.env.GYMMASTER_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.GYMMASTER_CLUB = originalClub;
    process.env.GYMMASTER_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("passes on a 2xx response with a parseable {result, error} envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        200,
        JSON.stringify({
          result: [{ id: 1, name: "Attendance" }, { id: 2, name: "Revenue" }],
          error: null,
        }),
      ),
    );

    const probe = createGymMasterProbe(fetchMock as unknown as typeof fetch);
    const result = await probe.run();

    expect(result.ok).toBe(true);
    expect(result.detail).toContain("HTTP 200");
    expect(result.detail).toContain("2 categories");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("fetch was not called");
    const [url, init] = call;
    expect(url).toBe(
      "https://performancegaines.gymmasteronline.com/api/v2/report/kpi/categories/list",
    );
    expect((init?.headers as Record<string, string>)["X-GM-API-KEY"]).toBe(
      "test-key",
    );
  });

  it("fails with a clear reason on 401 (bad key)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(401, JSON.stringify({ error: "invalid api key" })),
      );

    const probe = createGymMasterProbe(fetchMock as unknown as typeof fetch);
    const result = await probe.run();

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("401");
    expect(result.detail.toLowerCase()).toContain("authentication failed");
    expect(result.detail).toContain("GYMMASTER_API_KEY");
  });

  it("fails with a clear reason on 403 (key rejected)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(403, JSON.stringify({ error: "forbidden" })));

    const probe = createGymMasterProbe(fetchMock as unknown as typeof fetch);
    const result = await probe.run();

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("403");
  });

  it("fails on a DNS/network error (bad club subdomain)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(
        new TypeError("fetch failed", {
          cause: new Error("getaddrinfo ENOTFOUND notarealclub.gymmasteronline.com"),
        }),
      );

    const probe = createGymMasterProbe(fetchMock as unknown as typeof fetch);
    const result = await probe.run();

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("Network error");
    expect(result.detail).toContain("GYMMASTER_CLUB");
  });

  it("fails on timeout / abort", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    const fetchMock = vi.fn().mockRejectedValue(abortError);

    const probe = createGymMasterProbe(fetchMock as unknown as typeof fetch);
    const result = await probe.run();

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("Timed out");
  });

  it("fails on a 2xx response whose envelope carries an error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        200,
        JSON.stringify({ result: null, error: "api key not permitted for reporting" }),
      ),
    );

    const probe = createGymMasterProbe(fetchMock as unknown as typeof fetch);
    const result = await probe.run();

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("envelope carries an error");
    expect(result.detail).toContain("api key not permitted for reporting");
  });

  it("fails on a 2xx response with malformed (non-JSON) body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, "<html>not json</html>"));

    const probe = createGymMasterProbe(fetchMock as unknown as typeof fetch);
    const result = await probe.run();

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("not valid JSON");
    expect(result.detail).toContain("HTTP 200");
  });

  it("fails on an unexpected non-2xx, non-401/403 status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, JSON.stringify({ error: "server error" })));

    const probe = createGymMasterProbe(fetchMock as unknown as typeof fetch);
    const result = await probe.run();

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("500");
  });
});
