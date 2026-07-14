// src/cron/dailyAnalyticsCron.js
const cron = require("node-cron");
const { getCryptoFullInfo } = require("../services/coinGeckoService");
const { askOpenAIForCurrency } = require("../services/openaiService");
const userService = require("../db/models/users");
const { setTimeout } = require("timers/promises");
const { unsubscribeUser } = require("../services/userService");

const DEBUG_AI = String(process.env.DEBUG_AI || "0") === "1";
const log = (...args) => DEBUG_AI && console.log(...args);

const CRYPTO_IDS = ["bitcoin", "ethereum", "litecoin", "dogecoin", "solana", "ripple"];
// боевой график
const DAILY_ANALYTICS_TIME = "0 10 * * *";
// для теста чаще:
// const DAILY_ANALYTICS_TIME = "*/1 * * * *";

// разрешённый HTML
function sanitizeTelegramHtml(text) {
    return String(text || "")
        .replace(/<(?!\/?(b|i|u|s|code|pre|a|tg-spoiler)\b)[^>]*>/gi, "")
        .replace(/<\/?(html|body|head|div|span|p)[^>]*>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/&nbsp;/gi, " ")
        .trim();
}
const clamp = (t) => (t.length > 4096 ? t.slice(0, 4093) + "..." : t);
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

module.exports = (bot) => {
    cron.schedule(DAILY_ANALYTICS_TIME, async () => {
        console.log("[CRON] Запуск ежедневной AI-аналитики...");

        try {
            const fullInfo = await getCryptoFullInfo(CRYPTO_IDS);
            const users = await userService.getSubscribedUsers();
            console.log("[CRON] Подписчиков для рассылки:", users.length);
            if (!users.length) return;

            const messages = [];

            for (const cryptoId of CRYPTO_IDS) {
                const data = fullInfo[cryptoId];
                if (!data) {
                    console.warn("[CRON] Нет данных CoinGecko для:", cryptoId);
                    continue;
                }

                const name = cap(cryptoId);
                const priceUsd = data.usd;
                const marketCapUsd = data.usd_market_cap;
                const volume24hUsd = data.usd_24h_vol;

                console.log(`[CRON] (${name}) генерация AI-аналитики...`);
                const t0 = Date.now();
                const aiRaw = await askOpenAIForCurrency(name, priceUsd, marketCapUsd, volume24hUsd);
                const t1 = Date.now();

                // лог сразу после LLM
                console.log(`[CRON] (${name}) AI ответ получен за ${t1 - t0}ms, длина=${(aiRaw || "").length}`);
                log(`[CRON] (${name}) AI превью: "${String(aiRaw).slice(0, 120).replace(/\n/g, " ")}..."`);

                const text = clamp(sanitizeTelegramHtml(aiRaw || "—"));
                messages.push(text);

                await setTimeout(600);
            }

            // Отправка
            for (const user of users) {
                for (const msg of messages) {
                    try {
                        console.log(`[CRON] Отправка пользователю ${user.telegram_id}: длина=${msg.length}`);
                        await bot.sendMessage(user.telegram_id, msg, {
                            parse_mode: "HTML",
                            disable_web_page_preview: true,
                        });
                        console.log(`[CRON] ✔ Отправлено пользователю ${user.telegram_id}`);
                        await setTimeout(500);
                    } catch (err) {
                        if (err.response?.statusCode === 403) {
                            console.warn(`[WARN] Бот заблокирован пользователем: ${user.telegram_id}`);
                            await unsubscribeUser(user.telegram_id);
                        } else {
                            console.error(`[ERROR] Не удалось отправить ${user.telegram_id}:`, err.message);
                        }
                    }
                }
                await setTimeout(800);
            }
        } catch (error) {
            console.error("[CRON] Ошибка в AI-анализе:", error.message);
        }
    });
};
