// src/utils/telegramNotifier.js
require("dotenv").config();
const axios = require("axios");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

/**
 * Отправить сообщение пользователю через Telegram API
 * @param {string} chatId - ID пользователя в Telegram
 * @param {string} message - Текст сообщения (HTML)
 * @returns {Promise<boolean>} - true если отправлено, false если ошибка
 */
async function sendMessage(chatId, message) {
    try {
        const response = await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: "HTML",
        });

        if (response.data.ok) {
            console.log(`[TELEGRAM] ✅ Сообщение отправлено пользователю ${chatId}`);
            return true;
        } else {
            console.error(`[TELEGRAM] ❌ Ошибка отправки ${chatId}:`, response.data);
            return false;
        }
    } catch (error) {
        console.error(`[TELEGRAM] ❌ Ошибка отправки ${chatId}:`, error.message);
        return false;
    }
}

/**
 * Уведомление о продлении подписки
 * @param {string} chatId - ID пользователя в Telegram
 * @param {Date} expiresAt - Дата окончания подписки
 */
async function notifySubscriptionExtended(chatId, expiresAt) {
    const expiresDate = new Date(expiresAt).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });

    const message =
        `🎉 <b>Подписка продлена на 30 дней!</b>\n\n` +
        `📅 Активна до <b>${expiresDate}</b>\n\n` +
        `Продолжайте получать:\n` +
        `📈 AI-прогнозы ежедневно в 10:00\n` +
        `🗞 Важные новости\n` +
        `🔔 Уведомления о ценах\n\n` +
        `Спасибо, что с нами! 💙`;

    return await sendMessage(chatId, message);
}

/**
 * Уведомление об активации подписки
 * @param {string} chatId - ID пользователя в Telegram
 * @param {Date} expiresAt - Дата окончания подписки
 */
async function notifySubscriptionActivated(chatId, expiresAt) {
    const expiresDate = new Date(expiresAt).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });

    const message =
        `🎉 <b>Подписка активирована!</b>\n\n` +
        `Выдано <b>30 дней</b> подписки\n` +
        `📅 Активна до <b>${expiresDate}</b>\n\n` +
        `Вы будете получать:\n` +
        `📈 AI-прогнозы ежедневно в 10:00\n` +
        `🗞 Важные новости\n` +
        `🔔 Уведомления о ценах\n\n` +
        `Приятного использования! 💙`;

    return await sendMessage(chatId, message);
}

module.exports = {
    sendMessage,
    notifySubscriptionExtended,
    notifySubscriptionActivated,
};