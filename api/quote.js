// =============================================================
// GET /api/quote?symbols=NOVO-B.CO,AAPL,TSLA
//
// Best-effort live stock quotes via Yahoo Finance's public chart
// endpoint (no API key). Returns price, previous close, day change %
// and the listing currency for each symbol. Unofficial — may
// occasionally fail for exotic tickers; the client falls back to a
// manual price when a symbol has no quote.
// =============================================================

async function quoteOne(sym) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(sym) + '?range=5d&interval=1d';
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; DashboardBot/1.0)',
      'Accept': 'application/json',
    },
  });
  const j = await r.json().catch(() => null);
  const meta = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
  if (!meta || meta.regularMarketPrice == null) {
    const err = (j && j.chart && j.chart.error && j.chart.error.description) || ('status ' + r.status);
    return { error: err };
  }
  const price = meta.regularMarketPrice;
  const prev = meta.previousClose != null ? meta.previousClose
    : (meta.chartPreviousClose != null ? meta.chartPreviousClose : null);
  return {
    symbol: meta.symbol || sym,
    price,
    prevClose: prev,
    currency: meta.currency || null,
    changePct: prev ? ((price - prev) / prev) * 100 : null,
    changeAbs: prev != null ? (price - prev) : null,
    time: meta.regularMarketTime || null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};
  const raw = q.symbols || q.s || '';
  const symbols = String(raw).split(',').map(x => x.trim()).filter(Boolean).slice(0, 50);
  if (!symbols.length) return res.status(400).json({ error: 'no symbols given' });

  const quotes = {};
  await Promise.all(symbols.map(async (sym) => {
    try { quotes[sym] = await quoteOne(sym); }
    catch (e) { quotes[sym] = { error: String(e) }; }
  }));
  return res.status(200).json({ quotes, ts: Date.now() });
}
