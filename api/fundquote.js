// =============================================================
// GET /api/fundquote?funds=key1,key2       -> live NAV for known funds
// GET /api/fundquote?list=1                -> list of known fund keys
//
// Best-effort live NAV for a small curated set of Danish investment
// funds ("investeringsforeninger" / UCITS ETFs) that have no listing
// on Yahoo Finance. Scrapes each fund's own public product page since
// no free structured API exists for these. Unofficial — breaks if the
// provider changes their page markup; that's an accepted trade-off for
// $0 cost, same as /api/quote's Yahoo scraping.
// =============================================================

const FUNDS = {
  'nordnet-teknologi-indeks': {
    name: 'Nordnet Teknologi Indeks',
    url: 'https://www.nordnet.dk/fonde/liste/nordnet-teknologi-indeks-dkk-17bc1f9d?details',
    provider: 'nordnet',
  },
  'danske-invest-europa-indeks-bnp': {
    name: 'Danske Invest Europa Indeks BNP',
    url: 'https://www.danskeinvest.dk/w/show_funds.product?p_nId=75&p_nFundgroup=75&p_nFund=1021',
    provider: 'danskeinvest',
  },
  'danske-invest-teknologi-indeks': {
    name: 'Danske Invest Teknologi Indeks',
    url: 'https://www.danskeinvest.dk/w/show_funds.product?p_nId=75&p_nFundgroup=75&p_nFund=1031',
    provider: 'danskeinvest',
  },
  'maj-invest-ai-semiconductor': {
    name: 'Maj Invest UCITS ETF AI & Semiconductor',
    url: 'https://majinvest.dk/vores-produkter/ucits-etf-ai-semiconductor/',
    provider: 'majinvest',
  },
};

function parseDaNumber(s) {
  // Danish number format: "1.234,56" -> 1234.56
  const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

function extractNordnet(html) {
  const m = /Seneste\s*NAV[\s\S]{0,200}?font-bold">\s*([\d.,]+)[\s\S]{0,80}?font-bold">\s*([A-Z]{3})/.exec(html);
  if (!m) return null;
  const price = parseDaNumber(m[1]);
  return price == null ? null : { price, currency: m[2] };
}

function extractDanskeInvest(html) {
  const m = /class="value">\s*([\d.,]+)\s*<\/p>\s*<small class="description">\s*Indre\s*v[æa]rdi/.exec(html);
  if (!m) return null;
  const price = parseDaNumber(m[1]);
  return price == null ? null : { price, currency: 'DKK' };
}

function extractMajInvest(html) {
  const m = /Indre\s*v[æa]rdi[\s\S]{0,120}?class="[^"]*text-right[^"]*"[^>]*>\s*([\d.,]+)\s*</.exec(html);
  if (!m) return null;
  const price = parseDaNumber(m[1]);
  return price == null ? null : { price, currency: 'DKK' };
}

const EXTRACTORS = { nordnet: extractNordnet, danskeinvest: extractDanskeInvest, majinvest: extractMajInvest };

async function fetchFund(key) {
  const def = FUNDS[key];
  if (!def) return { error: 'ukendt fond: ' + key };
  try {
    const r = await fetch(def.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DashboardBot/1.0)' } });
    if (!r.ok) return { error: 'HTTP ' + r.status };
    const html = await r.text();
    const extractor = EXTRACTORS[def.provider];
    const result = extractor ? extractor(html) : null;
    if (!result) return { error: 'kunne ikke finde pris på siden (layout ændret?)' };
    return { name: def.name, price: result.price, currency: result.currency };
  } catch (e) {
    return { error: String(e) };
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};

  if (q.list) {
    return res.status(200).json({ funds: Object.keys(FUNDS).map(k => ({ key: k, name: FUNDS[k].name })) });
  }

  const raw = q.funds || q.f || '';
  const keys = String(raw).split(',').map(x => x.trim()).filter(Boolean).slice(0, 20);
  if (!keys.length) return res.status(400).json({ error: 'no funds given' });

  const quotes = {};
  await Promise.all(keys.map(async (k) => { quotes[k] = await fetchFund(k); }));
  return res.status(200).json({ quotes, ts: Date.now() });
}
