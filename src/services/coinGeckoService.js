const axios = require("axios");

const COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price";

const getCryptoPrices = async () => {
    try {
        const ids = ["bitcoin", "ethereum", "litecoin", "dogecoin", "solana"];
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`;

        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error("Ошибка запроса к CoinGecko:", error.message);
        return {};
    }
};

async function getCryptoFullInfo(cryptoIds) {
    const ids = cryptoIds.join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`;

    const response = await axios.get(url);
    return response.data;
}

module.exports = {
    getCryptoPrices,
    getCryptoFullInfo
};
