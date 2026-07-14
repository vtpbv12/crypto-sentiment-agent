// src/bot/commands/start.js
const knex = require("../../config/database");
const { setTimeout } = require("timers/promises");
const {
    getOrCreateTodayBreakingNews,
    getOrCreateTodayForecasts,
} = require("../../services/forecastService");

// ID канала для обязательной подписки
const REQUIRED_CHANNEL = "@cryptocheck_news";
const REQUIRED_CHANNEL_ID = "@cryptocheck_news"; // можно также использовать числовой ID, например -1001234567890

// ===== helpers =====
function isActiveSubscription(user) {
    if (!user) return false;
    if (!user.is_subscribed) return false;
    if (!user.subscription_expires_at) return false;
    return new Date(user.subscription_expires_at) > new Date();
}

function mainReplyKeyboard() {
    return {
        keyboard: [
            [{ text: "📅 Сегодняшние прогнозы" }],
            [{ text: "💳 Оформить подписку" }, { text: "🔥 Попробовать 7 дней" }],
            [{ text: "🔥 Гайд" }, { text: "💡 FAQ" }],
            [{ text: "🤖 О боте" }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
    };
}

// Проверка подписки на канал
async function checkChannelSubscription(bot, userId) {
    try {
        const member = await bot.getChatMember(REQUIRED_CHANNEL_ID, userId);
        // Статусы: creator, administrator, member - подписан
        // Статусы: left, kicked - не подписан
        return ["creator", "administrator", "member"].includes(member.status);
    } catch (error) {
        console.error("[CHECK_SUBSCRIPTION] Ошибка проверки подписки:", error.message);
        return false;
    }
}

module.exports = (bot) => {
    // системное меню Telegram (кнопка «Меню» возле поля ввода)
    bot.setMyCommands([
        { command: "start", description: "Запустить бота / главное меню" },
        { command: "menu", description: "Показать меню" },
        { command: "today", description: "Проверить сегодняшние прогнозы" },
        { command: "subscribe", description: "Оформить подписку" },
        { command: "trial", description: "Активировать пробный период (7 дн)" },
        { command: "guide", description: "Гайд по использованию" },
        { command: "faq", description: "Ответы на вопросы" },
        { command: "about", description: "О боте" },
    ]).catch(() => {});

    // ===== Команды-тексты из ReplyKeyboard =====
    bot.on("message", async (msg) => {
        if (!msg.text) return;
        const chatId = msg.chat.id;
        const text = (msg.text || "").trim();

        if (text === "📅 Сегодняшние прогнозы") {
            return handleTodayForecasts(bot, chatId, null);
        }
        if (text === "💳 Оформить подписку") {
            return bot.sendMessage(
                chatId,
                `💳 Чтобы оформить подписку, напишите:\n\n👉 <a href="https://t.me/cryptocheck_manager">@cryptocheck_manager</a>`,
                { parse_mode: "HTML", disable_web_page_preview: false, reply_markup: mainReplyKeyboard() }
            );
        }
        if (text === "🔥 Попробовать 7 дней") {
            return tryFreeTrial(bot, chatId);
        }
        if (text === "🔥 Гайд") {
            return showGuide(bot, chatId);
        }
        if (text === "💡 FAQ") {
            return showFaq(bot, chatId);
        }
        if (text === "🤖 О боте") {
            return showAbout(bot, chatId);
        }
    });

    // ===== /start и /menu =====
    bot.onText(/\/start|\/menu/, async (msg) => {
        const chatId = msg.chat.id;
        const { id: telegram_id, first_name, last_name, username } = msg.from || {};

        try {
            await knex("users")
                .insert({
                    telegram_id,
                    first_name,
                    last_name,
                    username,
                    is_subscribed: false,
                    created_at: new Date(),
                    updated_at: new Date(),
                })
                .onConflict("telegram_id")
                .merge({
                    first_name,
                    last_name,
                    username,
                    updated_at: new Date(),
                });

            await renderMainMenu(bot, chatId);
        } catch (error) {
            console.error("[START] Ошибка обработки /start|/menu:", error.message);
        }
    });

    // ===== доп. команды =====
    bot.onText(/\/today/, async (msg) => {
        const chatId = msg.chat.id;
        await handleTodayForecasts(bot, chatId, null);
    });

    bot.onText(/\/subscribe/, async (msg) => {
        const chatId = msg.chat.id;
        await bot.sendMessage(
            chatId,
            `💳 Чтобы оформить подписку, напишите:\n\n👉 <a href="https://t.me/cryptocheck_manager">@cryptocheck_manager</a>`,
            { parse_mode: "HTML", disable_web_page_preview: false, reply_markup: mainReplyKeyboard() }
        );
    });

    bot.onText(/\/trial/, async (msg) => {
        const chatId = msg.chat.id;
        await tryFreeTrial(bot, chatId);
    });

    bot.onText(/\/guide/, async (msg) => showGuide(bot, msg.chat.id));
    bot.onText(/\/faq/, async (msg) => showFaq(bot, msg.chat.id));
    bot.onText(/\/about/, async (msg) => showAbout(bot, msg.chat.id));

    // ===== Callback-кнопки (inline) =====
    bot.on("callback_query", async (query) => {
        bot.answerCallbackQuery({ callback_query_id: query.id }).catch(() => {});

        const chatId = query.message?.chat?.id;
        const messageId = query.message?.message_id;
        const action = query.data;
        if (!chatId || !messageId) return;

        try {
            if (action === "try_free_trial") {
                await tryFreeTrial(bot, chatId, messageId, true);
            } else if (action === "check_subscription") {
                // Callback после подписки на канал
                await checkAndActivateTrial(bot, chatId, messageId);
            } else if (action === "buy_subscription") {
                await bot.editMessageText(
                    `💳 Чтобы оформить подписку, напишите:\n\n👉 <a href="https://t.me/cryptocheck_manager">@cryptocheck_manager</a>`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: "HTML",
                        disable_web_page_preview: false,
                        reply_markup: {
                            inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "back_to_menu" }]],
                        },
                    }
                );
            } else if (action === "about_bot") {
                await editOrSend(bot, chatId, messageId, buildAboutText(), {
                    inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "back_to_menu" }]],
                });
            } else if (action === "faq") {
                await editOrSend(bot, chatId, messageId, buildFaqText(), {
                    inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "back_to_menu" }]],
                });
            } else if (action === "guide") {
                await editOrSend(bot, chatId, messageId, buildGuideText(), {
                    inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "back_to_menu" }]],
                });
            } else if (action === "today_forecasts") {
                await handleTodayForecasts(bot, chatId, messageId);
            } else if (action === "back_to_menu") {
                await renderMainMenu(bot, chatId, messageId);
            }
        } catch (e) {
            console.error("[callback_query] error:", e);
        }
    });
};

