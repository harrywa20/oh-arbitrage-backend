import cron from "node-cron";
import { db } from "./db.js";
import { broadcastDigest } from "./telegram.js";
import { getSetting } from "./settings.js";

// runs every minute and checks whether "now" matches the configured digest_time (HH:mm, server timezone)
export function startDigestCron() {
  cron.schedule("* * * * *", async () => {
    if (getSetting("digest_enabled") !== "true") return;

    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (hhmm !== getSetting("digest_time")) return;

    const rows = db
      .prepare("SELECT * FROM events WHERE priority = 'High' AND status = 'Needs Pricing'")
      .all();
    await broadcastDigest(rows);
    console.log(`Daily digest sent at ${hhmm} (${rows.length} events)`);
  });
  console.log("Digest cron scheduled (checks every minute against DIGEST_TIME)");
}
