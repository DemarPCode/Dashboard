// =============================================================
// /api/advisor  — Personal-finance AI assistant (Danish)
//
//   GET  -> { configured: bool, provider }   (no cost)
//   POST -> { messages:[{role,content}], context:"..." } -> { text }
//
// Providers (first one whose key is set wins):
//   GEMINI_API_KEY    -> Google Gemini 2.5 Flash + Google Search  (FREE tier)
//   ANTHROPIC_API_KEY -> Claude + web search                      (paid)
//
// With no key set it returns a friendly setup notice and spends nothing.
// =============================================================

const SYSTEM = `Du er en personlig økonomi-assistent for en dansk bruger, integreret i deres private dashboard.
- Svar altid på dansk, kort og konkret.
- Brug brugerens porteføljedata (gives i konteksten) når det er relevant.
- Du må søge på nettet efter aktuelle tal, kurser, satser og nyheder når det hjælper.
- Giv praktiske råd til at styrke privatøkonomien: opsparing, investering, gebyrer, budget, skat (danske regler: aktieindkomst 27/42%, ASK 17% lager, børneopsparing skattefri).
- Vær ærlig om usikkerhed. Du er IKKE en autoriseret rådgiver — nævn kort at det er vejledende, ikke bindende finansiel rådgivning, når du giver konkrete anbefalinger.`;

function buildSystem(context) {
  return SYSTEM + (context ? `\n\n=== Brugerens aktuelle økonomi ===\n${context}` : '');
}

// Overridable via GEMINI_MODEL env var so a future Google deprecation
// doesn't need a code change — just update the env var and redeploy.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

async function callGemini(key, messages, system) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(GEMINI_MODEL) + ':generateContent?key=' + encodeURIComponent(key);
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    tools: [{ google_search: {} }],
    generationConfig: { maxOutputTokens: 1024, temperature: 0.4 },
  };
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) return { text: 'Kunne ikke nå Gemini: ' + ((j && j.error && j.error.message) || ('HTTP ' + r.status)) };
  const parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
  const text = Array.isArray(parts) ? parts.map(p => p.text).filter(Boolean).join('\n').trim() : '';
  return { text: text || '(intet svar)' };
}

async function callClaude(key, messages, system) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5', max_tokens: 1024, system, messages,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) return { text: 'Kunne ikke nå Claude: ' + ((j && j.error && j.error.message) || ('HTTP ' + r.status)) };
  const text = Array.isArray(j.content) ? j.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim() : '';
  return { text: text || '(intet svar)' };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const GEMINI = process.env.GEMINI_API_KEY;
  const ANTHROPIC = process.env.ANTHROPIC_API_KEY;
  const provider = GEMINI ? 'gemini' : (ANTHROPIC ? 'anthropic' : null);

  if (req.method === 'GET') return res.status(200).json({ configured: !!provider, provider });
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  if (!provider) {
    return res.status(200).json({
      configured: false,
      text: 'AI-assistenten er ikke aktiveret endnu. Tilføj en GRATIS Google Gemini-nøgle (GEMINI_API_KEY) — eller en betalt Anthropic-nøgle (ANTHROPIC_API_KEY) — i Vercel for at slå den til.',
    });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const context = (body && body.context) ? String(body.context).slice(0, 4000) : '';
  const messages = (Array.isArray(body && body.messages) ? body.messages : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-16)
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 6000) }));
  if (!messages.length) return res.status(400).json({ error: 'no messages' });

  const system = buildSystem(context);
  try {
    const out = provider === 'gemini' ? await callGemini(GEMINI, messages, system) : await callClaude(ANTHROPIC, messages, system);
    return res.status(200).json(Object.assign({ provider }, out));
  } catch (e) {
    return res.status(200).json({ text: 'Fejl: ' + String(e) });
  }
}
