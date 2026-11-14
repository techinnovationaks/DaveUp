import { config } from "./config";
import { closeDbs } from "./db/pool";
import { startNotificationWorker } from "./lib/notify";
import { buildServer } from "./server";

const app = await buildServer();
await app.listen({ port: config.port, host: "0.0.0.0" });
console.log(`DaveUp API listening on :${config.port} (email: ${config.email.provider}, phone codes: ${config.otp.provider})`);

// Email notifications are sent from a queue in the background. Set
// NOTIFICATION_WORKER=off when a separate worker process runs the sender.
const stopWorker = config.notificationWorker ? startNotificationWorker() : async () => {};

// Graceful shutdown: stop taking requests, finish in-flight ones and the
// current email batch, close pools. Lets rolling deploys replace instances
// without dropping requests or emails.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
    await stopWorker();
    await closeDbs();
    process.exit(0);
  });
}