/* ==================== Функции-обработчики ==================== */

async function handleTodayForecasts(bot, chatId, messageId) {
    const user = await knex("users").where({ telegram_id: chatId }).first();
    if (!isActiveSubscription(user)) {
        const lockedText =
            `🔒 <b>Доступ ограничен</b>\n\n` +
            `Просмотр сегодняшних прогнозов доступен только по активной подписке.`;
        const opts = {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "💳 Оформить подписку", callback_data: "buy_subscription" }],
                    [{ text: "⬅️ Назад", callback_data: "back_to_menu" }],
                ],
            },
        };
        if (messageId) {
            return bot.editMessageText(lockedText, { chat_id: chatId, message_id: messageId, ...opts });
        }
        return bot.sendMessage(chatId, lockedText, opts);
    }

    const processingText = `⏳ Обрабатываю...\n\n<b>Это займёт некоторое время. Вы можете подождать или вернуться в меню.</b>`;
    const opts = {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [[{ text: "⬅️ Вернуться в меню", callback_data: "back_to_menu" }]],
        },
    };

    let sent;
    if (messageId) {
        await bot.editMessageText(processingText, { chat_id: chatId, message_id: messageId, ...opts });
        sent = { message_id: messageId };
    } else {
        sent = await bot.sendMessage(chatId, processingText, opts);
    }

    try {
        const breaking = await getOrCreateTodayBreakingNews();
        if (breaking?.message) {
            return bot.editMessageText(breaking.message, {
                chat_id: chatId,
                message_id: sent.message_id,
                parse_mode: "HTML",
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "back_to_menu" }]],
                },
            });
        }

        const forecast = await getOrCreateTodayForecasts();
        const text = forecast?.message || "Сегодня прогнозов пока нет.";
        return bot.editMessageText(text, {
            chat_id: chatId,
            message_id: sent.message_id,
            parse_mode: "HTML",
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "back_to_menu" }]],
            },
        });
    } catch (e) {
        console.error("[today_forecasts] error:", e);
        return bot.editMessageText("❌ Ошибка при получении прогнозов. Попробуйте позже.", {
            chat_id: chatId,
            message_id: sent.message_id,
            reply_markup: {
                inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "back_to_menu" }]],
            },
        });
    }
}

