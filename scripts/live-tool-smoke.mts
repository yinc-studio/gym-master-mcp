import "dotenv/config";
import { createGymMasterClient, createGymMasterConfig } from "../src/lib/gymmaster/index.js";
import { createToolHandlers } from "../src/mcp/tools.js";

async function main() {
  const client = createGymMasterClient(createGymMasterConfig(process.env));
  const handlers = createToolHandlers(client);
  const kpis = await handlers.getKpisByFields({
    start_date: "2024-01-01",
    end_date: "2024-01-07",
    fields: ["new_memberships", "notice_cancellations", "currently_visiting_members"],
  });
  if ("error_type" in kpis) {
    console.error("KPI fail", kpis);
    process.exit(1);
  }
  console.error("KPI ok keys", Object.keys(kpis));
  const counts = await handlers.countMemberships({
    start_date: "2024-01-01",
    end_date: "2024-01-07",
  });
  if ("error_type" in counts) {
    console.error("COUNT fail", counts);
    process.exit(1);
  }
  console.error(
    "COUNT ok",
    "roster_total" in counts ? counts.roster_total : counts,
    "provenance" in counts,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
