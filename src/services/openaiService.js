// src/services/openaiService.js
require("dotenv").config();
const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");
const timers = require("timers/promises");
const { getIndicators } = require("./taService");
const { getCryptoFullInfo } = require("./coinGeckoService");

/* ==================== ПРОКСИ ==================== */
const USE_PROXY = String(process.env.USE_PROXY || "false").toLowerCase() === "true";
const PROXY_URL = process.env.PROXY_URL || "http://S5jb2p:KBRTEC@46.232.12.78:8000";
const agent = USE_PROXY ? new HttpsProxyAgent(PROXY_URL) : undefined;
console.log(`[DeepSeek] Proxy ${USE_PROXY ? "enabled" : "disabled"}`);

/* ==================== DeepSeek HTTP клиент ==================== */
const deepSeekClient = axios.create({
    baseURL: "https://api.deepseek.com/v1",
    headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
    },
    httpAgent: agent,
    httpsAgent: agent,
    timeout: 20000,
    validateStatus: () => true,
});

deepSeekClient.interceptors.request.use((config) => {
    if (config.data && typeof config.data === "object") {
        const tp = config.data.top_p;
        if (tp == null || typeof tp !== "number" || tp <= 0 || tp > 1) {
            config.data.top_p = 1.0;
        }
        const t = config.data.temperature;
        if (t == null || typeof t !== "number" || t < 0) {
            config.data.temperature = 0.2;
        }
        if (config.data.stream === undefined) config.data.stream = false;

        Object.keys(config.data).forEach((k) => {
            if (config.data[k] == null) delete config.data[k];
        });
    }
    return config;
});

/* ==================== Вспомогательные ==================== */
function withHardTimeout(promise, ms, tag = "request") {
    return Promise.race([
        promise,
        new Promise((_, rej) => setTimeout(() => rej(new Error(`[timeout] ${tag} > ${ms}ms`)), ms)),
    ]);
}

function mapCryptoToBinanceSymbol(name) {
    const n = String(name || "").toLowerCase();
    if (n.includes("bitcoin") || n === "btc") return "BTCUSDT";
    if (n.includes("ethereum") || n === "eth") return "ETHUSDT";
    if (n.includes("litecoin") || n === "ltc") return "LTCUSDT";
    if (n.includes("dogecoin") || n === "doge") return "DOGEUSDT";
    if (n.includes("solana") || n === "sol") return "SOLUSDT";
    if (n.includes("ripple") || n === "xrp") return "XRPUSDT";
    return "BTCUSDT";
}

function fmt(n, digits = 2) {
    if (n == null || Number.isNaN(n)) return "—";
    const num = Number(n);
    return digits != null ? num.toFixed(digits) : String(num);
}

function buildTechBlock(cryptoName, priceUsd, marketCapUsd, volume24hUsd, ind) {
    const lines = [];
    lines.push(`📈 <b>Прогноз для ${cryptoName}</b>\n`);
    lines.push(`<b>💰 Финансовые показатели:</b>`);
    lines.push(`• Текущая цена: $${Number(priceUsd ?? ind.close ?? 0).toLocaleString("en-US")}`);
    if (marketCapUsd != null) lines.push(`• Капитализация: $${Number(marketCapUsd).toLocaleString("en-US")}`);
    if (volume24hUsd != null) lines.push(`• Объём торгов 24ч: $${Number(volume24hUsd).toLocaleString("en-US")}`);
    lines.push("");
    lines.push(`<b>📊 Индикаторы (Binance Spot, 1h):</b>`);
    lines.push(`• RSI(14): ${fmt(ind.rsi, 2)}`);
    lines.push(`• SMA(50): $${fmt(ind.sma50, 2)}`);
    lines.push(`• EMA(20): $${fmt(ind.ema20, 2)}`);
    lines.push(`• MACD(12,26,9) / Signal: ${fmt(ind.macd, 4)} / ${fmt(ind.signal, 4)}`);
    lines.push("");
    return lines.join("\n");
}

