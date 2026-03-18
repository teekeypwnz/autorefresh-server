const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

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

// ================= MAIN =================
app.post('/order', async (req, res) => {

    const { external_id, card, amount, accessToken, fingerKey } = req.body;

    const shortId = external_id.slice(0, 10);
    const folderName = `${card} / ${amount} / ${shortId}`;

    try {

        // ===== 1. запись в таблицу =====
        await fetch(SHEET_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                external_id: shortId,
                card,
                amount
            })
        });

        // ===== 2. создание реквизита =====
        const bucket = amount == 100 ? BUCKET_100 : BUCKET_200;

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
                payment: [{
                    address: card,
                    extra: `{"recipient_name_azn":"${NAME}"}`
                }],
                sessions_id: [SESSION_ID],
                token_from: TOKEN_FROM,
                override_bucket_id: bucket,
                token_to: TOKEN_TO,
                type: "SELL"
            })
        });

        const createText = await createResp.text();
        console.log("CREATE:", createText);

        // ===== 3. поставить галочку =====
        await fetch(SHEET_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                external_id: shortId,
                setActive: true
            })
        });

        // ===== 4. Telegram Order checker =====
        const text =
`✅ Новый реквизит по выплате с external_id: ${shortId}
Название папки - ${folderName}
Реквизит - ${card}
Сумма - ${amount}`;

        await fetch(`https://api.telegram.org/bot${ORDER_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: ORDER_CHAT,
                text
            })
        });

        res.send("ok");

    } catch (err) {

        console.log("ERROR:", err);

        await fetch(`https://api.telegram.org/bot${LOG_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: LOG_CHAT,
                text: `❌ Ошибка\n${err.message}`
            })
        });

        res.send("error");
    }
});

app.listen(10000, () => console.log("Server started"));
