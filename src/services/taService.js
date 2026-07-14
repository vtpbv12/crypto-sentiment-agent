// src/services/taService.js
const axios = require("axios");
const { RSI, SMA, EMA, MACD } = require("technicalindicators");

const DEBUG_AI = String(process.env.DEBUG_AI || "0") === "1";
const log = (...args) => DEBUG_AI && console.log(...args);

// Binance klines docs: interval e.g. 1h, 4h, 1d
// symbol e.g. BTCUSDT
async function fetchOHLCVBinance(symbol = "BTCUSDT", interval = "1h", limit = 200, agent) {
    const url = "https://api.binance.com/api/v3/klines";
    const t0 = Date.now();
    log(`[TA] [${symbol}] fetching klines interval=${interval} limit=${limit} ...`);

    const res = await axios.get(url, {
        params: { symbol, interval, limit },
        httpAgent: agent,
        httpsAgent: agent,
        timeout: 15000,
    });

    const t1 = Date.now();
    log(`[TA] [${symbol}] klines status=${res.status} in ${t1 - t0}ms, items=${Array.isArray(res.data) ? res.data.length : 0}`);

    // res.data: [ [openTime, open, high, low, close, volume, closeTime, ...], ... ]
    return res.data.map(k => ({
        openTime: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        closeTime: k[6],
    }));
}

function computeIndicators(candles) {
    if (!candles || candles.length === 0) {
        throw new Error("No candles to compute indicators");
    }

    const closes = candles.map(c => c.close);

    // RSI 14 Wilder
    const rsiSeries = RSI.calculate({ values: closes, period: 14 });
    const rsi = rsiSeries[rsiSeries.length - 1];

    // SMA 50
    const smaSeries = SMA.calculate({ values: closes, period: 50 });
    const sma50 = smaSeries[smaSeries.length - 1];

    // EMA 20
    const emaSeries = EMA.calculate({ values: closes, period: 20 });
    const ema20 = emaSeries[emaSeries.length - 1];

    // MACD 12/26/9 (classic)
    const macdSeries = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
    });
    const macdPoint = macdSeries[macdSeries.length - 1] || {};
    const macd = macdPoint.MACD;
    const signal = macdPoint.signal;
    const histogram = macdPoint.histogram;

    const last = candles[candles.length - 1];

    const out = {
        close: last.close,
        rsi: rsi != null ? Number(rsi.toFixed(2)) : null,
        sma50: sma50 != null ? Number(sma50.toFixed(2)) : null,
        ema20: ema20 != null ? Number(ema20.toFixed(2)) : null,
        macd: macd != null ? Number(macd.toFixed(4)) : null,
        signal: signal != null ? Number(signal.toFixed(4)) : null,
        histogram: histogram != null ? Number(histogram.toFixed(4)) : null,
        lastCandleTime: new Date(last.closeTime).toISOString(),
    };

    log(`[TA] indicators computed:`, out);
    return out;
}

// Простая кэш-обёртка (в памяти процесса)
const cache = new Map(); // key => { ts, data }
const TTL_MS = 60 * 1000;

async function getIndicators(symbol = "BTCUSDT", interval = "1h", agent) {
    const key = `${symbol}:${interval}`;
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && now - cached.ts < TTL_MS) {
        log(`[TA] [${symbol}] cache hit`);
        return cached.data;
    }

    log(`[TA] [${symbol}] cache miss -> fetch+compute`);
    const candles = await fetchOHLCVBinance(symbol, interval, 200, agent);
    const data = computeIndicators(candles);
    cache.set(key, { ts: now, data });
    return data;
}

module.exports = {
    getIndicators,
    fetchOHLCVBinance,
    computeIndicators,
};
