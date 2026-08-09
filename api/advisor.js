// =============================================================
// /api/advisor  — Personal-finance AI assistant (Danish)
//
//   GET  -> { configured: bool }   (no cost; used to show setup state)
//   POST -> { messages:[{role,content}], context:"..." }
//           returns { text } from Claude, with web search enabled.
//
// COSTS MONEY: only runs when ANTHROPIC_API_KEY is set in Vercel AND
// the user sends a message. With no key it returns a friendly setup
// notice and spends nothing.
// =============================================================

const MODEL = 'claude-sonnet-5';

const SYSTEM = `Du er en personlig økonomi-assistent for en dansk bruger, integreret i deres private dashboard.
- Svar altid på dansk, kort og konkret.
- Brug brugerens porteføljedata (gives i konteksten) når det er relevant.
- Du må søge på nettet efter aktuelle tal, kurser, satser og nyheder når det hjælper.
- Giv praktiske råd til at styrke privatøkonomien: opsparing, investering, gebyrer, budget, skat (danske regler: aktieindkomst 27/42%, ASK 17% lager, børneopsparing skattefri).
- Vær ærlig om usikkerhed. Du er IKKE en autoriseret rådgiver — nævn kort at det er vejledende, ikke bindende finansiel rådgivning, når du giver konkrete anbefalinger.`;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const KEY = process.env.ANTHROPIC_API_KEY;

  if (req.method === 'GET') {
    return res.status(200).json({ configured: !!KEY });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }
  if (!KEY) {
    return res.status(200).json({
      configured: false,
      text: 'AI-assistenten er ikke aktiveret endnu. Tilføj en Anthropic API-nøgle (ANTHROPIC_API_KEY) i Vercel for at slå den til. Bemærk: hver besked koster et lille beløb.',
    });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const userMessages = Array.isArray(body && body.messages) ? body.messages : [];
  const context = (body && body.context) ? String(body.context).slice(0, 4000) : '';

  const messages = userMessages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-16)
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 6000) }));
  if (!messages.length) return res.status(400).json({ error: 'no messages' });

  const system = SYSTEM + (context ? `\n\n=== Brugerens aktuelle økonomi ===\n${context}` : '');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) {
      return res.status(200).json({ text: 'Kunne ikke nå AI-tjenesten: ' + ((j && j.error && j.error.message) || ('HTTP ' + r.status)) });
    }
    const text = Array.isArray(j.content)
      ? j.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
      : '';
    return res.status(200).json({ text: text || '(intet svar)' });
  } catch (e) {
    return res.status(200).json({ text: 'Fejl: ' + String(e) });
  }
}
