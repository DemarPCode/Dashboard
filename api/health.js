// =============================================================
// Vercel serverless function:  GET /api/health
//
// Uses the stored Google refresh token to mint a fresh access
// token, then calls the Google Health API and returns the data
// to the dashboard. The client_id / client_secret / refresh_token
// live ONLY in Vercel environment variables — never in the repo.
//
// NOTE: this first version is open (anyone who knows the URL can
// call it). We lock it to your logged-in session in the next step.
// =============================================================
export default async function handler(req, res) {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    return res.status(500).json({ error: 'Missing Google credentials in Vercel env vars' });
  }

  try {
    // 1) Refresh token -> fresh access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(500).json({ error: 'Could not refresh access token', detail: tokenData });
    }
    const accessToken = tokenData.access_token;

    // 2) Call the Google Health API (exercise data points — proven to work)
    const dataRes = await fetch(
      'https://health.googleapis.com/v4/users/me/dataTypes/exercise/dataPoints',
      { headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' } }
    );
    const data = await dataRes.json();

    // 3) Hand it back to the page
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Request failed', detail: String(e) });
  }
}
