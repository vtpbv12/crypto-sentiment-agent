const knex = require("../config/database");

async function unsubscribeUser(telegramId) {
    return knex("users").where({ telegram_id: telegramId }).update({ is_subscribed: false });
}

module.exports = {
    unsubscribeUser
}
