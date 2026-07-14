const cron = require("node-cron");
const { getCryptoPrices } = require("../services/coinGeckoService");
const { getImportantNews } = require("../services/cryptoPanicService");
const { buildAnalyticsForCrypto } = require("../services/analyticsService");
const userService = require("../db/models/users");
const priceService = require("../db/models/cryptoPrices");
const sentNewsService = require("../db/models/sentNews");
const { askOpenAIForRecommendation } = require("../services/openaiService");
const { setTimeout } = require("timers/promises");

const PRICE_CHECK_INTERVAL = "0 * * * *";       // каждый час, в начале часа
const NEWS_CHECK_INTERVAL = "0 9 * * *";
// const PRICE_CHECK_INTERVAL = "*/1 * * * *";  // каждую минуту (для тестов)
// const NEWS_CHECK_INTERVAL = "*/1 * * * *";   // каждую минуту (для тестов)
const PERCENT_THRESHOLD = 5;

module.exports = (bot) => {
    cron.schedule(PRICE_CHECK_INTERVAL, async () => {
        console.log("[CRON] Проверка изменения цен...");

        try {
            const [currentPrices, users] = await Promise.all([
                getCryptoPrices(),
                userService.getSubscribedUsers(),
            ]);

            if (!users.length) {
                console.log("[CRON] Нет подписчиков — пропускаем проверку цен.");
                return;
            }

            await handlePrices(currentPrices, users, bot);
        } catch (error) {
            console.error("[CRON] Ошибка в cron-ценах:", error.message);
        }
    });

    cron.schedule(NEWS_CHECK_INTERVAL, async () => {
        console.log("[CRON] Ежедневная проверка новостей...");

        try {
            const [newsList, users] = await Promise.all([
                getImportantNews(),
                userService.getSubscribedUsers(),
            ]);

            if (!users.length) {
                console.log("[CRON] Нет подписчиков — пропускаем проверку новостей.");
                return;
            }

            await handleNews(newsList, users, bot);
        } catch (error) {
            console.error("[CRON] Ошибка в cron-новостях:", error.message);
        }
    });
};

async function handlePrices(currentPrices, users, bot) {
    const pLimit = (await import("p-limit")).default;
    const limit = pLimit(5);
    const limitDb = pLimit(3);

    for (const [crypto, data] of Object.entries(currentPrices)) {
        const latestDbRecord = await limitDb(() =>
            priceService.getLastPrice(crypto)
        );

        if (latestDbRecord) {
            const oldPrice = parseFloat(latestDbRecord.price_usd);
            const newPrice = parseFloat(data.usd);
            const percentChange = ((newPrice - oldPrice) / oldPrice) * 100;

            if (Math.abs(percentChange) >= PERCENT_THRESHOLD) {
                console.log(`[CRON] Цена ${crypto} изменилась на ${percentChange.toFixed(2)}%.`);

                const aiAnalysis = await askOpenAIForRecommendation(crypto, newPrice, percentChange);
                await setTimeout(1000);

                const message = await buildAnalyticsForCrypto(crypto, newPrice, percentChange, aiAnalysis);

                await Promise.all(users.map(user =>
                    limit(() =>
                        bot.sendMessage(user.telegram_id, message, { parse_mode: "Markdown" })
                    )
                ));
            }
        }

        await limitDb(() => priceService.upsertPrice(crypto, data.usd));
    }
}

async function handleNews(newsList, users, bot) {
    const pLimit = (await import("p-limit")).default;
    const limit = pLimit(5);
    const limitDb = pLimit(3);

    await limitDb(() => sentNewsService.deleteOldNews(1));

    for (const news of newsList) {
        const alreadySent = await limitDb(() =>
            sentNewsService.isNewsSent(news.id)
        );

        if (!alreadySent) {
            console.log(`[CRON] Новая новость: ${news.title}`);

            // --- Фикс url ---
            let safeUrl;
            if (news.url) {
                safeUrl = encodeURI(news.url);
            } else if (news.slug) {
                // подставляем базовый сайт — CryptoPanic (если другой источник, поменяешь baseUrl)
                const baseUrl = "https://cryptopanic.com/news";
                safeUrl = encodeURI(`${baseUrl}/${news.slug}`);
            } else {
                safeUrl = "https://cryptopanic.com/news"; // запасной вариант
            }

            const safeTitle = escapeHtml(news.title);
            console.log(JSON.stringify(news), "news");
            console.log(safeUrl, "url");

            const message = `📰 <b>${safeTitle}</b>\n<a href="${safeUrl}">Читать новость</a>`;

            await Promise.all(users.map(user =>
                limit(() =>
                    bot.sendMessage(user.telegram_id, message, {
                        parse_mode: "HTML",
                        disable_web_page_preview: true
                    })
                )
            ));

            await limitDb(() =>
                sentNewsService.markNewsAsSent(news.id)
            );
        }
    }
}

function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
