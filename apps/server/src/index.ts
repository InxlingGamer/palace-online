import { config } from "./config.js";
import { createRuntime } from "./app.js";

const runtime = createRuntime(config);

runtime.httpServer.listen(config.PORT, () => {
  console.log(`Palace Online server listening on http://localhost:${config.PORT}`);
});

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; closing Palace Online cleanly.`);
  await runtime.close();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
