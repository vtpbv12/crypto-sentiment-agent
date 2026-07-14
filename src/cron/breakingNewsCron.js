// src/cron/breakingNewsCron.js
const cron = require("node-cron");
const { askOpenAIForBreakingNewsBatch } = require("../services/openaiService");
const userService = require("../db/models/users");
const { setTimeout } = require("timers/promises");
const { unsubscribeUser } = require("../services/userService");
const knex = require("../config/database");

const CRYPTO_NAMES = ["Bitcoin", "Ethereum", "Litecoin", "Dogecoin", "Solana", "Ripple"];
// прод
const BREAKING_NEWS_CHECK_INTERVAL = "*/30 * * * *";

function sanitizeTelegramHtml(text) {
    return String(text || "")
        .replace(/<(?!\/?(b|i|u|s|code|pre|a|tg-spoiler)\b)[^>]*>/gi, "")
        .replace(/<\/?(html|body|head|div|span|p)[^>]*>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .trim();
}
const clamp = (t) => (t.length > 4096 ? t.slice(0, 4093) + "..." : t);

function extractCryptoSummaries(message) {
    const blocks = message.split(/🪙\s*/).slice(1);
    return blocks
        .map((block) => {
            const [nameLine, ...rest] = block.split("\n");
            const name = nameLine?.trim();
            const summary = (rest.find((l) => /📢/i.test(l)) || "").replace(/📢\s*Суть:\s*/i, "").trim();
            const recommendation = (rest.find((l) => /🎯/i.test(l)) || "").replace(/🎯\s*Рекомендация:\s*/i, "").trim();
            return { name, summary, recommendation };
        })
        .filter((x) => x.name && x.summary && x.recommendation);
}

module.exports = (bot) => {
    cron.schedule(BREAKING_NEWS_CHECK_INTERVAL, async () => {
        console.log("[CRON] Проверка срочных крипто-новостей...");

        try {
            const users = await userService.getSubscribedUsers();
            console.log("[CRON] Подписчиков для рассылки:", users.length);
            if (!users.length) return;

            console.log("[CRON] -> askOpenAIForBreakingNewsBatch()");
            const t0 = Date.now();
            const aiRaw = await askOpenAIForBreakingNewsBatch(CRYPTO_NAMES, []);
            const dt = Date.now() - t0;
            console.log(`[CRON] <- LLM ответ за ${dt}ms, длина=${(aiRaw || "").length}`);

            const cleaned = sanitizeTelegramHtml(aiRaw || "");
            if (!cleaned || /^no_news$/i.test(cleaned) || cleaned.length < 10) {
                console.log("[CRON] Срочных новостей нет — рассылку пропускаем.");
                return;
            }

            const parsed = extractCryptoSummaries(cleaned);
            if (!parsed.length) {
                console.log("[CRON] LLM ответ без валидных блоков — рассылку пропускаем.");
                return;
            }

            const header = `<b>🚨 Срочные крипто-новости</b>\n\n`;
            const body = parsed
                .map((n) => `🪙 <b>${n.name}</b>\n<b>📢 Суть:</b> ${n.summary}\n<b>🎯 Рекомендация:</b> ${n.recommendation}`)
                .join("\n\n");
            const message = clamp(header + body);

            // сохранить на сегодня (необязательно, но удобно)
            try {
                const day = new Date().toISOString().slice(0, 10);
                await knex("breaking_news_daily")
                    .insert({
                        day,
                        message,
                        payload: JSON.stringify({ source: "cron" }),
                        created_at: new Date(),
                        updated_at: new Date(),
                    })
                    .onConflict("day")
                    .ignore();
            } catch (e) {
                console.error("[CRON] save breaking_news_daily error:", e.message);
            }

            for (const user of users) {
                try {
                    console.log(`[CRON] NEWS -> ${user.telegram_id} (len=${message.length})`);
                    await bot.sendMessage(user.telegram_id, message, {
                        parse_mode: "HTML",
                        disable_web_page_preview: true,
                    });
                    console.log(`[CRON] NEWS ✔ sent to ${user.telegram_id}`);
                    await setTimeout(600);
                } catch (err) {
                    if (err.response?.statusCode === 403) {
                        console.warn(`[WARN] Бот заблокирован пользователем: ${user.telegram_id}`);
                        await unsubscribeUser(user.telegram_id);
                    } else {
                        console.error(`[ERROR] NEWS не удалось отправить ${user.telegram_id}:`, err.message);
                    }
                }
            }
        } catch (error) {
            console.error("[CRON] Ошибка в breakingNewsCron:", error.message);
        }
    });
};
