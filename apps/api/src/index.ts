import { config } from "./config";
import { closeDbs } from "./db/pool";
import { buildServer } from "./server";

const app = await buildServer();
await app.listen({ port: config.port, host: "0.0.0.0" });
console.log(`DaveUp API listening on :${config.port} (otp provider: ${config.otp.provider})`);

// Graceful shutdown: stop taking requests, finish in-flight ones, close pools.
// Lets rolling deploys replace instances without dropping requests.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
    await closeDbs();
    process.exit(0);
  });
}
