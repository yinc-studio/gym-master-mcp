import "dotenv/config";
import { probes } from "./index.js";

async function main(): Promise<void> {
  const serviceName = process.argv[2];

  if (!serviceName) {
    listProbes();
    process.exit(0);
  }

  const probe = probes[serviceName];
  if (!probe) {
    console.error(`Unknown probe "${serviceName}".\n`);
    listProbes();
    process.exit(1);
  }

  const missing = probe.requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`FAIL: ${probe.name}`);
    console.error(
      `Missing required environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
    );
    console.error(
      `Set ${missing.length > 1 ? "them" : "it"} in .env (copy .env.example if you haven't) and re-run.`,
    );
    process.exit(1);
  }

  console.log(`Running ${probe.name} probe...`);
  const result = await probe.run();

  if (result.ok) {
    console.log(`PASS: ${probe.name}`);
    console.log(result.detail);
    process.exit(0);
  }

  console.error(`FAIL: ${probe.name}`);
  console.error(result.detail);
  process.exit(1);
}

function listProbes(): void {
  console.log("Available probes:");
  for (const [key, probe] of Object.entries(probes)) {
    console.log(`  ${key}  (requires: ${probe.requiredEnv.join(", ")})`);
  }
  console.log("\nUsage: pnpm smoke <probe-name>");
}

main().catch((err) => {
  console.error("Unexpected error running smoke probe:");
  console.error(err);
  process.exit(1);
});