async function tryFreeTrial(bot, chatId, messageId = null, asEdit = false) {
    const user = await knex("users").where({ telegram_id: chatId }).first();

    // Проверка: триал уже использован?
    if (user?.trial_used) {
        const text = `❌ <b>Вы уже использовали пробный период.</b>\n\nДля доступа к прогнозам оформите подписку: @cryptocheck_manager`;
        const opts = {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "back_to_menu" }]],
            },
        };
        if (asEdit && messageId) {
            return bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
        }
        return bot.sendMessage(chatId, text, opts);
    }

    // Показываем сообщение с требованием подписки
    const text =
        `🎁 <b>Получите 7 дней бесплатного доступа!</b>\n\n` +
        `Для активации пробного периода необходимо:\n\n` +
        `1️⃣ Подписаться на наш канал: ${REQUIRED_CHANNEL}\n` +
        `2️⃣ Нажать кнопку "Проверить подписку"\n\n` +
        `📢 <b>В канале вы найдете:</b>\n` +
        `• Ежедневные отчеты о работе бота\n` +
        `• Новости крипторынка\n` +
        `• Реальные результаты прошлых дней\n\n` +
        `После подписки нажмите кнопку ниже ⬇️`;

    const opts = {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [{ text: "📢 Подписаться на канал", url: `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}` }],
                [{ text: "✅ Проверить подписку", callback_data: "check_subscription" }],
                [{ text: "⬅️ Назад", callback_data: "back_to_menu" }],
            ],
        },
    };

    if (asEdit && messageId) {
        return bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
    }
    return bot.sendMessage(chatId, text, opts);
}

async function checkAndActivateTrial(bot, chatId, messageId) {
    const user = await knex("users").where({ telegram_id: chatId }).first();

    // Повторная проверка на использованный триал
    if (user?.trial_used) {
        const text = `❌ <b>Вы уже использовали пробный период.</b>`;
        return bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "back_to_menu" }]],
            },
        });
    }

    // Проверяем подписку
    const isSubscribed = await checkChannelSubscription(bot, chatId);

    if (!isSubscribed) {
        const text =
            `❌ <b>Вы не подписаны на канал</b>\n\n` +
            `Для получения бесплатного доступа необходимо подписаться на: ${REQUIRED_CHANNEL}\n\n` +
            `После подписки нажмите "Проверить подписку" ещё раз.`;

        return bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📢 Подписаться на канал", url: `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}` }],
                    [{ text: "✅ Проверить подписку", callback_data: "check_subscription" }],
                    [{ text: "⬅️ Назад", callback_data: "back_to_menu" }],
                ],
            },
        });
    }

    // Подписка подтверждена - активируем триал
    const now = new Date();
    const trialEnds = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 ДНЕЙ

    try {
        await knex("users")
            .where({ telegram_id: chatId })
            .update({
                is_subscribed: true,
                trial_started_at: now,
                subscription_expires_at: trialEnds,
                trial_used: true,
                updated_at: now,
            });

        const text =
            `🎉 <b>Поздравляем!</b>\n\n` +
            `Вы активировали <b>бесплатный пробный период</b> на 7 дней!\n\n` +
            `Теперь вы будете ежедневно получать:\n` +
            `• 📈 Прогнозы по криптовалютам\n` +
            `• 🗞 Важные новости\n` +
            `• 🔔 Оповещения об изменениях цен\n\n` +
            `Пробный период действует до <b>${trialEnds.toLocaleDateString("ru-RU")}</b>.\n\n` +
            `Не забудьте подписаться на ${REQUIRED_CHANNEL} чтобы следить за результатами!`;

        await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [[{ text: "⬅️ В главное меню", callback_data: "back_to_menu" }]],
            },
        });
    } catch (error) {
        console.error("[TRIAL] Ошибка активации триала:", error.message);
        await bot.editMessageText("❌ Ошибка активации. Попробуйте позже.", {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "back_to_menu" }]],
            },
        });
    }
}

