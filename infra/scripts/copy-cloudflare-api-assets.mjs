import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "../..");
const sourceRoot = path.join(repoRoot, "apps/mobile/cloudflare-api-data");
const destinationRoot = path.join(repoRoot, "apps/mobile/dist/api-data");

await fsp.rm(destinationRoot, { recursive: true, force: true });
await copyDirectory(sourceRoot, destinationRoot);

console.log(JSON.stringify({ ok: true, sourceRoot, destinationRoot }, null, 2));

async function copyDirectory(source, destination) {
  const entries = await fsp.readdir(source, { withFileTypes: true });
  await fsp.mkdir(destination, { recursive: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
      continue;
    }

    await fsp.copyFile(sourcePath, destinationPath);
  }
}
