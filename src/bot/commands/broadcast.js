// src/bot/commands/broadcast.js
const knex = require("../../config/database");
const { setTimeout } = require("timers/promises");

// 👇 УЗНАЙ СВОЙ ID ЧЕРЕЗ @userinfobot И ВСТАВЬ СЮДА
const ADMIN_IDS = [
    "322868290", // замени на свой реальный ID
];

// Храним состояние ожидания сообщения для рассылки
const waitingForBroadcast = new Set();

module.exports = (bot) => {

    // ========== КОМАНДА /cancel (ВЫНЕСЕНА НА ВЕРХНИЙ УРОВЕНЬ) ==========
    bot.onText(/\/cancel/, (msg) => {
        const chatId = msg.chat.id;
        if (waitingForBroadcast.has(chatId)) {
            waitingForBroadcast.delete(chatId);
            waitingForBroadcast.delete(`${chatId}_active_only`);
            bot.sendMessage(chatId, "❌ Рассылка отменена.");
        } else {
            bot.sendMessage(chatId, "ℹ️ Нет активной рассылки для отмены.");
        }
    });

    // ========== КОМАНДА /broadcast ==========
    bot.onText(/\/broadcast$/, async (msg) => {
        const chatId = msg.chat.id;
        const adminId = String(chatId);

        if (!ADMIN_IDS.includes(adminId)) {
            return bot.sendMessage(chatId, "❌ У вас нет прав.");
        }

        waitingForBroadcast.add(chatId);

        await bot.sendMessage(
            chatId,
            `📢 <b>Режим рассылки активирован</b>\n\n` +
            `Отправь мне сообщение для рассылки.\n\n` +
            `⚠️ ВНИМАНИЕ: Сообщение получат <b>ВСЕ пользователи бота</b> (включая неактивных)!\n\n` +
            `💡 Можно использовать:\n` +
            `• <b>жирный</b>\n` +
            `• <i>курсив</i>\n` +
            `• <code>код</code>\n` +
            `• картинки, видео, документы\n\n` +
            `Для отмены напиши /cancel`,
            { parse_mode: "HTML" }
        );
    });

    // ========== КОМАНДА /broadcast_active (только активным) ==========
    bot.onText(/\/broadcast_active$/, async (msg) => {
        const chatId = msg.chat.id;
        const adminId = String(chatId);

        if (!ADMIN_IDS.includes(adminId)) {
            return bot.sendMessage(chatId, "❌ У вас нет прав.");
        }

        // Статистика перед рассылкой
        const now = new Date();
        const active = await knex("users")
            .where("is_subscribed", true)
            .andWhere("subscription_expires_at", ">", now)
            .select("telegram_id", "username", "first_name");

        console.log("[BROADCAST_ACTIVE] Найдено активных юзеров:", active.length);

        if (active.length === 0) {
            return bot.sendMessage(chatId, "⚠️ Нет активных подписчиков для рассылки.");
        }

        waitingForBroadcast.add(chatId);
        // Помечаем что это рассылка только активным
        waitingForBroadcast.add(`${chatId}_active_only`);

        await bot.sendMessage(
            chatId,
            `📢 <b>Режим рассылки активирован</b>\n\n` +
            `Отправь мне сообщение, которое хочешь разослать.\n\n` +
            `👥 Получателей: <b>${active.length}</b> (только активные)\n\n` +
            `Список:\n${active.slice(0, 10).map(u => `• ${u.first_name || u.username || u.telegram_id}`).join('\n')}` +
            (active.length > 10 ? `\n...и ещё ${active.length - 10}` : '') + `\n\n` +
            `💡 Можно использовать:\n` +
            `• <b>жирный</b>\n` +
            `• <i>курсив</i>\n` +
            `• <code>код</code>\n` +
            `• картинки, видео, документы\n\n` +
            `Для отмены напиши /cancel`,
            { parse_mode: "HTML" }
        );
    });

    // ========== КОМАНДА /test_broadcast (отправка только себе) ==========
    bot.onText(/\/test_broadcast (.+)/s, async (msg, match) => {
        const chatId = msg.chat.id;
        const adminId = String(chatId);

        if (!ADMIN_IDS.includes(adminId)) {
            return bot.sendMessage(chatId, "❌ У вас нет прав.");
        }

        const text = match[1];

        try {
            await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
            await bot.sendMessage(chatId, "✅ Тестовое сообщение отправлено!");
        } catch (err) {
            await bot.sendMessage(chatId, `❌ Ошибка: ${err.message}`);
        }
    });

    // ========== СТАТИСТИКА ==========
    bot.onText(/\/stats/, async (msg) => {
        const chatId = msg.chat.id;
        const adminId = String(chatId);

        if (!ADMIN_IDS.includes(adminId)) return;

        try {
            const now = new Date();
            const total = await knex("users").count("* as count");
            const active = await knex("users")
                .where("subscription_expires_at", ">", now)
                .andWhere("is_subscribed", true)
                .count("* as count");

            const totalCount = parseInt(total[0].count);
            const activeCount = parseInt(active[0].count);

            await bot.sendMessage(
                chatId,
                `📊 <b>Статистика</b>\n\n` +
                `👥 Всего: ${totalCount}\n` +
                `✅ Активных: ${activeCount}\n` +
                `❌ Неактивных: ${totalCount - activeCount}`,
                { parse_mode: "HTML" }
            );
        } catch (error) {
            console.error("[STATS ERROR]", error.message);
        }
    });

    // ========== ЛОВИМ СООБЩЕНИЕ ДЛЯ РАССЫЛКИ ==========
    bot.on("message", async (msg) => {
        const chatId = msg.chat.id;

        // Если это НЕ админ в режиме рассылки - игнорим
        if (!waitingForBroadcast.has(chatId)) return;

        // Если это команда - игнорим (команды обрабатываются выше)
        if (msg.text && msg.text.startsWith('/')) return;

        const isActiveOnly = waitingForBroadcast.has(`${chatId}_active_only`);

        waitingForBroadcast.delete(chatId);
        waitingForBroadcast.delete(`${chatId}_active_only`);

        // Подтверждение
        const reply = await bot.sendMessage(
            chatId,
            `⚠️ Отправить это сообщение ${isActiveOnly ? 'АКТИВНЫМ подписчикам' : 'ВСЕМ пользователям бота'}?`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ Да, отправить", callback_data: `broadcast_confirm_${msg.message_id}_${isActiveOnly}` },
                            { text: "❌ Отмена", callback_data: "broadcast_cancel" }
                        ]
                    ]
                }
            }
        );

        // Сохраняем ID сообщения для копирования
        bot.once('callback_query', async (query) => {
            if (query.message.message_id !== reply.message_id) return;

            await bot.answerCallbackQuery(query.id);

            if (query.data === "broadcast_cancel") {
                return bot.editMessageText(
                    "❌ Рассылка отменена.",
                    { chat_id: chatId, message_id: reply.message_id }
                );
            }

            if (query.data.startsWith("broadcast_confirm_")) {
                await bot.editMessageText(
                    "📤 Начинаю рассылку...",
                    { chat_id: chatId, message_id: reply.message_id }
                );

                await doBroadcast(bot, chatId, msg, isActiveOnly);
            }
        });
    });
};

