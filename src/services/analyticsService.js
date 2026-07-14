const { getCryptoPrices } = require("./coinGeckoService");

const buildAnalyticsReport = async () => {
    const prices = await getCryptoPrices();

    if (!prices || Object.keys(prices).length === 0) {
        return "Не удалось получить данные о ценах.";
    }

    let report = "📈 Аналитика по криптовалютам:\n\n";

    for (const [crypto, data] of Object.entries(prices)) {
        const usdPrice = data.usd;
        report += `🔹 ${capitalize(crypto)}: $${usdPrice}\n`;
    }

    return report;
};

const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1);

const buildAnalyticsForCrypto = async (cryptoName, newPrice, percentChange, aiAnalysis) => {
    return `
💰 ${cryptoName.toUpperCase()}
Текущая цена: $${newPrice}
Изменение: ${percentChange > 0 ? "📈" : "📉"} ${percentChange.toFixed(2)}%

${aiAnalysis}
`;
};

module.exports = {
    buildAnalyticsReport,
    buildAnalyticsForCrypto
};
