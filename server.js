// server.js
const express = require('express');
const fetch = require('node-fetch'); // Node 18+ можно использовать глобальный fetch
const app = express();

app.use(express.json());

// Google Sheets
const SHEET_WEBHOOK = "https://script.google.com/macros/s/AKfycbzQw_kXTGEqXgMBMs7giFhYygV1LR24MvU5uuQyocyWzuV6mhfsap_-Obl0HJ2FfHU-/exec";

// Telegram для логирования ошибок
const LOG_BOT_TOKEN = "8690662918:AAHK4ey7irw7yxs-4CUUMxIXtZ-_FjrbRbo";
const LOG_CHAT_ID = "8690662918";

// CORS заголовки (для тестов, можно убрать в проде, если данные приходят не из браузера)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Приём заявки от autorefresh.io
app.post('/order', async (req, res) => {
    console.log("POST /order пришёл:", req.body);

    const { external_id, card, amount } = req.body;

    if (!external_id || !card || !amount) {
        console.log("Ошибка: не все поля переданы");
        res.send("error: missing fields");
        return;
    }

    try {
        const response = await fetch(SHEET_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ external_id, card, amount })
        });

        const text = await response.text();
        console.log("Ответ Google Sheets:", text);
        res.send(text);

    } catch (err) {
        console.log("Ошибка при записи в Google Sheets:", err);

        // Логируем ошибку в Telegram Loggs
        try {
            await fetch(`https://api.telegram.org/bot${LOG_BOT_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: LOG_CHAT_ID,
                    text: `❌ Ошибка при записи в Google Sheets:\nexternal_id: ${external_id}\nОшибка: ${err.message}`
                })
            });
        } catch (e) {
            console.log("Не удалось отправить лог в Telegram:", e);
        }

        res.send("error");
    }
});

// Порт
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log("Server started on port", PORT);
});
