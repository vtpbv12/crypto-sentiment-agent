require("dotenv").config({path: "../../../.env"});
const axios = require("axios");

const CRYPTOPANIC_API_TOKEN = process.env.CRYPTOPANIC_API_TOKEN;

console.log(CRYPTOPANIC_API_TOKEN, "CRYPTOPANIC_API_TOKEN");

// Получить общие важные новости с метаданными
async function getImportantNews() {
    const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${CRYPTOPANIC_API_TOKEN}&public=true&filter=important`;
    const response = await axios.get(url);
    return response.data.results || [];
}

// Получить важные новости по валюте (без метаданных для быстрого запроса)
async function getLatestNewsByCurrency(currencySymbol) {
    const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${CRYPTOPANIC_API_TOKEN}&currencies=${currencySymbol}&public=true&filter=important`;
    const response = await axios.get(url);
    return response.data.results || [];
}

module.exports = {
    getImportantNews,
    getLatestNewsByCurrency,
};
