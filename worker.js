// ── CORS helpers ──────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

// ── AI Laureen system prompt ──────────────────────────────────────────────────
const SYSTEM = `You are AI Laureen — the digital version of Laureen Nicholson, creator of @LearningAIwithLaureen on TikTok. You help everyday business owners understand how AI automation could actually help them.

PERSONALITY:
- Warm, funny, genuinely curious — like a friend who figured this stuff out through trial and error and loves sharing it
- You are NOT an expert and you never claim to be. You learned by doing, making mistakes, and figuring it out yourself.
- Honest and direct. You don't overpromise. People deserve to know what's real.
- You ask smart questions because a vague answer to a vague question helps nobody.
- From North Port FL — real, relatable, a little dramatic for effect

HOW YOU RESPOND:
- Keep responses SHORT — 2-4 sentences MAX. This is a voice conversation.
- Ask ONE smart follow-up question per response. Never jump straight to solutions.
- If someone gives a vague request like "build me an agent" or "I have a salon" — do NOT suggest anything yet. Ask what specific task is painful or repetitive for them.
- Before offering ideas, you need to understand: (1) what specific task eats up their time or drives them crazy, (2) what tools they already use, (3) how often it happens.
- Generic suggestions are lazy and unhelpful. Dig into their actual situation first.

BE HONEST ABOUT WHAT THIS WEBSITE DOES:
- The "automation ideas" this site generates are CONCEPTS — a preview of what might be possible, not working automations.
- Real automation workflows take hours or even days to properly build, test, and troubleshoot.
- Never say you're "building" something right now. Say you're showing them "what automation could look like" for their situation.
- If someone thinks they're getting something they can use immediately, gently correct that: "Just to be clear — what you'll see are ideas, not finished workflows. Actually building them is a whole other step, and that's what the real Laureen does."

EDUCATING PEOPLE (do this naturally, not like a lecture):
- AI automation means connecting tools so they pass information between each other automatically — it's less "magic robot" and more "really good plumbing."
- Platforms like Make.com, Zapier, and n8n make it possible without coding, but someone still has to configure it, test it, and fix it when it breaks.
- A "simple" automation can take a few hours to set up correctly. A real business workflow can take days.
- Help people understand what's realistic so they can make smart decisions — not just get excited about a buzzword.

SERVICES (be genuine):
- Free on this site: 2 automation IDEAS specific to their situation — a starting point, not a finished product
- Tier 1 - AI Starter: Templates and step-by-step guidance for people who want to DIY
- Tier 2 - Deployment: Real Laureen actually builds and deploys working automations for your business
- Tier 3 - Monthly Partner: Ongoing support, new workflows each month, real calls with Laureen

When someone is ready for real automation work: "Okay, these ideas are just the starting point — if you want them actually working in your business, that's exactly what the real Laureen does. Want me to connect you?"

Only after at least 3-4 genuine back-and-forth exchanges where you truly understand their specific situation, offer: "Okay, I think I have a real picture of what's going on for you now. Want me to show you 2 automation ideas based on what you just told me?"

IMPORTANT: You speak out loud. Keep it conversational and short. Max 3-4 sentences per reply.`;

// ── Build automation prompt ───────────────────────────────────────────────────
function buildGenPrompt(business) {
  return `You are helping generate realistic AI automation ideas for a small business owner. A user described their business and situation: "${business}"

Generate exactly 3 specific, practical automation ideas based on what they actually described. Return ONLY valid JSON, no markdown, no code blocks.

Format: {"automations":[{"title":"Short title","problem":"The specific pain point this addresses (1-2 sentences, based on what they said)","solution":"How this automation would work using real tools (2-3 sentences — be specific, not generic)","tools":["Tool1","Tool2"],"time_saved":"X hrs/week"}]}

Rules:
- Be specific to THIS business and what they described — not generic "appointment reminder" ideas that could apply to anyone
- Use real tools (Make.com, Zapier, n8n, ChatGPT, Google Sheets, Calendly, Airtable, etc.)
- Be honest about complexity — if something would take real setup, that's fine to imply
- These are ideas/concepts to explore, not finished products
- Return ONLY the JSON object.`;
}

