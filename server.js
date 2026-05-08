/**
 * The A Team AI Caller — Backend Server
 * Real Estate · Al-Jalil Gardens, Lahore
 *
 * Powered by: Twilio + ElevenLabs + Claude AI
 * Deploy to: Railway.app
 */

require("dotenv").config();
const express = require("express");
const twilio = require("twilio");
const Anthropic = require("@anthropic-ai/sdk");
const { ElevenLabsClient } = require("elevenlabs");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ─── Clients ────────────────────────────────────────────────────────────────
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

// ─── In-memory store (replace with a DB later if needed) ─────────────────────
const callSessions = {}; // callSid -> { history, leadData }
const leads = [];        // captured leads

// ─── AI Agent System Prompt ──────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Aisha, a warm and professional sales agent for The A Team real estate company, based in Al-Jalil Gardens, Lahore, Pakistan.

Your job:
- Greet callers in a friendly, confident tone
- Answer questions about plots, prices, availability, and location in Al-Jalil Gardens
- Speak naturally in a mix of Urdu and English (Urdu words like "ji", "bilkul", "shukriya" make the conversation feel natural)
- Collect the caller's name, phone number, and what they're interested in (plot size, budget, etc.)
- Offer to book an appointment with the sales team
- Keep responses SHORT — this is a phone call. Maximum 2-3 sentences per turn.
- Never make up specific prices unless told. Say "our team will share the latest rates with you"

Key info you know:
- Al-Jalil Gardens is a top-tier housing society in Lahore
- Plot sizes available: 3 Marla, 5 Marla, 10 Marla, 1 Kanal
- Commercial plots also available
- Location: Near major roads, schools, hospitals
- Payment plans are available

When you have collected name + interest, say: "JazakAllah, I've noted your details. Our team will call you back shortly. Have a great day!"