// 🆕 УЛУЧШЕННАЯ ФУНКЦИЯ: Принудительное исправление форматирования
function fixFinalOutputFormatting(text) {
    if (!text) return text;

    let fixed = text;

    // Сначала убираем все \n которые могли появиться как текст
    fixed = fixed.replace(/\\n/g, '\n');

    // Вариант 1: С HTML тегами
    // "Финальный вывод:</b><b>Рекомендация:" -> "Финальный вывод:</b>\n<b>Рекомендация:"
    fixed = fixed.replace(
        /(<b>[🎯\s]*Финальный вывод:\s*<\/b>)\s*(<b>Рекомендация:\s*<\/b>)/gi,
        '$1\n$2'
    );

    // "Рекомендация:</b> Держать<b>Обоснование:" -> "Рекомендация:</b> Держать\n<b>Обоснование:"
    fixed = fixed.replace(
        /(<b>Рекомендация:\s*<\/b>\s*[^<\n]+?)(<b>Обоснование:\s*<\/b>)/gi,
        '$1\n$2'
    );

    // Вариант 2: Без закрывающего тега (неправильный HTML)
    // "Финальный вывод:<b>Рекомендация:" -> "Финальный вывод:\n<b>Рекомендация:"
    fixed = fixed.replace(
        /([🎯\s]*Финальный вывод:)(<b>Рекомендация:)/gi,
        '$1\n$2'
    );

    // "Рекомендация: Держать<b>Обоснование:" -> "Рекомендация: Держать\n<b>Обоснование:"
    fixed = fixed.replace(
        /(Рекомендация:\s*[А-Яа-яA-Za-z]+)(<b>Обоснование:)/gi,
        '$1\n$2'
    );

    // Вариант 3: Совсем без тегов
    // "Финальный вывод:Рекомендация:" -> "Финальный вывод:\nРекомендация:"
    fixed = fixed.replace(
        /([🎯\s]*Финальный вывод:)(Рекомендация:)/gi,
        '$1\n$2'
    );

    // "Рекомендация: ДержатьОбоснование:" -> "Рекомендация: Держать\nОбоснование:"
    fixed = fixed.replace(
        /(Рекомендация:\s*[А-Яа-яA-Za-z]+)(Обоснование:)/gi,
        '$1\n$2'
    );

    // Специальный случай: если между ключевыми словами нет пробела вообще
    // "вывод:Рекомендация:" -> "вывод:\nРекомендация:"
    fixed = fixed.replace(
        /(вывод:)(Рекомендация:)/gi,
        '$1\n$2'
    );

    return fixed;
}

/* ==================== Circuit Breaker ==================== */
let cooldownUntil = 0;
const inCooldown = () => Date.now() < cooldownUntil;
const startCooldown = (min = 10) => (cooldownUntil = Date.now() + min * 60 * 1000);

