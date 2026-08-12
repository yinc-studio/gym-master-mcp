import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGymMasterProbe } from "./gymmaster.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("gymmaster smoke probe", () => {
  const originalClub = process.env.GYMMASTER_CLUB;
  const originalKey = process.env.GYMMASTER_API_KEY;

  beforeEach(() => {
    process.env.GYMMASTER_CLUB = "testclub";
    process.env.GYMMASTER_API_KEY = "test-api-key";
  });

  afterEach(() => {
    process.env.GYMMASTER_CLUB = originalClub;
    process.env.GYMMASTER_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("passes only when the shared client validates string categories", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { result: ["member_statistics", "sales"], error: null }),
    );

    const result = await createGymMasterProbe({
      fetchImpl: fetchMock as unknown as typeof fetch,
    }).run();

    expect(result).toEqual({
      ok: true,
      detail: "GymMaster categories endpoint returned 2 categories.",
    });
  });

  it("reports shared client classifications without leaking a key", async () => {
    const result = await createGymMasterProbe({
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(401, { error: "denied" })) as typeof fetch,
    }).run();

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("auth:");
    expect(result.detail).not.toContain("test-api-key");
  });

  it("fails a parseable but wrong category shape", async () => {
    const result = await createGymMasterProbe({
      fetchImpl: vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { result: [{ name: "member_statistics" }], error: null })) as typeof fetch,
    }).run();

    expect(result).toMatchObject({ ok: false });
    expect(result.detail).toContain("unsupported_contract");
  });
});
