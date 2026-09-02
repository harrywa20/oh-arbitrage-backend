import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "../db.js";
import { requireAuth } from "./auth.js";

export const lotsRouter = Router();
lotsRouter.use(requireAuth);

function daysSince(mdy) {
  const [m, d, y] = mdy.split("/").map(Number);
  if (!m || !d || !y) return null;
  const then = new Date(y, m - 1, d);
  return Math.floor((Date.now() - then.getTime()) / (1000 * 60 * 60 * 24));
}

// GET /api/lots?venue=SoFi+Stadium  -> past manually-checked prices for that venue, most recent first
lotsRouter.get("/", (req, res) => {
  const { venue } = req.query;
  let rows;
  if (venue) {
    rows = db.prepare("SELECT * FROM saved_lots WHERE venue LIKE ? ORDER BY created_at DESC").all(`%${venue}%`);
  } else {
    rows = db.prepare("SELECT * FROM saved_lots ORDER BY created_at DESC LIMIT 200").all();
  }
  const withStaleness = rows.map((r) => ({ ...r, days_old: daysSince(r.date_checked) }));
  res.json(withStaleness);
});

// POST /api/lots -> log a price you actually just saw on a real platform
lotsRouter.post("/", (req, res) => {
  const b = req.body || {};
  const required = ["venue", "lot_name_or_address", "platform", "price_seen", "date_checked"];
  for (const f of required) {
    if (!b[f]) return res.status(400).json({ error: `${f} is required` });
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO saved_lots (id, venue, lot_name_or_address, platform, price_seen, date_checked, event_context, analyst, notes)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(id, b.venue, b.lot_name_or_address, b.platform, parseFloat(b.price_seen), b.date_checked, b.event_context || "", b.analyst || "", b.notes || "");
  const row = db.prepare("SELECT * FROM saved_lots WHERE id = ?").get(id);
  res.status(201).json({ ...row, days_old: daysSince(row.date_checked) });
});

lotsRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM saved_lots WHERE id = ?").run(req.params.id);
  res.status(204).end();
});
