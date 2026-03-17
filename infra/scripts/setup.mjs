import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env");
const envExamplePath = path.join(root, ".env.example");

const directories = [
  "services/api/data/cache",
  "services/api/data/gtfs/downloads",
  "services/api/data/gtfs/static/current",
  "services/routing/data"
];

for (const directory of directories) {
  fs.mkdirSync(path.join(root, directory), { recursive: true });
}

if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, envPath);
  console.log("Created .env from .env.example");
} else if (fs.existsSync(envPath)) {
  console.log(".env already exists, leaving it alone");
}

console.log("");
console.log("Setup complete.");
console.log("Next steps:");
console.log("1. Fill in BOGOTA_GTFS_STATIC_URL inside .env");
console.log("2. Run npm run refresh:static");
console.log("3. Run npm run dev:api");
console.log("4. Run npm run dev:mobile");
