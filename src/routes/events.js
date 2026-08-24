import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "../db.js";
import { computeFields } from "../compute.js";
import { requireAuth, requireRole } from "./auth.js";
import { broadcastNewEvent, broadcastPricedOpportunity } from "../telegram.js";

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

function withComputed(row) {
  return { ...row, ...computeFields(row) };
}

function todayMDY() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

// analysts can only see/edit rows in their assigned region; admins see everything
function scopeFilter(req) {
  if (req.user.role === "admin" || !req.user.region) return null;
  return req.user.region;
}

eventsRouter.get("/", (req, res) => {
  const { region, state, priority, status, category } = req.query;
  let sql = "SELECT * FROM events WHERE 1=1";
  const params = [];

  const scoped = scopeFilter(req);
  if (scoped) {
    sql += " AND region = ?";
    params.push(scoped);
  }
  if (region) {
    sql += " AND region = ?";
    params.push(region);
  }
  if (state) {
    sql += " AND state = ?";
    params.push(state.toUpperCase());
  }
  if (priority) {
    sql += " AND priority = ?";
    params.push(priority);
  }
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  if (category) {
    sql += " AND event_category = ?";
    params.push(category);
  }
  sql += " ORDER BY created_at DESC";

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(withComputed));
});

eventsRouter.post("/", (req, res) => {
  const b = req.body || {};
  const required = ["region", "state", "venue", "event_name", "event_date", "source_url", "analyst"];
  for (const f of required) {
    if (!b[f]) return res.status(400).json({ error: `${f} is required` });
  }
  if (req.user.role !== "admin" && req.user.region && b.region !== req.user.region) {
    return res.status(403).json({ error: "cannot add events outside your assigned region" });
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO events (
      id, region, state, venue, venue_city, event_name, event_category, event_date, listing_date,
      analyst, priority, source_url, status, notes
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    b.region,
    b.state.toUpperCase(),
    b.venue,
    b.venue_city || "",
    b.event_name,
    b.event_category || "Other",
    b.event_date,
    b.listing_date || todayMDY(),
    b.analyst,
    b.priority || "Standard",
    b.source_url,
    b.status || "Needs Research",
    b.notes || ""
  );

  const row = db.prepare("SELECT * FROM events WHERE id = ?").get(id);
  broadcastNewEvent(row).catch((e) => console.error("broadcast failed", e));
  res.status(201).json(withComputed(row));
});

eventsRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "not found" });
  if (req.user.role !== "admin" && req.user.region && existing.region !== req.user.region) {
    return res.status(403).json({ error: "cannot edit events outside your assigned region" });
  }

  const editable = [
    "region", "state", "venue", "venue_city", "event_name", "event_category", "event_date", "listing_date",
    "analyst", "priority", "stubhub_lot_name", "stubhub_price", "spothero_price", "parkwhiz_price",
    "parkingcom_price", "parkmobile_price", "location_notes", "source_url", "status", "notes",
  ];
  const patch = req.body || {};
  const sets = [];
  const params = [];
  for (const f of editable) {
    if (f in patch) {
      sets.push(`${f} = ?`);
      // computed-adjacent numeric fields: coerce "" and "N/A" to NULL
      const numericFields = ["stubhub_price", "spothero_price", "parkwhiz_price", "parkingcom_price", "parkmobile_price"];
      let val = patch[f];
      if (numericFields.includes(f)) {
        if (val === "" || val === null || (typeof val === "string" && val.trim().toUpperCase() === "N/A")) val = null;
        else val = parseFloat(val);
      }
      params.push(val);
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: "no editable fields provided" });
  sets.push("updated_at = CURRENT_TIMESTAMP");
  params.push(req.params.id);

  db.prepare(`UPDATE events SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  const row = db.prepare("SELECT * FROM events WHERE id = ?").get(req.params.id);

  if (patch.status === "Priced" || patch.status === "Confirmed") {
    broadcastPricedOpportunity(row).catch((e) => console.error("broadcast failed", e));
  }

  res.json(withComputed(row));
});

eventsRouter.delete("/:id", requireRole("admin"), (req, res) => {
  db.prepare("DELETE FROM events WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// bulk import - accepts an array of row objects matching the schema
eventsRouter.post("/import", (req, res) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows)) return res.status(400).json({ error: "body.rows must be an array" });

  const insert = db.prepare(
    `INSERT INTO events (
      id, region, state, venue, event_name, event_category, event_date, listing_date,
      analyst, priority, stubhub_lot_name, stubhub_price, spothero_price, parkwhiz_price,
      parkingcom_price, parkmobile_price, location_notes, source_url, status, notes
    ) VALUES (@id,@region,@state,@venue,@event_name,@event_category,@event_date,@listing_date,
      @analyst,@priority,@stubhub_lot_name,@stubhub_price,@spothero_price,@parkwhiz_price,
      @parkingcom_price,@parkmobile_price,@location_notes,@source_url,@status,@notes)`
  );

  const numeric = (v) => (v === "" || v === undefined || v === null || String(v).toUpperCase() === "N/A" ? null : parseFloat(v));

  const tx = db.transaction((items) => {
    for (const r of items) {
      insert.run({
        id: randomUUID(),
        region: r.region || "Southeast",
        state: (r.state || "").toUpperCase(),
        venue: r.venue || "",
        event_name: r.event_name || "",
        event_category: r.event_category || "Other",
        event_date: r.event_date || "",
        listing_date: r.listing_date || todayMDY(),
        analyst: r.analyst || "",
        priority: r.priority || "Standard",
        stubhub_lot_name: r.stubhub_lot_name || "",
        stubhub_price: numeric(r.stubhub_price),
        spothero_price: numeric(r.spothero_price),
        parkwhiz_price: numeric(r.parkwhiz_price),
        parkingcom_price: numeric(r.parkingcom_price),
        parkmobile_price: numeric(r.parkmobile_price),
        location_notes: r.location_notes || "",
        source_url: r.source_url || "",
        status: r.status || "Needs Research",
        notes: r.notes || "",
      });
    }
  });
  tx(rows);
  res.status(201).json({ imported: rows.length });
});

eventsRouter.get("/dashboard/summary", (req, res) => {
  const scoped = scopeFilter(req);
  const rows = scoped
    ? db.prepare("SELECT * FROM events WHERE region = ?").all(scoped)
    : db.prepare("SELECT * FROM events").all();

  const withC = rows.map(withComputed);
  const priced = withC.filter((e) => ["Priced", "Confirmed"].includes(e.status) && e.arbitrage_spread_percent !== null);
  const top = [...priced].sort((a, b) => b.arbitrage_spread_percent - a.arbitrage_spread_percent).slice(0, 10);
  const needingPricing = withC.filter((e) => ["Needs Pricing", "Needs Research"].includes(e.status)).length;
  const avgSpread = priced.length ? priced.reduce((s, e) => s + e.arbitrage_spread_percent, 0) / priced.length : 0;

  res.json({
    total: withC.length,
    needingPricing,
    pctNeedingPricing: withC.length ? Math.round((needingPricing / withC.length) * 100) : 0,
    avgSpreadPercent: avgSpread,
    highPriorityCount: withC.filter((e) => e.priority === "High").length,
    topOpportunities: top,
  });
});