async function renderMainMenu(bot, chatId, messageId = null) {
    const user = await knex("users").where({ telegram_id: chatId }).first();
    const showTrial = !user?.trial_used;

    const inline = [];

    if (showTrial) inline.push([{ text: "🔥 Попробовать 7 дней бесплатно", callback_data: "try_free_trial" }]);

    inline.push(
        [{ text: "💳 Оформить подписку", callback_data: "buy_subscription" }],
        [{ text: "📅 Проверить сегодняшние прогнозы", callback_data: "today_forecasts" }],
        [{ text: "🔥 Гайд", callback_data: "guide" }, { text: "💡 FAQ", callback_data: "faq" }],
        [{ text: "🤖 О боте", callback_data: "about_bot" }, { text: "🏔️ Подробнее о боте", url: "https://t.me/cryptocheck_news" }]
    );

    const text =
        `👋 <b>Привет, трейдер!</b>\n\n` +
        `Я — твой личный AI-аналитик для заработка на криптовалюте 🤖\n\n` +
        `📊 <b>Что я делаю каждый день:</b>\n` +
        `• Анализирую рынок с помощью AI\n` +
        `• Даю четкие сигналы: Покупать/Продавать/Держать\n` +
        `• Слежу за трендами 24/7\n\n` +
        `🕙 Прогнозы приходят ежедневно в <b>10:00 по МСК</b>\n\n` +
        `🎁 <b>ПОЛУЧИ 7 ДНЕЙ БЕСПЛАТНОГО ДОСТУПА!</b>\n\n` +
        `Протестируй мои возможности и убедись в качестве сигналов:\n\n` +
        `✅ 74% точности\n` +
        `✅ +21% доходность за 23 дня\n` +
        `✅ Среднедневная доходность: 0.9%\n\n` +
        `📢 <b>Убедись в точности просто подписавшись на наш канал!</b>\n\n` +
        `<b>Ты получишь:</b>\n` +
        `• Ежедневные отчеты о работе бота\n` +
        `• Новости крипторынка\n` +
        `• Реальные результаты предыдущих дней\n\n` +
        `После пробного периода — продолжай получать прибыльные сигналы по подписке.\n\n` +
        `Выбери, с чего начать:`;

    const opts = {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: inline },
    };

    if (messageId) {
        await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
    } else {
        await bot.sendMessage(chatId, text, { ...opts, reply_markup: { ...opts.reply_markup } });
    }
}

/* ===== Тексты и утилиты отображения ===== */
function buildAboutText() {
    return (
        `📊 Я анализирую рынок криптовалют и ежедневно отправляю:\n` +
        `— Прогнозы на основе AI\n` +
        `— Важные новости\n` +
        `— Уведомления об изменениях цен\n\n` +
        `🔬 Всё это помогает вам быть в курсе и зарабатывать на рынке криптовалют.\n\n` +
        `Попробуйте бесплатно или оформите подписку!`
    );
}

function buildFaqText() {
    return `❓ Часто задаваемые вопросы
🔹 1. Общие вопросы
🤖 Как работает бот?
🎯 Бот анализирует рынок 24/7 с помощью AI и отправляет готовые прогнозы по 6 криптовалютам (BTC, ETH, XRP и др.). Вам нужно лишь следовать сигналам.

📊 Насколько точны прогнозы?
✅ Точность составляет 85-90% (подтверждено историей сигналов). Однако крипторынок волатилен, поэтому мы рекомендуем управлять рисками.

💳 Сколько стоит подписка?
💰 Тарифы:

🆓 Пробный период: 7 дней бесплатно

🚀 Basic: $50/мес — полный доступ к прогнозам

🔹 2. Торговля и риски
💶 Нужен ли опыт в трейдинге?
🤗 Нет! Бот дает готовые сигналы (цена входа, цель, пояснение). Но основы управления капиталом изучить стоит.

❌ Что делать, если прогноз не сработал?
🔄 Проверьте, правильно ли вы вошли в сделку.
⏳ Дождитесь новых сигналов — рынок непредсказуем.

⚠️ Как минимизировать риски?
🔸 ✅ Торгуйте только 1-2% от депозита за сделку
🔸 ✅ Фиксируйте прибыль у целевых уровней
🔸 ✅ Используйте демо-счет для тренировки

🔹 3. Оплата и подписки
💸 Как оплатить подписку?
🔄 Доступны:

₿ Криптовалюта (USDT, BTC и др)

💳 Карты (Visa/Mastercard)

 СБП

↩️ Можно ли вернуть деньги?
✔️ Да, в течение 7 дней после оплаты вам нужно написать в поддержку (@cryptocheck_manager)

🎁 Есть ли скидки?
🔥 Да! -20% при годовой подписке

🔹 4. Техподдержка
🔵 Бот не отвечает. Что делать?
1️⃣ Проверьте, не заблокировали ли вы бота
2️⃣ Напишите нам в @cryptocheck_manager

💡 Как предложить улучшение?
📨 Отправьте идею через поддержку @cryptocheck_manager
🏆 Лучшие предложения получают 1 месяц Pro-версии!

💬 Нужна помощь?
Пишите @cryptocheck_manager — мы всегда на связи! 💙`;
}

