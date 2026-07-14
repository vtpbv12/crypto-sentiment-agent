const knex = require("../config/database");
const {
    askOpenAIForBreakingNewsBatch,
    askOpenAIForDailyForecastBatch,
} = require("./openaiService");

const CRYPTO_NAMES = ["Bitcoin", "Ethereum", "Litecoin", "Dogecoin", "Solana", "Ripple"];

// Используем явную таймзону для "сегодня"
const TZ = process.env.APP_TZ || "Europe/Amsterdam";

// Простой in-process кэш на короткое время
const cache = {
    breaking: { day: null, message: null, ts: 0 },
    forecasts: { day: null, message: null, ts: 0 },
};
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 минуты

function todayStrTZ() {
    // Получаем компоненты даты в нужной таймзоне без внешних либ
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("ru-RU", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    const parts = fmt.formatToParts(now).reduce((acc, p) => {
        if (p.type !== "literal") acc[p.type] = p.value;
        return acc;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`; // YYYY-MM-DD
}

// Телеграм допускает 4096 символов (лучше резать уже «чистый» HTML)
function clampTelegram(text) {
    if (!text) return text;
    return text.length > 4096 ? text.slice(0, 4093) + "..." : text;
}

function sanitizeTelegramHtml(text) {
    return String(text || "")
        .replace(/<(?!\/?(b|i|u|s|code|pre|a|tg-spoiler)\b)[^>]*>/gi, "")
        .replace(/<\/?(html|body|head|div|span|p)[^>]*>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .trim();
}

// Универсальный апсерт с защитой от гонок:
// 1) пробуем insert ... on conflict do nothing
// 2) если конфликт — просто читаем имеющееся
async function upsertDaily(table, day, message, payload) {
    const rowToInsert = {
        day,
        message,
        payload: JSON.stringify(payload || {}),
        created_at: new Date(),
        updated_at: new Date(),
    };

    // Важно: в таблице должен быть UNIQUE(day)
    try {
        await knex(table)
            .insert(rowToInsert)
            .onConflict("day")
            .ignore(); // ничего не делаем при конфликте
    } catch (e) {
        // На всякий случай лог
        console.error(`[${table}] upsert insert error:`, e.message);
    }

    // Читаем актуальное значение (вставленное сейчас или ранее)
    const row = await knex(table).where({ day }).orderBy("id", "desc").first();
    if (row?.message) return { message: row.message, payload: row.payload };

    // fallback — если по какой-то причине записи всё же нет
    return { message, payload };
}

// --- PUBLIC ---

async function getOrCreateTodayBreakingNews() {
    const day = todayStrTZ();

    // Кэш
    if (cache.breaking.day === day && Date.now() - cache.breaking.ts < CACHE_TTL_MS) {
        if (cache.breaking.message) {
            return { message: cache.breaking.message };
        }
    }

    // 1) пробуем взять из БД
    const existing = await knex("breaking_news_daily").where({ day }).orderBy("id", "desc").first();
    if (existing?.message) {
        cache.breaking = { day, message: existing.message, ts: Date.now() };
        return { message: existing.message, payload: existing.payload };
    }

    // 2) нет в БД — пробуем запросом к OpenAI
    // передавать «прошлые» можно по желанию — здесь не требуется
    const raw = await askOpenAIForBreakingNewsBatch(CRYPTO_NAMES, []);
    const cleaned = sanitizeTelegramHtml(raw);

    const hasNews = cleaned && !/нет/i.test(cleaned) && cleaned.length > 10;
    if (!hasNews) {
        cache.breaking = { day, message: null, ts: Date.now() };
        return null;
    }

    const finalMessage = clampTelegram(`<b>🚨 Срочные крипто-новости</b>\n\n${cleaned}`);

    const saved = await upsertDaily("breaking_news_daily", day, finalMessage, { source: "on_demand" });

    cache.breaking = { day, message: saved.message, ts: Date.now() };
    return saved;
}

async function getOrCreateTodayForecasts() {
    const day = todayStrTZ();

    // Кэш
    if (cache.forecasts.day === day && Date.now() - cache.forecasts.ts < CACHE_TTL_MS) {
        if (cache.forecasts.message) {
            return { message: cache.forecasts.message };
        }
    }

    // 1) пробуем взять из БД
    const existing = await knex("daily_forecasts").where({ day }).orderBy("id", "desc").first();
    if (existing?.message) {
        cache.forecasts = { day, message: existing.message, ts: Date.now() };
        return { message: existing.message, payload: existing.payload };
    }

    // 2) генерация через OpenAI
    let raw = null;
    try {
        raw = await askOpenAIForDailyForecastBatch(CRYPTO_NAMES);
    } catch (e) {
        console.error("[daily_forecasts] OpenAI error:", e.message);
    }

    const cleaned = sanitizeTelegramHtml(raw);
    if (!cleaned || cleaned.length < 10) {
        const msg = "Сегодня ещё нет прогнозов. Загляни позже.";
        cache.forecasts = { day, message: msg, ts: Date.now() };
        return { message: msg };
    }

    const finalMessage = clampTelegram(`<b>📅 Прогнозы на сегодня</b>\n\n${cleaned}`);

    const saved = await upsertDaily("daily_forecasts", day, finalMessage, { source: "on_demand" });

    cache.forecasts = { day, message: saved.message, ts: Date.now() };
    return saved;
}

module.exports = {
    getOrCreateTodayBreakingNews,
    getOrCreateTodayForecasts,
};
