# 🏠 The A Team AI Caller
### Real Estate · Al-Jalil Gardens, Lahore
**Powered by Twilio + ElevenLabs + Claude AI**

---

## What this does

- **Answers inbound calls** automatically with an AI agent named Aisha
- **Makes outbound calls** to leads, introduces your company, and collects info
- **Runs campaigns** — upload a list of contacts and call them all automatically
- **Captures lead data** — name, interest, plot size saved automatically
- **Speaks Urdu + English** naturally

---

## STEP 1 — Get your 3 API keys

You need accounts on 3 services. All have free tiers.

### A) Twilio (phone calls)
1. Go to **https://twilio.com/try-twilio** → Sign up free
2. Verify your phone number
3. Go to Console → copy your **Account SID** and **Auth Token**
4. Buy a phone number: Console → Phone Numbers → Manage → Buy a number (~$1/month)
5. Copy the phone number (format: +12345678900)

### B) ElevenLabs (AI voice)
1. Go to **https://elevenlabs.io/sign-up** → Sign up free
2. Go to Profile (top right) → API Keys → Create API Key
3. Copy the key
4. To pick a voice: go to Voice Library, click a voice, click "Use" → copy the Voice ID from the URL

### C) Anthropic / Claude (AI brain)
1. Go to **https://console.anthropic.com** → Sign up
2. Go to API Keys → Create Key
3. Copy the key (starts with `sk-ant-...`)

---

## STEP 2 — Deploy to Railway

Railway is a free hosting platform. No technical knowledge needed.

1. Go to **https://railway.app** → Sign up with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Upload this folder to a new GitHub repo first:
   - Go to **https://github.com/new** → create a repo called `ateam-caller`
   - Upload all files from this folder
4. Back in Railway → select your `ateam-caller` repo → Deploy
5. Wait ~2 minutes for it to build
6. Click your project → **Settings** → **Domains** → Generate a domain
7. Copy the domain URL (looks like `https://ateam-caller-production.up.railway.app`)

---

## STEP 3 — Add your environment variables to Railway

In Railway → your project → **Variables** tab → add each of these:

| Variable | Value |
|---|---|
| `BASE_URL` | Your Railway domain URL (from Step 2) |
| `TWILIO_ACCOUNT_SID` | From Twilio Console |
| `TWILIO_AUTH_TOKEN` | From Twilio Console |
| `TWILIO_PHONE_NUMBER` | Your Twilio number e.g. `+12345678900` |
| `ELEVENLABS_API_KEY` | From ElevenLabs profile |
| `ELEVENLABS_VOICE_ID` | `21m00Tcm4TlvDq8ikWAM` (Rachel) or your chosen voice |
| `ANTHROPIC_API_KEY` | From Anthropic console |

After adding variables, Railway will auto-redeploy.

---

## STEP 4 — Connect Twilio to your backend

This is the most important step — it tells Twilio to send calls to your AI.

1. Go to Twilio Console → **Phone Numbers** → **Manage** → click your number
2. Scroll to **"Voice & Fax"** section
3. Under **"A call comes in"** → set to **Webhook** → paste:
   ```
   https://YOUR-RAILWAY-URL.up.railway.app/call/inbound
   ```
   Set method to **HTTP POST**
4. Click **Save**

That's it! Your number is now connected to the AI.

---

## STEP 5 — Test it

Call your Twilio number from your phone. Aisha should answer within 5 seconds and say something like:

> *"Assalamu Alaikum! You've reached The A Team real estate. I'm Aisha — how can I help you today? Are you looking for a plot in Al-Jalil Gardens?"*

---

## How to make outbound calls

### Single call
Send a POST request to your server:
```
POST https://YOUR-RAILWAY-URL/call/outbound
Content-Type: application/json

{
  "to": "+923001234567",
  "name": "Ahmed"
}
```

### Call a list (campaign)
```
POST https://YOUR-RAILWAY-URL/call/campaign
Content-Type: application/json

{
  "contacts": [
    { "name": "Ahmed Raza", "phone": "+923001234567" },
    { "name": "Fatima Malik", "phone": "+923219876543" },
    { "name": "Bilal Chaudhry", "phone": "+923337778899" }
  ],
  "delaySeconds": 10
}
```

You can send these using **Postman** (free app) or ask Claude to help you.

---

## How to view your captured leads

Visit in your browser:
```
https://YOUR-RAILWAY-URL/leads
```

This shows all leads the AI collected during calls, in JSON format.

---

## How to change the AI's personality / script

Open `server.js` and find `SYSTEM_PROMPT` near the top. Edit the text inside it. You can:
- Change the agent's name (currently "Aisha")
- Add specific plot prices or availability
- Change the language style
- Add new questions to ask

After editing, push to GitHub and Railway will redeploy automatically.

---

## Costs (approximate)

| Service | Free tier | Paid |
|---|---|---|
| Twilio | $15 free credit on signup | ~$0.013/min calls |
| ElevenLabs | 10,000 characters/month free | $5/mo for more |
| Anthropic | $5 free credit | ~$0.003 per call |
| Railway | $5/month hobby plan | Includes always-on |

**Estimated total for ~200 calls/month: $10–15/month**

---

## Troubleshooting

**Call connects but no audio?**
→ Check your `BASE_URL` variable is correct (no trailing slash)

**Call drops immediately?**
→ Check Twilio webhook URL is set correctly in Phone Number settings

**AI gives wrong answers?**
→ Edit the `SYSTEM_PROMPT` in `server.js` to add the correct information

**ElevenLabs voice not working?**
→ Check your Voice ID is correct. Test your API key at elevenlabs.io

---

## Support

For help with this setup, paste your error message into the Claude chat and ask for help.
