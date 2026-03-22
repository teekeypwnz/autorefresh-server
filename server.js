const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

// ✅ CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ================= CONFIG =================
const SHEET_WEBHOOK = "https://script.google.com/macros/s/AKfycbzQw_kXTGEqXgMBMs7giFhYygV1LR24MvU5uuQyocyWzuV6mhfsap_-Obl0HJ2FfHU-/exec";

// Telegram
const ORDER_TOKEN = "8699312259:AAG1hS9F0nyJfmUOE-Pvj7ysEjdivIRzRy0";
const ORDER_CHAT = "1031665815";

const LOG_TOKEN = "8690662918:AAHK4ey7irw7yxs-4CUUMxIXtZ-_FjrbRbo";
const LOG_CHAT = "8690662918";

// Requisite settings
const SESSION_ID = "e3c802b6492874f5c744972ff441b17677d36d916303105e12c7e5a6750704dfac2a87eda0635c34910366c3ea2967fa2e27f34d92647b6aeef220f39ae3ab98";
const NAME = "Name Name";

const BUCKET_100 = "1090ab38-bd6d-4192-bd37-dc2bbde93cfe";
const BUCKET_200 = "436198c9-e60a-4be0-8f10-980f4ea5b401";

const TOKEN_FROM = "KAPITALAZN";
const TOKEN_TO = "USDTTRC";

// ================= HELPERS =================
async function createRequisite(card, amount, shortId, accessToken, fingerKey) {
  const folderName = `${card} / ${amount} / ${shortId}`;
  const bucket = amount == 100 ? BUCKET_100 : BUCKET_200;

  const res = await fetch("https://auth.acesortie.shop/user/offers", {
    method: "POST",
    headers: {
      "accept": "*/*",
      "content-type": "application/json",
      "accesstoken": accessToken,
      "fingerkey": fingerKey
    },
    body: JSON.stringify({
      create_active: true,
      folder_name: folderName,
      payment: [{ address: card, extra: `{"recipient_name_azn":"${NAME}"}` }],
      sessions_id: [SESSION_ID],
      token_from: TOKEN_FROM,
      override_bucket_id: bucket,
      token_to: TOKEN_TO,
      type: "SELL"
    })
  });
  const text = await res.text();
  if (!text.includes("SUCCESS")) throw new Error("Ошибка создания реквизита: " + text);
  return folderName;
}

// Выключить реквизит
async function pauseFolder(folderName, accessToken, fingerKey) {
  const foldersRes = await fetch("https://auth.acesortie.shop/user/payment_details/folders?", {
    method: "GET",
    headers: {
      "accept": "*/*",
      "accesstoken": accessToken,
      "fingerkey": fingerKey
    }
  });
  const foldersData = await foldersRes.json();
  const target = foldersData?.result?.folders?.find(f => f.name === folderName);
  if (!target) return false;

  await fetch(`https://auth.acesortie.shop/user/payment_details/folders/${target.internal_id}`, {
    method: "PATCH",
    headers: {
      "accept": "*/*",
      "content-type": "application/json",
      "accesstoken": accessToken,
      "fingerkey": fingerKey
    },
    body: JSON.stringify({ status: "PAUSED" })
  });
  return true;
}

// ================= MAIN =================
app.post('/order', async (req, res) => {
  const { type, order, accessToken, fingerKey } = req.body;
  if (!order || !order.external_id || !order.payment_details_address || !order.creator_amount) {
    return res.send("error: missing fields");
  }

  const shortId = order.external_id.slice(0, 10);
  const card = order.payment_details_address;
  const amount = order.creator_amount;

  try {
    if (type === "payout") {
      // Создаём реквизит и получаем folder_name
      const folderName = await createRequisite(card, amount, shortId, accessToken, fingerKey);

      // Запись в Google Sheet после успешного создания реквизита
      await fetch(SHEET_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "create",
          external_id: shortId,
          card,
          amount,
          folder_name: folderName
        })
      });

      // Telegram уведомление
      await fetch(`https://api.telegram.org/bot${ORDER_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: ORDER_CHAT,
          text: `✅ Новая выплата с external_id: ${shortId}\nСоздан реквизит: ${folderName}\nРеквизит - ${card}\nСумма - ${amount}`
        })
      });
    }

    if (type === "receive") {
      const folderName = order.folder_name;

      // Запись данных по приёму в Google Sheet
      await fetch(SHEET_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "update_receive",
          folder_name: folderName,
          external_id_receive: shortId
        })
      });

      // Выключаем реквизит
      const paused = await pauseFolder(folderName, accessToken, fingerKey);

      // Telegram уведомление
      await fetch(`https://api.telegram.org/bot${ORDER_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: ORDER_CHAT,
          text: `📥 Новая заявка на приём с external_id: ${shortId}\nРеквизит ${folderName} ${paused ? "выключен" : "не найден"}`
        })
      });
    }

    res.send("ok");
  } catch (err) {
    console.log("❌ ERROR:", err.message);
    await fetch(`https://api.telegram.org/bot${LOG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: LOG_CHAT, text: `❌ Ошибка\n${err.message}` })
    });
    res.send("error");
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("🚀 Server started"));
