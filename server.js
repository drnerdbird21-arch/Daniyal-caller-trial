require("dotenv").config();
const express = require("express");
const twilio = require("twilio");
const Groq = require("groq-sdk");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const groq = new Groq({ apiKey: "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" });

const callSessions = {};
const leads = [];

const SYSTEM_PROMPT = `You are Aisha, a friendly sales agent for The A Team real estate in Al-Jalil Gardens, Lahore. Speak in a mix of Urdu and English. Ask callers about their interest in plots (3 Marla, 5 Marla, 10 Marla, 1 Kanal). Collect their name and interest. Keep responses very short — 1 to 2 sentences only. When you have their name and interest say: "JazakAllah, our team will call you back shortly. Have a great day!"`;

async function getAIResponse(callSid, userMessage) {
  if (!callSessions[callSid]) callSessions[callSid] = { history: [] };
  const session = callSessions[callSid];
  session.history.push({ role: "user", content: userMessage });
  const response = await groq.chat.completions.create({
    model: "llama3-70b-8192",
    max_tokens: 150,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...session.history],
  });
  const reply = response.choices[0].message.content;
  session.history.push({ role: "assistant", content: reply });
  return reply;
}

app.get("/", (req, res) => res.json({ status: "running", service: "The A Team AI Caller" }));

app.post("/call/inbound", async (req, res) => {
  const callSid = req.body.CallSid;
  console.log("Inbound call:", callSid);
  const greeting = await getAIResponse(callSid, "The caller just connected. Greet them warmly.");
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say({ voice: "Polly.Joanna" }, greeting);
  twiml.gather({ input: "speech", action: `${process.env.BASE_URL}/call/respond`, speechTimeout: "auto", language: "en-IN" });
  res.type("text/xml").send(twiml.toString());
});

app.post("/call/respond", async (req, res) => {
  const callSid = req.body.CallSid;
  con