/* ==================== API ==================== */
async function askOpenAIForCurrency(cryptoName, priceUsd, marketCapUsd, volume24hUsd, attempt = 1, maxAttempts = 3) {
    const symbol = mapCryptoToBinanceSymbol(cryptoName);

    console.log(`[AI] [${symbol}] fetching indicators...`);
    const t0 = Date.now();
    let ind;
    try {
        ind = await getIndicators(symbol, "1h", agent);
    } catch (e) {
        console.error(`[AI] [${symbol}] indicators error:`, e.message);
        if (attempt < maxAttempts) {
            await timers.setTimeout(1500);
            return askOpenAIForCurrency(cryptoName, priceUsd, marketCapUsd, volume24hUsd, attempt + 1, maxAttempts);
        }
        return `❌ Ошибка индикаторов для ${cryptoName}.`;
    }
    console.log(
        `[AI] [${symbol}] indicators OK in ${Date.now() - t0}ms: { rsi: ${ind.rsi}, ema20: ${ind.ema20}, sma50: ${ind.sma50}, macd: ${ind.macd}, signal: ${ind.signal}, lastCandle: ${ind.lastCandleTime} }`
    );

    const techBlock = buildTechBlock(cryptoName, priceUsd, marketCapUsd, volume24hUsd, ind);

    if (inCooldown()) {
        return `${techBlock}\n<b>🎯 Финальный вывод:</b>\n<b>Рекомендация:</b> Держать\n<b>Обоснование:</b> Сервис LLM временно недоступен. Вывод на основе локальных индикаторов.`;
    }

    const guidance = `
Ты — профессиональный криптотрейдер. Ниже ГОТОВЫЕ числа (их менять нельзя — НЕЛЬЗЯ добавлять новые значения):
${techBlock}

КРИТИЧЕСКИ ВАЖНО: Сформируй финальный блок СТРОГО в таком формате:

<b>🎯 Финальный вывод:</b>
<b>Рекомендация:</b> Покупать / Продавать / Держать
<b>Обоснование:</b> 1—2 предложения, конкретно, без "возможно/примерно".

ОБЯЗАТЕЛЬНО делай перенос строки после КАЖДОГО пункта! НЕ пиши всё в одну строку!`;

    try {
        console.log(`[DeepSeek] [${symbol}] request start...`);
        const started = Date.now();
        const resp = await withHardTimeout(
            deepSeekClient.post("/chat/completions", {
                model: "deepseek-chat",
                temperature: 0.2,
                top_p: 1.0,
                stream: false,
                messages: [
                    {
                        role: "system",
                        content:
                            "Ты профессиональный криптоаналитик. Строго следуй предоставленным числам; не добавляй и не изменяй значения индикаторов и цен. Ответ только в HTML (<b>, <i>, <u>, <s>, <code>), без markdown. КРИТИЧЕСКИ ВАЖНО: ОБЯЗАТЕЛЬНО делай перенос строки (\\n) после каждого пункта блока. НЕ пиши всё в одну строку!",
                    },
                    { role: "user", content: guidance },
                ],
            }),
            20000,
            "deepseek/askOpenAIForCurrency"
        );

        const ms = Date.now() - started;
        console.log(`[DeepSeek] [${symbol}] response status=${resp.status} in ${ms}ms`);

        if (!(resp.status >= 200 && resp.status < 300)) {
            console.error(`[DeepSeek] [${symbol}] HTTP ${resp.status}`, resp.data);
            if ([429, 451, 403, 500, 502, 503].includes(resp.status)) startCooldown(10);
            return `${techBlock}\n<b>🎯 Финальный вывод:</b>\n<b>Рекомендация:</b> Держать\n<b>Обоснование:</b> LLM недоступен, вывод по локальным индикаторам.`;
        }

        let conclusion = (resp.data?.choices?.[0]?.message?.content || "").trim();

        // 🔧 ЛОГИРУЕМ ДО исправления
        console.log(`[DeepSeek] [${symbol}] RAW conclusion:`, conclusion.substring(0, 200));

        // 🆕 ПРИМЕНЯЕМ ПОСТ-ОБРАБОТКУ для исправления форматирования
        conclusion = fixFinalOutputFormatting(conclusion);

        // 🔧 ЛОГИРУЕМ ПОСЛЕ исправления
        console.log(`[DeepSeek] [${symbol}] FIXED conclusion:`, conclusion.substring(0, 200));

        console.log(`[DeepSeek] [${symbol}] ok, conclusion len=${conclusion.length}`);
        return `${techBlock}\n${conclusion}`;
    } catch (error) {
        console.error(
            `[DeepSeek] Ошибка при прогнозе для ${cryptoName} (попытка ${attempt}/${maxAttempts}):`,
            error.message
        );
        if (attempt < maxAttempts) {
            await timers.setTimeout(2000);
            return askOpenAIForCurrency(cryptoName, priceUsd, marketCapUsd, volume24hUsd, attempt + 1, maxAttempts);
        }
        startCooldown(10);
        return `${techBlock}\n<b>🎯 Финальный вывод:</b>\n<b>Рекомендация:</b> Держать\n<b>Обоснование:</b> LLM недоступен, вывод по локальным индикаторам.`;
    }
}