// ── AI callers ────────────────────────────────────────────────────────────────
async function callClaude(env, system, messages, maxTokens = 400) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, system, messages })
  });
  if (!res.ok) throw new Error('Claude error');
  return ((await res.json()).content?.[0]?.text || '').trim();
}

async function callOpenAI(env, system, messages, maxTokens = 400) {
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  for (const m of messages) if (m.role && m.content) msgs.push({ role: m.role, content: m.content });
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: maxTokens, messages: msgs, temperature: 0.8 })
  });
  if (!res.ok) throw new Error('OpenAI error');
  return ((await res.json()).choices?.[0]?.message?.content || '').trim();
}

async function callAI(env, system, messages, maxTokens = 400, prefer = 'claude') {
  try {
    return prefer === 'openai' && env.OPENAI_API_KEY
      ? await callOpenAI(env, system, messages, maxTokens)
      : await callClaude(env, system, messages, maxTokens);
  } catch {
    try {
      return prefer === 'claude' && env.OPENAI_API_KEY
        ? await callOpenAI(env, system, messages, maxTokens)
        : await callClaude(env, system, messages, maxTokens);
    } catch { throw new Error('All AI services unavailable'); }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ status: 'ok', version: '2.0' });
    if (request.method !== 'POST') return json({ error: 'Not found' }, 404);

    const ip    = request.headers.get('CF-Connecting-IP') || 'unknown';
    const today = new Date().toISOString().split('T')[0];

    // ── /chat ─────────────────────────────────────────────────────────────────
    if (url.pathname === '/chat') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
      const message = (body.message || '').trim();
      if (!message) return json({ error: 'Message required' }, 400);
      const history  = Array.isArray(body.history) ? body.history.slice(-8) : [];
      const CHAT_CAP = parseInt(env.CHAT_CAP || '10');
      const chatKey  = `chat:${ip}:${today}`;
      const count    = await env.RATE_LIMIT_KV.get(chatKey).then(v => parseInt(v || '0'));
      if (count >= CHAT_CAP) return json({ error: `You've used your ${CHAT_CAP} free messages today! DM @LearningAIwithLaureen for more.`, code: 'CHAT_CAP', remaining: 0 }, 429);
      const messages = [...history.filter(m => m.role && m.content)];
      const last = messages[messages.length - 1];
      if (!last || last.role !== 'user' || last.content !== message) messages.push({ role: 'user', content: message });
      let reply;
      try { reply = await callAI(env, SYSTEM, messages, 400, 'claude'); }
      catch { return json({ error: 'AI unavailable. Try again!' }, 500); }
      ctx.waitUntil(env.RATE_LIMIT_KV.put(chatKey, String(count + 1), { expirationTtl: 86400 }));
      return json({ reply, remaining: CHAT_CAP - count - 1 });
    }

    // ── /generate ─────────────────────────────────────────────────────────────
    if (url.pathname === '/generate') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
      const business = (body.business || '').trim();
      if (business.length < 10) return json({ error: 'Tell me more about your business first!' }, 400);
      const DAILY_CAP = parseInt(env.DAILY_CAP || '200');
      const IP_CAP    = parseInt(env.IP_CAP || '5');
      const gKey = `global:${today}`, iKey = `ip:${ip}:${today}`;
      const [gCount, iCount] = await Promise.all([
        env.RATE_LIMIT_KV.get(gKey).then(v => parseInt(v || '0')),
        env.RATE_LIMIT_KV.get(iKey).then(v => parseInt(v || '0'))
      ]);
      if (gCount >= DAILY_CAP) return json({ error: "Today's free slots are full — DM @LearningAIwithLaureen!", code: 'GLOBAL_CAP' }, 429);
      if (iCount >= IP_CAP)    return json({ error: `Free limit reached! DM @LearningAIwithLaureen to keep going.`, code: 'IP_CAP', remaining: 0 }, 429);
      let raw;
      try { raw = await callAI(env, '', [{ role: 'user', content: buildGenPrompt(business) }], 1024, 'openai'); }
      catch { return json({ error: 'AI unavailable. Try again!' }, 500); }
      let automations;
      try {
        let c = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
        const s = c.indexOf('{'), e = c.lastIndexOf('}');
        if (s !== -1 && e !== -1) c = c.slice(s, e + 1);
        automations = JSON.parse(c);
        if (!automations.automations || !Array.isArray(automations.automations)) throw new Error('bad');
      } catch { return json({ error: 'Could not parse response. Try again!' }, 500); }
      ctx.waitUntil(Promise.all([
        env.RATE_LIMIT_KV.put(gKey, String(gCount + 1), { expirationTtl: 86400 }),
        env.RATE_LIMIT_KV.put(iKey, String(iCount + 1), { expirationTtl: 86400 }),
        env.RATE_LIMIT_KV.put(`lead:gen:${Date.now()}:${ip}`, JSON.stringify({ ip, business: business.slice(0, 200), ts: new Date().toISOString() }), { expirationTtl: 2592000 })
      ]));
      return json({ ...automations, remaining: IP_CAP - iCount - 1 });
    }

    // ── /speak — ElevenLabs TTS (voice stays server-side) ────────────────────
    if (url.pathname === '/speak') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
      const text = (body.text || '').trim().slice(0, 500);
      if (!text) return json({ error: 'Text required' }, 400);
      if (!env.ELEVENLABS_API_KEY) return json({ error: 'Voice not configured', code: 'NO_VOICE' }, 503);

      const res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/JHj1VD8u3GP01Korhp8r', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': env.ELEVENLABS_API_KEY },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.45, similarity_boost: 0.85, style: 0.35, use_speaker_boost: true }
        })
      });

      if (!res.ok) return json({ error: 'Voice generation failed' }, 500);

      const audio = await res.arrayBuffer();
      return new Response(audio, {
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' }
      });
    }

    // ── /lead — capture deployment request, notify Laureen ───────────────────
    if (url.pathname === '/lead') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
      const { name = '', email = '', business = '', source = 'website' } = body;
      if (!email) return json({ error: 'Email required' }, 400);

      const leadData = { name, email, business: business.slice(0, 300), source, ip, ts: new Date().toISOString() };
      ctx.waitUntil(
        env.RATE_LIMIT_KV.put(`deploy_lead:${Date.now()}:${ip}`, JSON.stringify(leadData), { expirationTtl: 7776000 })
      );

      if (env.NOTIFICATION_WEBHOOK) {
        ctx.waitUntil(
          fetch(env.NOTIFICATION_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `🔥 NEW DEPLOYMENT REQUEST!\n\nName: ${name}\nEmail: ${email}\nBusiness: ${business}\nSource: ${source}\nTime: ${new Date().toLocaleString()}`
            })
          }).catch(() => {})
        );
      }

      return json({ success: true });
    }

    // ── /alert — notify Laureen when a visitor uses the website ─────────────
    if (url.pathname === '/alert') {
      let body;
      try { body = await request.json(); } catch { return json({ status: 'lead saved' }); }
      const { business = '', agents = '', timestamp = new Date().toISOString() } = body;

      const leadData = { business: business.slice(0, 300), agents, ip, ts: timestamp };
      ctx.waitUntil(
        env.RATE_LIMIT_KV.put(`alert:${Date.now()}:${ip}`, JSON.stringify(leadData), { expirationTtl: 2592000 })
      );

      // Email notification via Make.com webhook → Gmail
      const MAKE_WEBHOOK = 'https://hook.us2.make.com/so5nxqms7g4s4a9iljlxrd8szyvcd1';
      ctx.waitUntil(
        fetch(MAKE_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business: (business || 'Direct contact request').slice(0, 300),
            agents: agents || 'None',
            timestamp: new Date(timestamp).toLocaleString('en-US', { timeZone: 'America/New_York' })
          })
        }).catch(() => {})
      );

      return json({ status: 'lead saved' });
    }

    return json({ error: 'Not found' }, 404);
  }
};
