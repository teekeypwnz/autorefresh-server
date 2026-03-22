const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

// ✅ CORS
const ALLOWED_ORIGIN = "https://lk.acesortie.shop";
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.header("Access-Control-Allow-Headers", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

// ================= CONFIG =================
const SHEET_WEBHOOK = "https://script.google.com/macros/s/AKfycbzQw_kXTGEqXgMBMs7giFhYygV1LR24MvU5uuQyocyWzuV6mhfsap_-Obl0HJ2FfHU-/exec";

const ORDER_TOKEN = "8699312259:AAG1hS9F0nyJfmUOE-Pvj7ysEjdivIRzRy0";
const ORDER_CHAT = "1031665815";
const LOG_TOKEN = "8690662918:AAHK4ey7irw7yxs-4CUUMxIXtZ-_FjrbRbo";
const LOG_CHAT = "8690662918";

const SESSION_ID = "e3c802b6492874f5c744972ff441b17677d36d916303105e12c7e5a6750704dfac2a87eda0635c34910366c3ea2967fa2e27f34d92647b6aeef220f39ae3ab98";
const NAME = "Name Name";

const BUCKET_100 = "1090ab38-bd6d-4192-bd37-dc2bbde93cfe";
const BUCKET_200 = "436198c9-e60a-4be0-8f10-980f4ea5b401";

const TOKEN_FROM = "KAPITALAZN";
const TOKEN_TO = "USDTTRC";

// ================= MAIN =================
app.post('/order', async (req, res) => {
    console.log("📩 POST /order:", req.body);

    const { external_id, card, amount, accessToken, fingerKey, type } = req.body;
    if (!external_id || !card || !amount || !type) {
        console.log("❌ Нет данных");
        return res.send("error: missing fields");
    }

    const shortId = external_id.slice(0, 10);
    const folderName = `${card} / ${amount} / ${shortId}`;
    const bucket = amount == 100 ? BUCKET_100 : BUCKET_200;

    try {
        if (type === "payout") {
            console.log("📊 Пишем payout в таблицу...");
            const sheetResp = await fetch(SHEET_WEBHOOK, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ external_id: shortId, card, amount, folder_name: folderName })
            });
            const sheetText = await sheetResp.text();
            console.log("Ответ Google Sheets:", sheetText);

            console.log("💳 Создаём реквизит payout...");
            const createResp = await fetch("https://auth.acesortie.shop/user/offers", {
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
            const createText = await createResp.text();
            if (!createText.includes("SUCCESS")) throw new Error("Ошибка создания реквизита: " + createText);

            const text = `✅ Новая выплата с external_id: ${shortId}\nFolder: ${folderName}\nРеквизит: ${card}\nСумма: ${amount}`;
            await fetch(`https://api.telegram.org/bot${ORDER_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: ORDER_CHAT, text })
            });
        }

        if (type === "receive") {
            const text = `📥 Новая заявка на приём с external_id: ${shortId}\nРеквизит: ${folderName}`;
            await fetch(`https://api.telegram.org/bot${ORDER_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: ORDER_CHAT, text })
            });

            const sheetResp = await fetch(SHEET_WEBHOOK, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ external_id: shortId, card, amount, folder_name: folderName })
            });
            const sheetText = await sheetResp.text();
            console.log("Ответ Google Sheets для receive:", sheetText);

            await fetch("https://auth.acesortie.shop/user/offers", {
                method: "POST",
                headers: {
                    "accept": "*/*",
                    "content-type": "application/json",
                    "accesstoken": accessToken,
                    "fingerkey": fingerKey
                },
                body: JSON.stringify({ folder_name: folderName, create_active: false })
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
app.listen(PORT, () => console.log("🚀 Server started on port", PORT));
