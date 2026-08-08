// =============================================================
// Vercel serverless function:  GET /api/health
//
// Uses the stored Google refresh token to mint a fresh access
// token, then fetches Google Health data and returns it to the
// dashboard. Secrets live ONLY in Vercel env vars.
//
// MODES:
//   /api/health                 -> fetches the default set of data
//                                  types the Health card needs
//   /api/health?discover=1      -> probes MANY candidate dataTypes
//                                  and reports which ones work +
//                                  a small sample (used once to see
//                                  what your Fitbit actually provides)
//   /api/health?type=sleep      -> fetch one specific dataType raw
//
// NOTE: still open (no auth). We lock it to your login next step.
// =============================================================

// Candidate dataTypes to probe during discovery. Exact identifiers
// vary, so we try the most likely names; unknown ones just report
// "not found" and are ignored.
const DISCOVER_TYPES = [
  'steps',
  'exercise',
  'sleep',
  'daily-resting-heart-rate',
  'resting-heart-rate',
  'daily-heart-rate-variability',
  'heart-rate-variability',
  'daily-oxygen-saturation',
  'oxygen-saturation',
  'daily-respiratory-rate',
  'respiratory-rate-sleep-summary',
  'daily-sleep-temperature-derivations',
  'active-zone-minutes',
  'active-minutes',
  'active-energy-burned',
  'distance',
  'daily-heart-rate-zones',
];

// The set the finished card will actually use (trimmed to what works).
const DEFAULT_TYPES = [
  'steps',
  'exercise',
  'sleep',
  'daily-resting-heart-rate',
  'daily-heart-rate-variability',
  'daily-oxygen-saturation',
  'daily-respiratory-rate',
  'daily-sleep-temperature-derivations',
];

async function getAccessToken() {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error('Missing Google credentials in Vercel env vars');
  }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j));
  return j.access_token;
}

async function fetchType(token, type) {
  const url = 'https://health.googleapis.com/v4/users/me/dataTypes/' + type + '/dataPoints';
  const r = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const token = await getAccessToken();
    const q = req.query || {};

    // Single specific type (raw)
    if (q.type) {
      const one = await fetchType(token, String(q.type));
      return res.status(200).json(one);
    }

    // Discovery mode: probe many, report a compact summary
    if (q.discover) {
      const out = {};
      await Promise.all(DISCOVER_TYPES.map(async (t) => {
        try {
          const { status, body } = await fetchType(token, t);
          const points = (body && body.dataPoints) || [];
          out[t] = {
            status,
            ok: status === 200,
            count: points.length,
            sample: points[0] || null,
          };
        } catch (e) {
          out[t] = { status: 'error', ok: false, detail: String(e) };
        }
      }));
      return res.status(200).json(out);
    }

    // Default: fetch the working set the card needs
    const result = {};
    await Promise.all(DEFAULT_TYPES.map(async (t) => {
      try {
        const { status, body } = await fetchType(token, t);
        result[t] = status === 200 ? (body.dataPoints || []) : { error: status };
      } catch (e) {
        result[t] = { error: String(e) };
      }
    }));
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
