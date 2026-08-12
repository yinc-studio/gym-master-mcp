import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createGymMasterClient, type GymMasterClient } from "../lib/gymmaster/index.js";
import { createToolHandlers } from "./tools.js";

const dateRangeSchema = {
  start_date: z.string(),
  end_date: z.string(),
};

const displaymodeSchema = z.enum(["CURRENT", "ALL", "HIDDEN"]).optional();

export function createMcpServer(client: GymMasterClient = createGymMasterClient()): McpServer {
  const handlers = createToolHandlers(client);
  const server = new McpServer({
    name: "gymmaster-reporting",
    version: "0.1.0",
  });

  server.registerTool(
    "list_kpi_categories",
    { description: "List GymMaster KPI categories." },
    async () => toolResponse(await handlers.listKpiCategories()),
  );
  server.registerTool(
    "list_kpi_fields",
    { description: "List GymMaster KPI fields available to this club." },
    async () => toolResponse(await handlers.listKpiFields()),
  );
  server.registerTool(
    "get_kpis_by_fields",
    {
      description: "Get selected KPI fields for an explicit inclusive date range.",
      inputSchema: {
        ...dateRangeSchema,
        fields: z.array(z.string()),
        company_id: z.number().int().nullable().optional(),
      },
    },
    async (input) => toolResponse(await handlers.getKpisByFields(input)),
  );
  server.registerTool(
    "list_standard_reports",
    {
      description: "List available GymMaster standard reports.",
      inputSchema: { predefined_only: z.boolean().optional() },
    },
    async (input) => toolResponse(await handlers.listStandardReports(input)),
  );
  server.registerTool(
    "run_standard_report",
    {
      description: "Run a standard report. Results can contain member data; request only needed columns.",
      inputSchema: {
        ...dateRangeSchema,
        report_id: z.number(),
        displaymode: displaymodeSchema,
        required_columns: z.array(z.string()).optional(),
        company_id: z.number().int().nullable().optional(),
      },
    },
    async (input) => toolResponse(await handlers.runStandardReport(input)),
  );
  server.registerTool(
    "count_memberships",
    {
      description: "Count distinct current memberships by caller-provided membership type buckets.",
      inputSchema: {
        ...dateRangeSchema,
        report_id: z.number().optional(),
        displaymode: displaymodeSchema,
        buckets: z
          .array(
            z.object({
              name: z.string(),
              membership_types: z.array(z.string()),
            }),
          )
          .optional(),
        match: z.enum(["exact", "prefix"]).optional(),
      },
    },
    async (input) => toolResponse(await handlers.countMemberships(input)),
  );

  return server;
}

function toolResponse(result: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    isError: "error_type" in result,
  };
}

async function main(): Promise<void> {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "MCP server failed to start.";
    console.error(message);
    process.exitCode = 1;
  });
}
