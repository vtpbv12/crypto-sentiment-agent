const knex = require("../../config/database");

const getLastPrice = async (cryptoName) => {
    try {
        return await knex("crypto_prices")
            .where({ crypto_name: cryptoName })
            .orderBy("timestamp", "desc")
            .first();
    } catch (e) {
        console.error("[DB] Ошибка в getLastPrice:", e.message);
        return null;
    }
};

const upsertPrice = async (cryptoName, priceUsd) => {
    try {
        await knex("crypto_prices").insert({
            crypto_name: cryptoName,
            price_usd: priceUsd,
        });
    } catch (e) {
        console.error("[DB] Ошибка в upsertPrice:", e.message);
    }
};

module.exports = {
    getLastPrice,
    upsertPrice,
};