async function askOpenAIForRecommendation(cryptoName, priceUsd, percentChange, attempt = 1, maxAttempts = 3) {
    const symbol = mapCryptoToBinanceSymbol(cryptoName);

    let ind = {};
    try {
        ind = await getIndicators(symbol, "1h", agent);
    } catch (_) {}

    const context = `
<b>${cryptoName}</b>
Текущая цена: $${Number(priceUsd ?? ind.close ?? 0).toLocaleString("en-US")}
Изменение за час: ${Number(percentChange || 0).toFixed(2)}%
RSI(14): ${fmt(ind.rsi, 2)}
EMA(20): $${fmt(ind.ema20, 2)}
SMA(50): $${fmt(ind.sma50, 2)}
MACD/Signal: ${fmt(ind.macd, 4)} / ${fmt(ind.signal, 4)}
`;

    const prompt = `
На основе данных (НЕ меняй числа, не добавляй новые):
${context}

ВАЖНО: Выдай блок СТРОГО с переносами строк:

<b>🎯 Рекомендация:</b> Покупать / Держать / Продавать

<b>Обоснование:</b> 1—2 предложения, без воды и вероятностных формулировок.`;

    try {
        const resp = await withHardTimeout(
            deepSeekClient.post("/chat/completions", {
                model: "deepseek-chat",
                temperature: 0.2,
                top_p: 1.0,
                stream: false,
                messages: [
                    { role: "system", content: "Ответ в чистом HTML (<b>, <i>), не выдумывай числа. Обязательно используй переносы строк (\\n) между заголовками." },
                    { role: "user", content: prompt },
                ],
            }),
            20000,
            "deepseek/askOpenAIForRecommendation"
        );

        if (!(resp.status >= 200 && resp.status < 300)) {
            if ([429, 451, 403, 500, 502, 503].includes(resp.status)) startCooldown(10);
            return `<b>🎯 Рекомендация:</b> Держать\n<b>Обоснование:</b> LLM недоступен, локальные индикаторы нейтральны/слабые.`;
        }

        let result = (resp.data?.choices?.[0]?.message?.content || "").trim();

        // 🆕 ПРИМЕНЯЕМ ПОСТ-ОБРАБОТКУ
        result = fixFinalOutputFormatting(result);

        return result;
    } catch (error) {
        console.error(`[DeepSeek] Ошибка в askOpenAIForRecommendation для ${cryptoName}:`, error.message);
        if (attempt < maxAttempts) {
            await timers.setTimeout(2000);
            return askOpenAIForRecommendation(cryptoName, priceUsd, percentChange, attempt + 1, maxAttempts);
        }
        startCooldown(10);
        return `<b>🎯 Рекомендация:</b> Держать\n<b>Обоснование:</b> LLM недоступен, локальные индикаторы без явного сигнала.`;
    }
}

