import os from "node:os";

const interfaces = os.networkInterfaces();
const addresses = [];

for (const [name, values] of Object.entries(interfaces)) {
  for (const value of values ?? []) {
    if (value.family === "IPv4" && !value.internal) {
      addresses.push({ name, address: value.address });
    }
  }
}

if (addresses.length === 0) {
  console.log("No external IPv4 address found.");
  process.exit(0);
}

for (const { name, address } of addresses) {
  console.log(`${name}: ${address}`);
}
