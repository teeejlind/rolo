import { probeRealtimeFeeds } from "../lib/static-feed.js";

async function main() {
  const snapshot = await probeRealtimeFeeds();

  console.log("Realtime probe complete.");
  console.log(`Checked at: ${snapshot.lastProbeAt}`);

  for (const feed of snapshot.feeds) {
    console.log(
      `- ${feed.key}: ${feed.ok ? "ok" : "failed"} (${feed.statusCode ?? "no-status"})`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
