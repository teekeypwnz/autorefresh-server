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

const TOKEN_FROM = "KAPITALAZN";
const TOKEN_TO = "USDTTRC";

const BUCKET_100 = "1090ab38-bd6d-4192-bd37-dc2bbde93cfe";
const BUCKET_200 = "436198c9-e60a-4be0-8f10-980f4ea5b401";

// ================= LOGGING =================
async function sendLog(message) {
    try {
        await fetch(`https://api.telegram.org/bot${LOG_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: LOG_CHAT, text: message })
        });
    } catch (err) {
        console.error("❌ Ошибка отправки логов в Telegram:", err);
    }
}

// ================= FOLDERS CACHE =================
let cachedFolders = null;
let lastFoldersUpdate = 0;

async function getFolders(accessToken, fingerKey) {
    try {
        const now = Date.now();
        if (cachedFolders && now - lastFoldersUpdate < 3 * 60 * 1000) {
            return cachedFolders;
        }

        const res = await fetch("https://auth.acesortie.shop/user/payment_details/folders?", {
            method: "GET",
            headers: {
                "accept": "*/*",
                "content-type": "application/json",
                "accesstoken": accessToken,
                "fingerkey": fingerKey
            }
        });

        const data = await res.json();
        if (data.status === "SUCCESS" && data.result?.folders) {
            cachedFolders = data.result.folders;
            lastFoldersUpdate = now;
            return cachedFolders;
        }
        return [];
    } catch (err) {
        await sendLog(`❌ Ошибка получения folders: ${err.message}`);
        return [];
    }
}

// ================= MAIN =================
app.post('/order', async (req, res) => {
    const { type, external_id, card, amount, folder_name, accessToken, fingerKey } = req.body;

    if (!external_id || !card || !amount) {
        await sendLog(`❌ POST /order: missing fields ${JSON.stringify(req.body)}`);
        return res.send("error: missing fields");
    }

    const shortId = external_id.slice(0, 10);

    try {
        // ------------------- PAYOUT -------------------
        if (type === "payout") {
            await sendLog(`✅ PAYOUT received: ${shortId}`);
            const folderRowName = `${card} / ${amount} / ${shortId}`;
            const bucket = amount === 100 ? BUCKET_100 : BUCKET_200;

            // 1. Google Sheet
            await fetch(SHEET_WEBHOOK, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "payout", external_id: shortId, card, amount })
            });

            // 2. Создание реквизита
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
                    folder_name: folderRowName,
                    payment: [{ address: card, extra: `{"recipient_name_azn":"${NAME}"}` }],
                    sessions_id: [SESSION_ID],
                    token_from: TOKEN_FROM,
                    token_to: TOKEN_TO,
                    override_bucket_id: bucket,
                    type: "SELL"
                })
            });
            const createText = await createResp.text();
            console.log("📦 Ответ создания реквизита:", createText);

            // 3. Telegram
            await fetch(`https://api.telegram.org/bot${ORDER_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: ORDER_CHAT,
                    text: `✅ PAYOUT external_id: ${shortId}\nРеквизит: ${card}\nСумма: ${amount}`
                })
            });
        }

        // ------------------- RECEIVE -------------------
        if (type === "receive") {
            await sendLog(`📥 RECEIVE started: ${shortId}`);

            if (!folder_name) {
                await sendLog(`❌ folder_name отсутствует в receive: ${shortId}`);
                return res.send("error: missing folder_name");
            }

            const folders = await getFolders(accessToken, fingerKey);
            const matchedFolder = folders.find(f => f.name === folder_name);

            if (!matchedFolder) {
                await sendLog(`❌ Не найдена папка для folder_name: ${folder_name}`);
            } else {
                const folder_id = matchedFolder.internal_id;

                // 1. Выключение реквизита
                try {
                    await fetch("https://auth.acesortie.shop/user/offers/pause/all", {
                        method: "PUT",
                        headers: {
                            "accept": "*/*",
                            "content-type": "application/json",
                            "accesstoken": accessToken,
                            "fingerkey": fingerKey
                        },
                        body: JSON.stringify({ folder_id })
                    });
                    await sendLog(`✅ Реквизит выключен для folder_name: ${folder_name}`);
                } catch (err) {
                    await sendLog(`❌ Ошибка выключения реквизита: ${err.message}`);
                }
            }

            // 2. Telegram
            await fetch(`https://api.telegram.org/bot${ORDER_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: ORDER_CHAT,
                    text: `📥 RECEIVE external_id: ${shortId}\nРеквизит: ${card}\nСумма: ${amount}\nПапка: ${folder_name}`
                })
            });

            // 3. Google Sheet (только столбец G)
            try {
                await fetch(SHEET_WEBHOOK, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: "receive", external_id: shortId, folder_name, card, amount })
                });
                await sendLog(`✅ Запись receive external_id ${shortId} в Google Sheet (столбец G)`);
            } catch (err) {
                await sendLog(`❌ Ошибка записи receive в Google Sheet: ${err.message}`);
            }
        }

        res.send("ok");
    } catch (err) {
        console.error("❌ Ошибка на сервере:", err);
        await sendLog(`❌ Ошибка на сервере: ${err.message}`);
        res.send("error");
    }
});

// ================= SERVER =================
app.listen(3000, () => console.log("Server started on port 3000"));