Always end the conversation politely after collecting lead info.`;

// ─── Helper: Text to Speech via ElevenLabs ──────────────────────────────────
async function textToSpeech(text) {
  const audioStream = await elevenlabs.textToSpeech.convert(
    process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM", // Rachel by default
    {
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }
  );

  const fileName = `audio_${uuidv4()}.mp3`;
  const filePath = path.join(__dirname, "public", fileName);

  const chunks = [];
  for await (const chunk of audioStream) chunks.push(chunk);
  fs.writeFileSync(filePath, Buffer.concat(chunks));

  return `${process.env.BASE_URL}/audio/${fileName}`;
}

// ─── Helper: Get AI response ─────────────────────────────────────────────────
async function getAIResponse(callSid, userMessage) {
  if (!callSessions[callSid]) {
    callSessions[callSid] = { history: [], leadData: {} };
  }

  const session = callSessions[callSid];
  session.history.push({ role: "user", content: userMessage });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: session.history,
  });

  const reply = response.content[0].text;
  session.history.push({ role: "assistant", content: reply });

  // Try to extract lead data from conversation
  extractLeadData(callSid, session.history);

  return reply;
}

// ─── Helper: Extract lead info from conversation ─────────────────────────────
async function extractLeadData(callSid, history) {
  const session = callSessions[callSid];
  if (session.leadData.extracted) return;

  const convo = history.map((m) => `${m.role}: ${m.content}`).join("\n");

  try {
    const extraction = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      system:
        'Extract caller name, interest (plot size/type), and any other info from this conversation. Reply ONLY in JSON like: {"name":"...","interest":"...","notes":"..."}. Use null for missing fields.',
      messages: [{ role: "user", content: convo }],
    });

    const raw = extraction.content[0].text;
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const data = JSON.parse(cleaned);

    if (data.name || data.interest) {
      session.leadData = { ...data, callSid, timestamp: new Date().toISOString(), extracted: true };
      leads.push(session.leadData);
      console.log("✅ Lead captured:", session.leadData);
    }
  } catch (e) {
    // Silent fail — extraction is best-effort
  }
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// Serve static audio files
app.use("/audio", express.static(path.join(__dirname, "public")));

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "running",
    service: "The A Team AI Caller",
    calls_active: Object.keys(callSessions).length,
    leads_captured: leads.length,
  });
});

/**
 * POST /call/inbound
 * Twilio calls this when someone calls your number.
 * Responds with TwiML that greets the caller and starts listening.
 */
app.post("/call/inbound", async (req, res) => {
  const callSid = req.body.CallSid;
  console.log(`📞 Inbound call: ${callSid} from ${req.body.From}`);

  const greeting = await getAIResponse(
    callSid,
    "The caller just connected. Greet them warmly and ask how you can help."
  );

  const audioUrl = await textToSpeech(greeting);
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();
  twiml.play(audioUrl);
  twiml.gather({
    input: "speech",
    action: `${process.env.BASE_URL}/call/respond`,
    speechTimeout: "auto",
    language: "en-PK",
  });

  res.type("text/xml").send(twiml.toString());
});

/**
 * POST /call/respond
 * Handles each caller message and returns AI response.
 */
app.post("/call/respond", async (req, res) => {
  const callSid = req.body.CallSid;
  const userSpeech = req.body.SpeechResult || "";
  console.log(`🗣️  [${callSid}] Caller said: "${userSpeech}"`);

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  if (!userSpeech) {
    twiml.say("I'm sorry, I didn't catch that. Could you please repeat?");
    twiml.gather({
      input: "speech",
      action: `${process.env.BASE_URL}/call/respond`,
      speechTimeout: "auto",
      language: "en-PK",
    });
    return res.type("text/xml").send(twiml.toString());
  }

  const reply = await getAIResponse(callSid, userSpeech);
  console.log(`🤖 [${callSid}] AI replied: "${reply}"`);

  const audioUrl = await textToSpeech(reply);
  twiml.play(audioUrl);

  // Check if conversation should end
  const shouldEnd =
    reply.toLowerCase().includes("have a great day") ||
    reply.toLowerCase().includes("jazakallah") ||
    reply.toLowerCase().includes("goodbye") ||
    reply.toLowerCase().includes("khuda hafiz");

  if (shouldEnd) {
    twiml.hangup();
  } else {
    twiml.gather({
      input: "speech",
      action: `${process.env.BASE_URL}/call/respond`,
      speechTimeout: "auto",
      language: "en-PK",
    });
  }

  res.type("text/xml").send(twiml.toString());
});

/**
 * POST /call/outbound
 * Initiates an outbound call to a given number.
 * Body: { to: "+923001234567", name: "Ahmed" }
 */
app.post("/call/outbound", async (req, res) => {
  const { to, name } = req.body;
  if (!to) return res.status(400).json({ error: "Missing 'to' phone number" });

  console.log(`📤 Initiating outbound call to ${to}`);

  try {
    const call = await twilioClient.calls.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `${process.env.BASE_URL}/call/outbound-start?name=${encodeURIComponent(name || "there")}`,
      statusCallback: `${process.env.BASE_URL}/call/status`,
      statusCallbackMethod: "POST",
    });

    res.json({ success: true, callSid: call.sid, to, status: call.status });
  } catch (err) {
    console.error("Outbound call error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /call/outbound-start
 * TwiML for outbound calls — AI introduces itself and starts conversation.
 */
app.post("/call/outbound-start", async (req, res) => {
  const callSid = req.body.CallSid;
  const name = req.query.name || "there";

  const greeting = await getAIResponse(
    callSid,
    `You are calling a lead named ${name}. Introduce yourself, mention you're from The A Team real estate, and ask if they're interested in plots in Al-Jalil Gardens.`
  );

  const audioUrl = await textToSpeech(greeting);
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();
  twiml.play(audioUrl);
  twiml.gather({
    input: "speech",
    action: `${process.env.BASE_URL}/call/respond`,
    speechTimeout: "auto",
    language: "en-PK",
  });

  res.type("text/xml").send(twiml.toString());
});

/**
 * POST /call/campaign
 * Start an outbound campaign from a list of contacts.
 * Body: { contacts: [{ name, phone }, ...], delaySeconds: 5 }
 */
app.post("/call/campaign", async (req, res) => {
  const { contacts, delaySeconds = 5 } = req.body;
  if (!contacts || !Array.isArray(contacts)) {
    return res.status(400).json({ error: "Missing contacts array" });
  }

  const results = [];

  for (let i = 0; i < contacts.length; i++) {
    const { name, phone } = contacts[i];
    await new Promise((r) => setTimeout(r, i * delaySeconds * 1000));

    try {
      const call = await twilioClient.calls.create({
        to: phone,
        from: process.env.TWILIO_PHONE_NUMBER,
        url: `${process.env.BASE_URL}/call/outbound-start?name=${encodeURIComponent(name)}`,
      });
      results.push({ name, phone, callSid: call.sid, status: "initiated" });
      console.log(`✅ Campaign call to ${name} (${phone}): ${call.sid}`);
    } catch (err) {
      results.push({ name, phone, status: "failed", error: err.message });
      console.error(`❌ Campaign call to ${name} failed:`, err.message);
    }
  }

  res.json({ success: true, total: contacts.length, results });
});

/**
 * POST /call/status
 * Twilio status callback — logs call events.
 */
app.post("/call/status", (req, res) => {
  const { CallSid, CallStatus, Duration } = req.body;
  console.log(`📊 Call ${CallSid} → ${CallStatus} (${Duration || 0}s)`);
  res.sendStatus(200);
});

/**
 * GET /leads
 * Returns all captured leads.
 */
app.get("/leads", (req, res) => {
  res.json({ total: leads.length, leads });
});

/**
 * GET /sessions
 * Returns active call sessions (for debugging).
 */
app.get("/sessions", (req, res) => {
  const summary = Object.entries(callSessions).map(([sid, s]) => ({
    callSid: sid,
    turns: s.history.length,
    leadData: s.leadData,
  }));
  res.json({ active: summary.length, sessions: summary });
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
┌─────────────────────────────────────────┐
│  🏠  The A Team AI Caller — RUNNING     │
│  Al-Jalil Gardens · Lahore              │
│  Port: ${PORT}                              │
│  URL:  ${process.env.BASE_URL || "http://localhost:" + PORT}  │
└─────────────────────────────────────────┘
  `);

  // Create public dir for audio files
  const publicDir = path.join(__dirname, "public");
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
});
