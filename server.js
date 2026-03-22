const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

// CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "https://lk.acesortie.shop");
    res.header("Access-Control-Allow-Headers", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

// CONFIG
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

const { type, order } = req.body;

if (!type || !order) {
    return res.send("error: missing fields");
}

    try {

        // ================= PAYOUT =================
if (type === "payout") {

    const shortId = order.external_id.slice(0, 10);
    const card = order.payment_details_address;
    const amount = order.creator_amount;

    const folder_name = `${card} / ${amount} / ${shortId}`;
    const bucket = amount == 100 ? BUCKET_100 : BUCKET_200;

    // ===== таблица =====
    await fetch(SHEET_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            type: "payout",
            external_id: shortId,
            card,
            amount,
            folder_name
        })
    });

    // ===== создание реквизита =====
    await fetch("https://auth.acesortie.shop/user/offers", {
        method: "POST",
        headers: {
            "accept": "*/*",
            "content-type": "application/json",
            "accesstoken": ACCESS_TOKEN,
            "fingerkey": FINGER_KEY
        },
        body: JSON.stringify({
            create_active: true,
            folder_name: folder_name,
            payment: [{ address: card, extra: `{"recipient_name_azn":"${NAME}"}` }],
            sessions_id: [SESSION_ID],
            token_from: TOKEN_FROM,
            override_bucket_id: bucket,
            token_to: TOKEN_TO,
            type: "SELL"
        })
    });

    // ===== Telegram =====
    await fetch(`https://api.telegram.org/bot${ORDER_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: ORDER_CHAT,
            text: `✅ Выплата ${shortId}\n${folder_name}`
        })
    });
}
        // ================= RECEIVE =================
if (type === "receive") {

    const shortId = order.external_id.slice(0, 10);
    const folder_name = order.folder_name;

    // ===== таблица =====
    await fetch(SHEET_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            type: "receive",
            external_id: shortId,
            folder_name
        })
    });

    // ===== ищем реквизит =====
    const resFolders = await fetch("https://auth.acesortie.shop/user/payment_details/folders?", {
        method: "GET",
        headers: {
            "accept": "*/*",
            "accesstoken": ACCESS_TOKEN,
            "fingerkey": FINGER_KEY
        }
    });

    const dataFolders = await resFolders.json();
    const folders = dataFolders?.result?.folders || [];

    const target = folders.find(f => f.name === folder_name);

    if (target) {
        await fetch(`https://auth.acesortie.shop/user/payment_details/folders/${target.internal_id}`, {
            method: "PATCH",
            headers: {
                "accept": "*/*",
                "content-type": "application/json",
                "accesstoken": ACCESS_TOKEN,
                "fingerkey": FINGER_KEY
            },
            body: JSON.stringify({ status: "PAUSED" })
        });
    }

    // ===== Telegram =====
    await fetch(`https://api.telegram.org/bot${ORDER_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: ORDER_CHAT,
            text: `📥 Приём ${shortId}\n${folder_name}`
        })
    });
}
        res.send("ok");

    } catch (err) {

        await fetch(`https://api.telegram.org/bot${LOG_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: LOG_CHAT,
                text: "❌ " + err.message
            })
        });

        res.send("error");
    }
});

app.listen(process.env.PORT || 10000, () => console.log("🚀 Server started"));
