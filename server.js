const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

// ✅ CORS с конкретным origin
const ALLOWED_ORIGIN = "https://lk.acesortie.shop";
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.header("Access-Control-Allow-Headers", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

// ================= CONFIG =================
const SHEET_WEBHOOK = "https://script.google.com/macros/s/AKfycbzQw_kXTGEqXgMBMs7giFhYygV1LR24MvU5uuQyocyWzuV6mhfsap_-Obl0HJ2FHU-/exec";

// Telegram
const ORDER_TOKEN = "YOUR_ORDER_BOT";
const ORDER_CHAT = "YOUR_ORDER_CHAT";

const LOG_TOKEN = "YOUR_LOG_BOT";
const LOG_CHAT = "YOUR_LOG_CHAT";

// Requisite settings
const SESSION_ID = "SESSION_ID";
const NAME = "Name Name";

const BUCKET_100 = "BUCKET_100";
const BUCKET_200 = "BUCKET_200";

const TOKEN_FROM = "KAPITALAZN";
const TOKEN_TO = "USDTTRC";

// ================= MAIN =================
app.post('/order', async (req, res) => {
    console.log("📩 POST /order:", req.body);

    try {
        const { type, external_id, card, amount, accessToken, fingerKey, order } = req.body;

        if (type === "payout") {
            if (!external_id || !card || !amount || !accessToken || !fingerKey)
                throw new Error("missing fields");

            const shortId = external_id.slice(0, 10);
            const folderName = `${card} / ${amount} / ${shortId}`;
            const bucket = amount == 100 ? BUCKET_100 : BUCKET_200;

            // ✅ 1. Запись в таблицу
            const sheetResp = await fetch(SHEET_WEBHOOK, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ external_id: shortId, card, amount })
            });
            console.log("Ответ Google Sheets:", await sheetResp.text());

            // ✅ 2. Создание реквизита
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

            // ✅ 3. Telegram
            await fetch(`https://api.telegram.org/bot${ORDER_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: ORDER_CHAT, text: `✅ Выплата ${shortId}\nРеквизит: ${card}\nСумма: ${amount}` })
            });

            res.send("ok");

        } else if (type === "receive") {
            const { external_id, payment_details_address, creator_amount, folder_name } = order;

            if (!external_id || !payment_details_address || !creator_amount || !folder_name)
                throw new Error("missing fields for receive");

            const shortId = external_id.slice(0, 10);

            // ✅ 1. Дописываем данные в таблицу
            await fetch(SHEET_WEBHOOK, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ external_id: shortId, card: payment_details_address, amount: creator_amount })
            });

            // ✅ 2. Выключаем реквизит
            await fetch("https://auth.acesortie.shop/user/offers", {
                method: "POST",
                headers: { "accept": "*/*", "content-type": "application/json", "accesstoken": accessToken, "fingerkey": fingerKey },
                body: JSON.stringify({ folder_name, create_active: false })
            });

            // ✅ 3. Telegram
            await fetch(`https://api.telegram.org/bot${ORDER_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: ORDER_CHAT, text: `📥 Новая заявка на приём: ${shortId}\nРеквизит ${folder_name} выключен.` })
            });

            res.send("ok");
        } else throw new Error("unknown type");

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

// ================= START =================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("🚀 Server started on port", PORT));
