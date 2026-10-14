import { runBillingTick } from "../lib/payments/billing-tick";

async function main() {
  const summary = await runBillingTick();
  console.log(JSON.stringify(summary));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
