import { Router } from "express";
import { requireAuth } from "./auth.js";

export const researchRouter = Router();
researchRouter.use(requireAuth);

const SYSTEM_PROMPT = `You are a research assistant for a parking-arbitrage analyst team.

Given a region, a US state, and a target month, do this:
1. Identify large-capacity event venues in that state: 15,000+ capacity venues, home
   venues of NFL/NBA/NHL/MLB/MLS teams, or major national concert-tour stops.
2. Use web search to find CONFIRMED events at those venues in the target month.
3. Never invent or guess an event. If you can't confirm something via search, leave it out
   and say so in your notes rather than fabricating a row.
4. Never estimate or invent parking prices — pricing fields must always be left blank;
   that is done by a human analyst later.
5. Mark priority "High" for major/high-demand events (playoffs, arena tours, rivalry games)
   and "Standard" for everything else. Sort High priority first, then by date.

When you are done researching, respond with ONLY a JSON object (no markdown fences, no
prose before or after) in exactly this shape:

{
  "rows": [
    {
      "region": "string",
      "state": "two-letter code",
      "venue": "string",
      "event_name": "string",
      "event_category": "Sports" | "Concert" | "Other",
      "event_date": "MM/DD/YYYY",
      "priority": "High" | "Standard",
      "source_url": "official venue or ticketing URL, never a resale/broker site"
    }
  ],
  "notes": "brief note on any venue you checked but found nothing confirmed for"
}

If you find nothing at all, return {"rows": [], "notes": "explanation"}.`;

async function callClaudeWithSearch(userPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error("ANTHROPIC_API_KEY is not set in .env");
    err.code = "missing_key";
    throw err;
  }

  let messages = [{ role: "user", content: userPrompt }];
  let finalText = null;

  // Loop to let the model make web_search tool calls; the API executes the search
  // server-side and returns results as tool_result content for us to pass back.
  for (let turn = 0; turn < 6; turn++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${body}`);
    }

    const data = await res.json();
    const textBlocks = data.content.filter((b) => b.type === "text").map((b) => b.text);
    const hasToolUse = data.content.some((b) => b.type === "server_tool_use" || b.type === "tool_use");

    if (data.stop_reason === "end_turn" || !hasToolUse) {
      finalText = textBlocks.join("\n");
      break;
    }

    // The API handles web_search execution itself for the server_tool_use type;
    // append the assistant turn and continue the loop so it can keep searching.
    messages = [...messages, { role: "assistant", content: data.content }];
  }

  if (finalText === null) {
    throw new Error("Research assistant did not finish within the turn limit");
  }
  return finalText;
}

function extractJson(text) {
  // strip any accidental markdown fences even though the prompt says not to use them
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

researchRouter.post("/", async (req, res) => {
  const { region, state, month } = req.body || {};
  if (!region || !state || !month) {
    return res.status(400).json({ error: "region, state, and month are required" });
  }

  const prompt = `Region: ${region}\nState: ${state}\nTarget month: ${month}\n\nFind venues and confirmed events per your instructions.`;

  try {
    const rawText = await callClaudeWithSearch(prompt);
    let parsed;
    try {
      parsed = extractJson(rawText);
    } catch (e) {
      return res.status(502).json({
        error: "Model did not return valid JSON — see raw_output to inspect what it said",
        raw_output: rawText,
      });
    }

    const rows = (parsed.rows || []).map((r) => ({
      region: r.region || region,
      state: (r.state || state).toUpperCase(),
      venue: r.venue || "",
      event_name: r.event_name || "",
      event_category: ["Sports", "Concert", "Other"].includes(r.event_category) ? r.event_category : "Other",
      event_date: r.event_date || "",
      priority: r.priority === "High" ? "High" : "Standard",
      source_url: r.source_url || "",
      status: "Needs Pricing",
    }));

    res.json({ rows, notes: parsed.notes || "" });
  } catch (e) {
    if (e.code === "missing_key") {
      return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY — add it to .env to enable research." });
    }
    console.error("research failed:", e);
    res.status(502).json({ error: "Research request failed", detail: e.message });
  }
});
