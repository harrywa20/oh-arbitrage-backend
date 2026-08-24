const PLATFORMS = [
  { key: "spothero_price", label: "SpotHero" },
  { key: "parkwhiz_price", label: "ParkWhiz" },
  { key: "parkingcom_price", label: "Parking.com" },
  { key: "parkmobile_price", label: "ParkMobile" },
];

export function computeFields(ev) {
  const stubhub = ev.stubhub_price;
  const feeAdjusted = stubhub !== null && stubhub !== undefined ? stubhub * 0.85 : null;

  let best = null;
  let bestPlatform = null;
  for (const p of PLATFORMS) {
    const v = ev[p.key];
    if (v !== null && v !== undefined && (best === null || v < best)) {
      best = v;
      bestPlatform = p.label;
    }
  }

  let spreadDollar = null;
  let spreadPercent = null;
  if (feeAdjusted !== null && best !== null) {
    spreadDollar = feeAdjusted - best;
    spreadPercent = feeAdjusted !== 0 ? (spreadDollar / feeAdjusted) * 100 : null;
  }

  return {
    stubhub_fee_adjusted_price: feeAdjusted,
    best_buy_price: best,
    best_buy_platform: bestPlatform,
    arbitrage_spread_dollar: spreadDollar,
    arbitrage_spread_percent: spreadPercent,
  };
}

export function money(n) {
  return n === null || n === undefined ? "—" : `$${n.toFixed(2)}`;
}
