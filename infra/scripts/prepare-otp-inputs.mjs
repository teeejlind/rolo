import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const sourceZipPath = path.join(
  repoRoot,
  "services/api/data/gtfs/downloads/static-latest.zip"
);
const targetGtfsDir = path.join(repoRoot, "services/routing/data/gtfs");
const targetOsmDir = path.join(repoRoot, "services/routing/data/osm");
const targetZipPath = path.join(targetGtfsDir, "bogota.zip");

await fs.mkdir(targetGtfsDir, { recursive: true });
await fs.mkdir(targetOsmDir, { recursive: true });

try {
  await fs.copyFile(sourceZipPath, targetZipPath);
  console.log(`Copied GTFS zip to ${targetZipPath}`);
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    console.error(
      "Could not find services/api/data/gtfs/downloads/static-latest.zip. Run `npm run refresh:static` first."
    );
    process.exit(1);
  }

  throw error;
}

console.log("");
console.log("Next OTP setup steps:");
console.log(`1. Put a Bogota OSM extract at ${path.join(targetOsmDir, "bogota.osm.pbf")}`);
console.log("2. Start OTP with Docker when Docker is available");
console.log("3. The API /journeys endpoint will automatically prefer OTP once it responds");
