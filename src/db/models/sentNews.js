const knex = require("../../config/database");

const isNewsSent = async (newsId) => {
    try {
        const record = await knex("sent_news").where({ news_id: newsId }).first();
        return !!record;
    } catch (e) {
        console.error("[DB] Ошибка в isNewsSent:", e.message);
        return false;
    }
};

const markNewsAsSent = async (newsId) => {
    try {
        await knex("sent_news").insert({
            news_id: newsId,
            created_at: new Date(),
        });
    } catch (e) {
        console.error("[DB] Ошибка в markNewsAsSent:", e.message);
    }
};

const deleteOldNews = async (days = 1) => {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    try {
        await knex("sent_news")
            .where("created_at", "<", cutoff)
            .del();
    } catch (e) {
        console.error("[DB] Ошибка в deleteOldNews:", e.message);
    }
};

module.exports = {
    isNewsSent,
    markNewsAsSent,
    deleteOldNews
};
