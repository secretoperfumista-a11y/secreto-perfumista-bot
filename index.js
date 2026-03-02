import express from "express";

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    const msg = value?.messages?.[0];
    const from = msg?.from;
    const text = msg?.text?.body;

    res.sendStatus(200);

    if (!from || !text) return;

    const reply = await askOpenAI(text);
    await sendWhatsApp(from, reply);
  } catch (e) {
    try { res.sendStatus(200); } catch {}
  }
});

async function askOpenAI(userText) {
  const prompt = `
Eres un agente de ventas de "Secreto Perfumista" (perfumes tipo inspiración/dupes, premium y duraderos).
Objetivo: ayudar, recomendar, resolver dudas y cerrar venta.
Reglas:
- Responde en español.
- Máximo 3-5 líneas.
- Haz 1 pregunta para perfilar (ocasión, gustos, presupuesto).
- Si piden precio/compra: pide ciudad y forma de entrega/pago.
Mensaje del cliente: ${userText}
`;

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "Eres un excelente vendedor por WhatsApp." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    })
  });

  const data = await r.json();
  const out = data?.choices?.[0]?.message?.content?.trim();
  return out || "¡Claro! ¿Para qué ocasión lo buscas y qué aromas te gustan (dulce, fresco, amaderado)?";
}

async function sendWhatsApp(to, message) {
  const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

  await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message }
    })
  });
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Running on port", port));
