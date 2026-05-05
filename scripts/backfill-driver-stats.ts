import { db, mongoClient } from "../src/lib/db";
import { Collections } from "../src/lib/schemas";
import { recomputeLifetimeStats } from "../src/lib/driver-stats";

async function main() {
  const drivers = await db
    .collection(Collections.drivers)
    .find({}, { projection: { _id: 1, firstName: 1, lastName: 1 } })
    .toArray();

  console.log(`\n=== recomputing lifetime stats for ${drivers.length} drivers ===`);

  for (const d of drivers) {
    const id = d._id.toString();
    const stats = await recomputeLifetimeStats(id);
    console.log(
      `[backfill] ${d.firstName} ${d.lastName} (${id}): ` +
        `campaigns=${stats.campaignsDone} km=${stats.totalKm} earnings=${stats.totalEarnings}`,
    );
  }

  console.log("\n✅ Backfill done.");
  await mongoClient.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoClient.close();
  } catch {}
  process.exit(1);
});
