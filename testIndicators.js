// testIndicators.js
require("dotenv").config();
const { HttpsProxyAgent } = require("https-proxy-agent");
const { getIndicators } = require("./src/services/taService");

const USE_PROXY_FOR_MARKET = String(process.env.USE_PROXY_FOR_MARKET || "false").toLowerCase() === "true";
const PROXY_URL = process.env.PROXY_URL || "";
const agent = USE_PROXY_FOR_MARKET && PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : undefined;

function mapToBinanceSymbol(x) {
    const n = String(x).toLowerCase();
    if (n.includes("bitcoin") || n === "btc" || n === "btcusdt") return "BTCUSDT";
    if (n.includes("ethereum") || n === "eth" || n === "ethusdt") return "ETHUSDT";
    if (n.includes("litecoin") || n === "ltc" || n === "ltcusdt") return "LTCUSDT";
    if (n.includes("dogecoin") || n === "doge" || n === "dogeusdt") return "DOGEUSDT";
    if (n.includes("solana") || n === "sol" || n === "solusdt") return "SOLUSDT";
    if (n.includes("ripple") || n === "xrp" || n === "xrpusdt") return "XRPUSDT";
    return x.toUpperCase();
}

async function run() {
    const args = process.argv.slice(2);
    const targets = args.length
        ? args
        : ["bitcoin", "ethereum", "litecoin", "dogecoin", "solana", "ripple"];

    console.log("USE_PROXY_FOR_MARKET:", USE_PROXY_FOR_MARKET, "| PROXY_URL:", PROXY_URL ? "[set]" : "[not set]");
    console.log("Testing symbols:", targets, "\n");

    for (const t of targets) {
        const symbol = mapToBinanceSymbol(t);
        console.log(`--- Fetching indicators for ${symbol} ---`);
        try {
            const ind = await getIndicators(symbol, "1h", agent);
            console.table({
                Symbol: symbol,
                Close: ind.close,
                RSI_14: ind.rsi,
                SMA_50: ind.sma50,
                EMA_20: ind.ema20,
                MACD: ind.macd,
                Signal: ind.signal,
                Histogram: ind.histogram,
                LastCandleTime: new Date(ind.lastCandleTime).toISOString(),
            });
        } catch (err) {
            console.error(`ERROR for ${symbol}:`, err.message);
            if (err.response) {
                console.error("Response status:", err.response.status);
                console.error("Response data:", err.response.data);
            }
            if (err.code) {
                console.error("Error code:", err.code);
            }
        }
        console.log();
    }
}

run().catch(e => {
    console.error("Fatal:", e);
    process.exit(1);
});