function buildGuideText() {
    return `📌 Шаг 1. Где торговать?
Рекомендуемая биржа: Bybit (простая регистрация, низкие комиссии).

Создайте аккаунт (e-mail + пароль).

Пополните баланс в USDT (купите через P2P или карту).

Перейдите в раздел "Spot" (обычная торговля без плеча).

💡 Совет: Начните с демо-счета (Bybit Testnet), чтобы потренироваться.

📌 Шаг 2. Как читать сигнал бота?
Пример прогноза:

Текущая цена XRP: $3.13

Ожидаемая цена: $3.28 (+4.8%)

Рекомендация: Покупать

Причина: RSI >60, MACD выше сигнальной линии.

Что это значит?

Бот предсказывает рост XRP до $3.28 (прибыль ~5%).

Покупать можно уровне $3.10–$3.13 (текущая цена или чуть ниже).

📌 Шаг 3. Как купить XRP?
Вариант 1: Лимитный ордер (рекомендуется)
В разделе Spot найдите пару XRP/USDT.

Нажмите "Купить XRP" → выберите "Лимитный ордер".

Укажите:

Цена: $3.10 (чтобы купить дешевле текущей цены).

Сумма: Например, $50 (это ~16.1 XRP).

Подтвердите сделку.

Почему лимитный ордер?

Вы покупаете по выгодной цене, а не по рыночной.

Вариант 2: Рыночный ордер (быстро, но дороже)
Выберите "Рыночный ордер".

Введите сумму ($50) → купите XRP по текущей цене ($3.13).

📌 Шаг 4. Как продать и зафиксировать прибыль?
Поскольку у бота нет стоп-лосса, действуйте так:

1. Тейк-профит (автоматическая продажа у цели)
После покупки XRP нажмите "Тейк-профит".

Укажите цену $3.28 (цель из прогноза).

Выберите "Продать 100%" → подтвердите.

Итог: Как только XRP достигнет $3.28, биржа продаст его автоматически.

2. Ручная продажа
Если цена растет быстрее прогноза, можно продать раньше.

Если цена не растет более 1–2 дней — выходите вручную (даже с небольшой прибылью).

📌 Шаг 5. Пример сделки
Сигнал бота:

Купить XRP в зоне $3.10–$3.13.

Цель: $3.28 (+5%).

Ваши действия:

Купили 16 XRP по $3.10 (потратили $49.6).

Выставили тейк-профит на $3.28.

Через день XRP достиг $3.28 → продали.

Прибыль: $52.48 ($3.28 × 16) → +$2.88 (5.8%).

📌 Важные правила
✅ Не вкладывайте все деньги — рискуйте только 1–5% от депозита.
✅ Фиксируйте прибыль у цели — не ждите "еще большего роста".
✅ Следите за новыми сигналами — если бот изменит прогноз, действуйте по нему.`;
}

async function showGuide(bot, chatId) {
    return bot.sendMessage(chatId, buildGuideText(), {
        parse_mode: "HTML",
        reply_markup: mainReplyKeyboard(),
    });
}

async function showFaq(bot, chatId) {
    return bot.sendMessage(chatId, buildFaqText(), {
        parse_mode: "HTML",
        reply_markup: mainReplyKeyboard(),
    });
}

async function showAbout(bot, chatId) {
    return bot.sendMessage(chatId, buildAboutText(), {
        parse_mode: "HTML",
        reply_markup: mainReplyKeyboard(),
    });
}

async function editOrSend(bot, chatId, messageId, text, inlineReplyMarkup) {
    const opts = { parse_mode: "HTML", reply_markup: inlineReplyMarkup };
    if (messageId) {
        return bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
    }
    return bot.sendMessage(chatId, text, { ...opts, reply_markup: { ...opts.reply_markup } });
}