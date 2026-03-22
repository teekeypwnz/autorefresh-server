const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.use(express.json());

// CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

// ================= CONFIG =================
const SHEET_WEBHOOK = "https://script.google.com/macros/s/ВАШ_SCRIPT_ID/exec";

// Telegram
const ORDER_TOKEN = "ВАШ_ORDER_TOKEN";
const ORDER_CHAT = "ВАШ_ORDER_CHAT";

const LOG_TOKEN = "ВАШ_LOG_TOKEN";
const LOG_CHAT = "ВАШ_LOG_CHAT";

// реквизиты
const SESSION_ID = "ВАШ_SESSION_ID";
const NAME = "Name Name";

const BUCKET_100 = "ВАШ_BUCKET_100";
const BUCKET_200 = "ВАШ_BUCKET_200";

const TOKEN_FROM = "KAPITALAZN";
const TOKEN_TO = "USDTTRC";

// 🔑 Токены
const ACCESS_TOKEN = "ВАШ_ACCESS_TOKEN";
const FINGER_KEY = "ВАШ_FINGER_KEY";

// ================= HELPERS =================
async function getFolders() {
    const res = await fetch("https://auth.acesortie.shop/user/payment_details/folders?", {
        method: "GET",
        headers: {
            "accept": "*/*",
            "accesstoken": ACCESS_TOKEN,
            "fingerkey": FINGER_KEY
        }
    });
    const data = await res.json();
    return data?.result?.folders || [];
}

async function pauseFolder(internal_id) {
    console.log("⛔ Выключаем реквизит:", internal_id);
    await fetch(`https://auth.acesortie.shop/user/payment_details/folders/${internal_id}`, {
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

// ================= MAIN =================
app.post('/order', async (req, res) => {
    const { type, order } = req.body;

    try {
        // ===== PAYOUT =====
        if (type === "payout") {
            const shortId = order.external_id.slice(0, 10);
            const card = order.payment_details_address;
            const amount = order.creator_amount;
            const folderName = `${card} / ${amount} / ${shortId}`;

            // таблица
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

            const bucket = amount == 100 ? BUCKET_100 : BUCKET_200;

            // создаём реквизит
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
                    folder_name: folderName,
                    payment: [{ address: card, extra: `{"recipient_name_azn":"${NAME}"}` }],
                    sessions_id: [SESSION_ID],
                    token_from: TOKEN_FROM,
                    override_bucket_id: bucket,
                    token_to: TOKEN_TO,
                    type: "SELL"
                })
            });

            // TG
            await fetch(`https://api.telegram.org/bot${ORDER_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: ORDER_CHAT,
                    text: `✅ Новая выплата с external_id: ${shortId}\nСоздан реквизит:\nНазвание папки - ${folderName}\nРеквизит - ${card}\nСумма - ${amount}`
                })
            });
        }

        // ===== RECEIVE =====
        if (type === "receive") {
            const shortId = order.external_id.slice(0, 10);
            const card = order.payment_details_address;
            const amount = order.creator_amount;
            const folderName = order.folder_name; // folder_name для поиска

            // таблица
            await fetch(SHEET_WEBHOOK, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mode: "update_receive",
                    folder_name: folderName,
                    external_id_receive: shortId
                })
            });

            // 🔥 ищем реквизит
            const folders = await getFolders();
            const target = folders.find(f => f.name === folderName);

            if (target) await pauseFolder(target.internal_id);
            else console.log("⚠️ Реквизит не найден");

            // TG
            await fetch(`https://api.telegram.org/bot${ORDER_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: ORDER_CHAT,
                    text: `📥 Новая заявка на приём с external_id: ${shortId}\nВыключен реквизит: ${folderName}`
                })
            });
        }

        res.send("ok");

    } catch (err) {
        console.error("ERROR:", err.message);
        await fetch(`https://api.telegram.org/bot${LOG_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: LOG_CHAT, text: "❌ " + err.message })
        });
        res.send("error");
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("🚀 Server started"));
