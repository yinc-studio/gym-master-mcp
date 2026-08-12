import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const entrypoint = resolve(root, "dist/mcp/index.js");
let client: Client;
let transport: StdioClientTransport;

describe("built MCP stdio server", () => {
  beforeAll(async () => {
    if (!existsSync(entrypoint)) {
      execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
    }
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [entrypoint],
      cwd: root,
      env: {
        GYMMASTER_CLUB: "synthetic-club",
        GYMMASTER_API_KEY: "synthetic-key",
      },
      stderr: "pipe",
    });
    client = new Client({ name: "stdio-integration-test", version: "0.1.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await transport?.close();
  });

  it("discovers all six tools and returns a local validation error without network access", async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "count_memberships",
      "get_kpis_by_fields",
      "list_kpi_categories",
      "list_kpi_fields",
      "list_standard_reports",
      "run_standard_report",
    ]);

    const result = await client.callTool({
      name: "get_kpis_by_fields",
      arguments: {
        start_date: "2026-02-30",
        end_date: "2026-03-01",
        fields: ["member_count"],
      },
    });
    expect(result.isError).toBe(true);
    expect(result.content).toContainEqual({
      type: "text",
      text: expect.stringContaining('"error_type":"invalid_input"'),
    });
  });
});