async function askOpenAIForBreakingNewsBatch(cryptoNames, pastSummaries = [], attempt = 1, maxAttempts = 3) {
    try {
        const listString = cryptoNames.map((name, i) => `${i + 1}. ${name}`).join("\n");
        const pastBlock = pastSummaries.length
            ? `<b>Известные события:</b>\n${pastSummaries.map((s) => `- ${s}`).join("\n")}\n\n📌 Не дублируй события.`
            : "";

        const prompt = `Ты опытный криптоаналитик. Проверь <b>срочные</b> новости за <b>последний час</b> по:
${listString}

${pastBlock}

Если НЕТ новостей — верни РОВНО: NO_NEWS
Иначе формат:
🪙 <b>{crypto}</b>
<b>📢 Суть:</b> ...
<b>🎯 Рекомендация:</b> ...`;

        console.log(`[DeepSeek] breaking-news request start...`);
        const started = Date.now();
        const resp = await withHardTimeout(
            deepSeekClient.post("/chat/completions", {
                model: "deepseek-chat",
                temperature: 0.2,
                top_p: 1.0,
                stream: false,
                messages: [
                    { role: "system", content: "Если нет новостей — верни ровно 'NO_NEWS'. Формат HTML, не выдумывай." },
                    { role: "user", content: prompt },
                ],
            }),
            20000,
            "deepseek/askOpenAIForBreakingNewsBatch"
        );

        console.log(`[DeepSeek] breaking-news response status=${resp.status} in ${Date.now() - started}ms`);
        const text = (resp.data?.choices?.[0]?.message?.content || "").trim();
        console.log(`[DeepSeek] breaking-news len=${text ? text.length : 0}`);
        return text || "NO_NEWS";
    } catch (error) {
        console.error("[DeepSeek] Ошибка в askOpenAIForBreakingNewsBatch:", error.message);
        if (attempt < maxAttempts) {
            await timers.setTimeout(2000);
            return askOpenAIForBreakingNewsBatch(cryptoNames, pastSummaries, attempt + 1, maxAttempts);
        }
        return "NO_NEWS";
    }
}

async function askOpenAIForDailyForecastBatch(cryptoNames = []) {
    if (!Array.isArray(cryptoNames) || cryptoNames.length === 0) return "";

    console.log(`[DailyForecast] start for: ${cryptoNames.join(", ")}`);

    let fullInfo = {};
    try {
        const ids = cryptoNames.map((n) => {
            const s = n.toLowerCase();
            if (s.includes("bitcoin")) return "bitcoin";
            if (s.includes("ethereum")) return "ethereum";
            if (s.includes("litecoin")) return "litecoin";
            if (s.includes("dogecoin")) return "dogecoin";
            if (s.includes("solana")) return "solana";
            if (s.includes("ripple") || s.includes("xrp")) return "ripple";
            return "bitcoin";
        });
        fullInfo = await getCryptoFullInfo(ids);
    } catch (e) {
        console.error("[DailyForecast] CoinGecko error:", e.message);
    }

    const chunks = [];
    for (const name of cryptoNames) {
        const low = name.toLowerCase();
        const id = low.includes("bitcoin")
            ? "bitcoin"
            : low.includes("ethereum")
                ? "ethereum"
                : low.includes("litecoin")
                    ? "litecoin"
                    : low.includes("dogecoin")
                        ? "dogecoin"
                        : low.includes("solana")
                            ? "solana"
                            : low.includes("ripple") || low.includes("xrp")
                                ? "ripple"
                                : "bitcoin";

        const priceUsd = fullInfo[id]?.usd ?? null;
        const marketCapUsd = fullInfo[id]?.usd_market_cap ?? null;
        const volume24hUsd = fullInfo[id]?.usd_24h_vol ?? null;

        console.log(`[DailyForecast] -> ${name} askOpenAIForCurrency() ...`);
        const one = await askOpenAIForCurrency(name, priceUsd, marketCapUsd, volume24hUsd);
        console.log(`[DailyForecast] <- ${name} len=${one ? one.length : 0}`);

        chunks.push(one);

        await timers.setTimeout(600);
    }

    const sep = "\n\n——————————————\n\n";
    const result = chunks.filter(Boolean).join(sep);

    console.log(`[DailyForecast] done, total len=${result.length}`);
    return result;
}

module.exports = {
    askOpenAIForCurrency,
    askOpenAIForRecommendation,
    askOpenAIForBreakingNewsBatch,
    askOpenAIForDailyForecastBatch,
};