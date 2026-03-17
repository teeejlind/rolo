import { config } from "./config.js";
import { buildServer } from "./server.js";

const app = buildServer();

async function start() {
  try {
    await app.listen({
      port: config.port,
      host: "0.0.0.0"
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

start();
