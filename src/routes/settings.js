import { Router } from "express";
import { requireAuth, requireRole } from "./auth.js";
import { getAllSettings, setSetting } from "../settings.js";
import { sendRaw } from "../telegram.js";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get("/", (req, res) => {
  res.json(getAllSettings());
});

settingsRouter.patch("/", requireRole("admin"), (req, res) => {
  const editable = ["notify_new_event", "notify_priced_positive", "only_high_priority", "spread_threshold_percent", "digest_time", "digest_enabled"];
  for (const [k, v] of Object.entries(req.body || {})) {
    if (editable.includes(k)) setSetting(k, v);
  }
  res.json(getAllSettings());
});

settingsRouter.post("/test-telegram", requireRole("admin"), async (req, res) => {
  const result = await sendRaw("OH Arbitrage System — test message ✅");
  res.json(result);
});
