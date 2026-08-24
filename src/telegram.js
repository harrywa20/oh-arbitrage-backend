import { computeFields, money } from "./compute.js";
import { getSetting } from "./settings.js";

async function send(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("Telegram not configured — skipping broadcast");
    return { ok: false, reason: "not_configured" };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("Telegram API error:", data.description);
      return { ok: false, reason: data.description };
    }
    return { ok: true };
  } catch (e) {
    console.error("Telegram send failed:", e.message);
    return { ok: false, reason: e.message };
  }
}

function formatArbAlert(ev) {
  const c = computeFields(ev);
  return [
    `ARBITRAGE SIGNAL`,
    `Venue: ${ev.venue} (${ev.state})`,
    `Event: ${ev.event_name} - ${ev.event_date}`,
    `StubHub (after fee): ${money(c.stubhub_fee_adjusted_price)}`,
    `Best buy: ${money(c.best_buy_price)} via ${c.best_buy_platform || "—"}`,
    `Spread: ${money(c.arbitrage_spread_dollar)} (${c.arbitrage_spread_percent?.toFixed(1) ?? "—"}%)`,
    `Lot: ${ev.location_notes || "—"}`,
    `Source: ${ev.source_url || "—"}`,
  ].join("\n");
}

function formatNewEventMsg(ev) {
  return [
    `NEW EVENT FOUND`,
    `Venue: ${ev.venue} (${ev.state})`,
    `Event: ${ev.event_name} - ${ev.event_date}`,
    `Priority: ${ev.priority}`,
    `Source: ${ev.source_url || "—"}`,
  ].join("\n");
}

function formatDigest(events) {
  if (events.length === 0) return "DAILY DIGEST\nNo open High-priority events awaiting pricing today.";
  const lines = events.map(
    (e) => `• ${e.venue} (${e.state}) — ${e.event_name} — ${e.event_date} — ${e.status}`
  );
  return [`DAILY DIGEST — ${events.length} High-priority event(s) needing pricing`, ...lines].join("\n");
}

export async function broadcastNewEvent(ev) {
  if (getSetting("notify_new_event") !== "true") return;
  if (getSetting("only_high_priority") === "true" && ev.priority !== "High") return;
  await send(formatNewEventMsg(ev));
}

export async function broadcastPricedOpportunity(ev) {
  if (getSetting("notify_priced_positive") !== "true") return;
  if (getSetting("only_high_priority") === "true" && ev.priority !== "High") return;
  const c = computeFields(ev);
  const threshold = parseFloat(getSetting("spread_threshold_percent") || "0");
  if (c.arbitrage_spread_percent === null || c.arbitrage_spread_percent <= threshold) return;
  await send(formatArbAlert(ev));
}

export async function broadcastDigest(events) {
  await send(formatDigest(events));
}

export { send as sendRaw };
