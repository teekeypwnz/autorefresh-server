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

// ================= CONSTANTS =================
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
    const { type, external_id, card, amount, accessToken, fingerKey } = req.body;

    if (!external_id || !card || !amount) {
        return res.send("error: missing fields");
    }

    const shortId = external_id.slice(0, 10);
    const folder_name = `${card} / ${amount} / ${shortId}`;
    const bucket = amount == 100 ? BUCKET_100 : BUCKET_200;

    try {
// ================= PAYOUT =================
if (type === "payout") {

    // Формируем короткий external_id и folder_name
    const shortId = external_id.slice(0, 10);
    const folder_name = `${card} / ${amount} / ${shortId}`;
    const bucket = amount == 100 ? BUCKET_100 : BUCKET_200;

    console.log("PAYOUT POST to Sheets:", {
        shortId,
        card,
        amount,
        folder_name
    });

// ------------------- Таблица -------------------
const folder_name_for_sheet = `${shortId} / ${amount} / ${card}`; // жёсткий формат для таблицы

await fetch(SHEET_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        type: "payout",
        external_id: shortId,
        card,
        amount,
        folder_name: folder_name_for_sheet // отправляем корректный folder_name
    })
});

    // ------------------- Создать реквизит -------------------
    await fetch("https://auth.acesortie.shop/user/offers", {
        method: "POST",
        headers: {
            "accept": "*/*",
            "content-type": "application/json",
            "accesstoken": accessToken,
            "fingerkey": fingerKey
        },
        body: JSON.stringify({
            create_active: true,
            folder_name,
            payment: [{ address: card, extra: `{"recipient_name_azn":"${NAME}"}` }],
            sessions_id: [SESSION_ID],
            token_from: TOKEN_FROM,
            override_bucket_id: bucket,
            token_to: TOKEN_TO,
            type: "SELL"
        })
    });

    // ------------------- Telegram уведомление -------------------
    await fetch(`https://api.telegram.org/bot${ORDER_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: ORDER_CHAT,
            text: `✅ Новая выплата с external_id: ${shortId}\nСоздан реквизит по следующим параметрам:\nНазвание папки - ${folder_name}\nРеквизит - ${card}\nСумма - ${amount}`
        })
    });
}
        // ================= RECEIVE =================
if (type === "receive") {
    // Формируем folder_name в едином формате для поиска строки
    const folder_name_for_sheet = `${card} / ${amount} / ${shortId}`;

    // ------------------- Таблица -------------------
    await fetch(SHEET_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            type: "receive",
            external_id: shortId,          // короткий external_id
            folder_name: folder_name_for_sheet // используем тот же формат, что и в payout
        })
    });

    // ------------------- Выключение реквизита -------------------
    await fetch("https://auth.acesortie.shop/user/offers", {
        method: "POST",
        headers: {
            "accept": "*/*",
            "content-type": "application/json",
            "accesstoken": accessToken,
            "fingerkey": fingerKey
        },
        body: JSON.stringify({
            create_active: false,
            folder_name: folder_name_for_sheet, // единый формат
            payment: [{ address: card, extra: `{"recipient_name_azn":"${NAME}"}` }],
            sessions_id: [SESSION_ID],
            token_from: TOKEN_FROM,
            override_bucket_id: bucket,
            token_to: TOKEN_TO,
            type: "SELL"
        })
    });
    // ------------------- Telegram -------------------
    await fetch(`https://api.telegram.org/bot${ORDER_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: ORDER_CHAT,
            text: `📥 Новая заявка на приём с external_id: ${shortId}\nВыключен реквизит с названием: ${folder_name_for_sheet}`
        })
    });
}

        res.send("ok");
    } catch (error) {
        console.error(error);
        res.send("error");
    }
});

// ================= SERVER =================
app.listen(3000, () => console.log("Server started on port 3000"));
