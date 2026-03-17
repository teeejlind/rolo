import { refreshStaticFeed } from "../lib/static-feed.js";

async function main() {
  const dataset = await refreshStaticFeed();

  console.log("Static GTFS refresh complete.");
  console.log(`Stops: ${dataset.metadata.stopCount}`);
  console.log(`Routes: ${dataset.metadata.routeCount}`);
  console.log(`Downloaded at: ${dataset.metadata.downloadedAt}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