// ========== ФУНКЦИЯ РАССЫЛКИ ==========
async function doBroadcast(bot, adminChatId, message, activeOnly = false) {
    try {
        let users;

        if (activeOnly) {
            // Только активные подписчики
            const now = new Date();
            users = await knex("users")
                .where("is_subscribed", true)
                .andWhere("subscription_expires_at", ">", now)
                .select("telegram_id", "username");

            console.log(`[BROADCAST] Рассылка только активным: ${users.length} юзеров`);
        } else {
            // ВСЕ пользователи бота
            users = await knex("users")
                .select("telegram_id", "username");

            console.log(`[BROADCAST] Рассылка ВСЕМ: ${users.length} юзеров`);
        }

        if (!users.length) {
            return bot.sendMessage(adminChatId, "⚠️ Нет пользователей для рассылки.");
        }

        let sent = 0;
        let failed = 0;
        const failedUsers = [];

        for (const user of users) {
            try {
                console.log(`[BROADCAST] Отправка ${user.telegram_id} (@${user.username})...`);

                // Копируем сообщение (с текстом, картинками, видео и т.д.)
                await bot.copyMessage(
                    user.telegram_id,
                    message.chat.id,
                    message.message_id
                );

                sent++;
                console.log(`[BROADCAST] ✅ Отправлено ${user.telegram_id}`);

                await setTimeout(100); // задержка 100ms для надёжности

            } catch (err) {
                failed++;
                console.error(`[BROADCAST] ❌ Ошибка для ${user.telegram_id}:`, err.message);

                failedUsers.push({
                    id: user.telegram_id,
                    username: user.username,
                    error: err.message
                });

                // Если юзер заблокировал/удалил бота - помечаем его как неактивного
                if (err.message.includes('chat not found') ||
                    err.message.includes('bot was blocked') ||
                    err.message.includes('user is deactivated') ||
                    err.message.includes('Forbidden')) {

                    console.log(`[BROADCAST] 🚫 Отключаю подписку для ${user.telegram_id}`);

                    // Отключаем подписку
                    await knex("users")
                        .where({ telegram_id: user.telegram_id })
                        .update({
                            is_subscribed: false,
                            subscription_expires_at: null,
                            updated_at: new Date()
                        })
                        .catch((e) => console.error("Ошибка обновления БД:", e));
                }
            }
        }

        console.log(`[BROADCAST] Завершено. Успешно: ${sent}, Ошибок: ${failed}`);

        let report = `✅ <b>Рассылка завершена!</b>\n\n` +
                     `📤 Отправлено: ${sent}\n` +
                     `❌ Ошибок: ${failed}`;

        if (failedUsers.length > 0) {
            report += `\n\n<b>Не дошло:</b>\n`;
            failedUsers.slice(0, 10).forEach(u => {
                const name = u.username ? `@${u.username}` : u.id;
                report += `• ${name}: ${u.error.substring(0, 50)}\n`;
            });
            if (failedUsers.length > 10) {
                report += `\n...и ещё ${failedUsers.length - 10} ошибок`;
            }
        }

        await bot.sendMessage(adminChatId, report, { parse_mode: "HTML" });

    } catch (error) {
        console.error("[BROADCAST ERROR]", error);
        await bot.sendMessage(
            adminChatId,
            `❌ Критическая ошибка: ${error.message}`
        );
    }
}