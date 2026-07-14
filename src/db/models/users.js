const knex = require("../../config/database");

const findByTelegramId = async (telegramId) => {
    try {
        return await knex("users").where({ telegram_id: telegramId }).first();
    } catch (e) {
        console.error("[DB] Ошибка в findByTelegramId:", e.message);
        return null;
    }
};

const createUser = async (telegramId) => {
    try {
        return await knex("users").insert({ telegram_id: telegramId });
    } catch (e) {
        if (e.code !== "23505") { // уникальное ограничение
            console.error("[DB] Ошибка в createUser:", e.message);
        }
    }
};

const upsertUser = async ({ telegram_id, first_name, last_name, username }) => {
    try {
        return await knex("users")
            .insert({
                telegram_id,
                first_name,
                last_name,
                username,
                is_subscribed: true,
                created_at: new Date(),
                updated_at: new Date(),
            })
            .onConflict("telegram_id")
            .merge({
                is_subscribed: true,
                first_name,
                last_name,
                username,
                updated_at: new Date(),
            });
    } catch (e) {
        console.error("[DB] Ошибка в upsertUser:", e.message);
    }
};

const subscribeUser = async (telegramId) => {
    try {
        await knex("users")
            .where({ telegram_id: telegramId })
            .update({ is_subscribed: true, updated_at: new Date() });
    } catch (e) {
        console.error("[DB] Ошибка в subscribeUser:", e.message);
    }
};

const unsubscribeUser = async (telegramId) => {
    try {
        await knex("users")
            .where({ telegram_id: telegramId })
            .update({ is_subscribed: false, updated_at: new Date() });
    } catch (e) {
        console.error("[DB] Ошибка в unsubscribeUser:", e.message);
    }
};

const getSubscribedUsers = async () => {
    try {
        const now = new Date();
        return await knex("users")
            .where("is_subscribed", true)
            .andWhere("subscription_expires_at", ">", now);
    } catch (e) {
        console.error("[DB] Ошибка в getSubscribedUsers:", e.message);
        return [];
    }
};

module.exports = {
    findByTelegramId,
    createUser,
    upsertUser,
    subscribeUser,
    unsubscribeUser,
    getSubscribedUsers,
};
