const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

// 🔹 CONFIG
const SHEET_WEBHOOK = "https://script.google.com/macros/s/AKfycbzQw_kXTGEqXgMBMs7giFhYygV1LR24MvU5uuQyocyWzuV6mhfsap_-Obl0HJ2FfHU-/exec";

const LOGGER_TOKEN = "8690662918:AAHK4ey7irw7yxs-4CUUMxIXtZ-_FjrbRbo";
const LOGGER_CHAT = "8690662918";

// 🔹 ENDPOINT
app.post("/order", async (req, res) => {
    const { external_id, card, amount } = req.body;

    try {
        const response = await fetch(SHEET_WEBHOOK, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                external_id,
                card,
                amount
            })
        });

        const text = await response.text();

        if (text !== "ok" && text !== "exists") {
            throw new Error(text);
        }

        return res.send("ok");

    } catch (err) {

        // 🔴 Логируем ошибку в Telegram
        await fetch(`https://api.telegram.org/bot${LOGGER_TOKEN}/sendMessage`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                chat_id: LOGGER_CHAT,
                text: `❌ Ошибка записи в Google Sheets:
external_id: ${external_id}
Ошибка: ${err.message}`
            })
        });

        return res.send("error");
    }
});

// 🔹 PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server started on port", PORT);
});
