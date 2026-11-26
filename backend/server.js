import "./config/load-env.js";
import app from "./app.js";
import { recoverInterruptedCatalogGenerations } from "./controllers/sales.controller.js";
import { expirePendingPayments } from "./controllers/checkout.controller.js";
import { releaseEligibleCommissions } from "./services/referral-affiliate.service.js";
import { isIsolatedTest, listenHost, startupJobsEnabled } from "./config/runtime-safety.js";
import { startAuditOutboxWorker } from "./services/admin-audit-worker.js";

const PORT = Number(process.env.PORT) || 5000;

if (startupJobsEnabled(process.env)) {
  await recoverInterruptedCatalogGenerations().catch((error) => {
    console.log("Catalog generation recovery skipped:", error.message);
  });
  await expirePendingPayments().catch((error) => {
    console.log("Payment hold cleanup skipped:", error.message);
  });
  await releaseEligibleCommissions().catch((error) => {
    console.log("Commission release cleanup skipped:", error.message);
  });

  setInterval(() => {
    void expirePendingPayments().catch((error) => {
      console.error("Payment hold cleanup failed:", error.message);
    });
  }, 60 * 1000).unref();

  setInterval(() => {
    void releaseEligibleCommissions().catch((error) => {
      console.error("Commission release cleanup failed:", error.message);
    });
  }, 10 * 60 * 1000).unref();

  startAuditOutboxWorker();
}

const host = listenHost(process.env);
const onListen = () => {
  console.log(host ? `Server running on ${host}:${PORT}` : `Server running on port ${PORT}`);
};
if (host && isIsolatedTest(process.env)) {
  app.listen(PORT, host, onListen);
} else {
  app.listen(PORT, onListen);
}
