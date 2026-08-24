import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { eventsRouter } from "./routes/events.js";
import { settingsRouter } from "./routes/settings.js";
import { researchRouter } from "./routes/research.js";
import { startDigestCron } from "./cron.js";
import "./db.js"; // ensures tables + first admin user are created on boot

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/events", eventsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/research", researchRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`OH Arbitrage System API listening on port ${PORT}`);
  startDigestCron();
});
