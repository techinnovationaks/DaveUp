import { config } from "./config";
import { livekitEnabled } from "./lib/livekit";
import { closeDbs } from "./db/pool";
import { startNotificationWorker } from "./lib/notify";
import { buildServer } from "./server";
import { startCallSweeper } from "./modules/calls";
import { startBillingWorker } from "./modules/billing";
import { getPaystack } from "./lib/paystack";

const app = await buildServer();
await app.listen({ port: config.port, host: "::" });
console.log(
  `DaveUp API listening on :${config.port} (email: ${config.email.provider}, phone codes: ${config.otp.provider}, files: ${config.storage.provider}, calls: ${livekitEnabled() ? "livekit" : "off"}, payments: ${getPaystack() ? (config.paystack.secretKey.startsWith("sk_live_") ? "paystack live" : "paystack test") : "off"})`,
);

// Email notifications are sent from a queue in the background. Set
// NOTIFICATION_WORKER=off when a separate worker process runs the sender.
const stopWorker = config.notificationWorker ? startNotificationWorker() : async () => {};
// Ends calls everyone has left and clears unfinished uploads.
const stopSweeper = startCallSweeper();
// Renewals, grace periods and plan expiry.
const stopBilling = startBillingWorker();

// Graceful shutdown: stop taking requests, finish in-flight ones and the
// current email batch, close pools. Lets rolling deploys replace instances
// without dropping requests or emails.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
    await stopWorker();
    await stopSweeper();
    await stopBilling();
    await closeDbs();
    process.exit(0);
  });
}
