const knex = require("../config/database");
const { notifySubscriptionExtended, notifySubscriptionActivated } = require("../utils/telegramNotifier");

module.exports = (apiRouter) => {

    // ========== СТАТИСТИКА ==========
    apiRouter.get("/users/stats", async (req, res) => {
        try {
            console.log("[API] Запрос статистики...");
            const now = new Date();

            // Всего пользователей
            const totalResult = await knex("users").count("* as count");
            const total = parseInt(totalResult[0].count);

            // Активные подписки
            const activeResult = await knex("users")
                .where("is_subscribed", true)
                .andWhere("subscription_expires_at", ">", now)
                .count("* as count");
            const active = parseInt(activeResult[0].count);

            // На триале
            const trialResult = await knex("users")
                .where("is_subscribed", true)
                .andWhere("subscription_expires_at", ">", now)
                .andWhere("trial_used", true)
                .andWhereRaw("subscription_expires_at <= NOW() + INTERVAL '7 days'")
                .count("* as count");
            const trial = parseInt(trialResult[0].count);

            // Неактивные
            const inactive = total - active;

            console.log("[STATS]", { total, active, trial, inactive });

            return res.json({
                total,
                active,
                trial,
                inactive
            });
        } catch (error) {
            console.error("GET /users/stats error:", error.message);
            return res.status(500).json({ error: "Ошибка получения статистики" });
        }
    });

    // ========== ПОЛУЧЕНИЕ ПОЛЬЗОВАТЕЛЕЙ ==========
    apiRouter.get("/users", async (req, res) => {
        try {
            console.log("[API] Запрос пользователей...", req.query);
            const { status = "active", search = "", limit = 20, offset = 0 } = req.query;

            const now = new Date();
            const query = knex("users");

            if (status === "active") {
                query
                    .where("is_subscribed", true)
                    .andWhere("subscription_expires_at", ">", now);
            } else if (status === "inactive") {
                // Неактивные: либо is_subscribed=false, либо подписка истекла
                query.where(function () {
                    this.where("is_subscribed", false)
                        .orWhereNull("subscription_expires_at")
                        .orWhere("subscription_expires_at", "<=", now);
                });
            }
            // если status === "all", фильтр не применяем

            if (search) {
                query.andWhere(function() {
                    this.where("username", "ilike", `%${search}%`)
                        .orWhere("first_name", "ilike", `%${search}%`)
                        .orWhere("last_name", "ilike", `%${search}%`);
                });
            }

            const users = await query
                .orderBy("created_at", "desc")
                .limit(parseInt(limit))
                .offset(parseInt(offset));

            console.log(`[API] Найдено ${users.length} пользователей`);

            return res.json(users);
        } catch (error) {
            console.error("GET /users error:", error.message);
            return res.status(500).json({ error: "Ошибка получения пользователей" });
        }
    });

    // ========== ПРОДЛЕНИЕ ПОДПИСКИ ==========
    apiRouter.post("/users/:telegram_id/extend", async (req, res) => {
        const trx = await knex.transaction();
        try {
            const { telegram_id } = req.params;

            const user = await trx("users").where({ telegram_id }).first();
            if (!user) {
                await trx.rollback();
                return res.status(404).json({ error: "Пользователь не найден" });
            }

            const now = new Date();
            const hadActiveSubscription = user.subscription_expires_at && new Date(user.subscription_expires_at) > now;
            const baseDate = hadActiveSubscription
                ? new Date(user.subscription_expires_at)
                : now;

            const newExpiration = new Date(baseDate);
            newExpiration.setMonth(newExpiration.getMonth() + 1);

            await trx("users")
                .where({ telegram_id })
                .update({
                    is_subscribed: true,
                    subscription_expires_at: newExpiration,
                    updated_at: new Date(),
                });

            await trx.commit();

            console.log(`[API] Продлена подписка для ${telegram_id} до ${newExpiration}`);

            // Отправляем уведомление пользователю
            try {
                if (hadActiveSubscription) {
                    // Если была активная подписка - это продление
                    await notifySubscriptionExtended(telegram_id, newExpiration);
                } else {
                    // Если не было активной подписки - это активация
                    await notifySubscriptionActivated(telegram_id, newExpiration);
                }
            } catch (notifyError) {
                console.error(`[API] Ошибка отправки уведомления ${telegram_id}:`, notifyError.message);
                // Не падаем если уведомление не отправилось
            }

            return res.json({
                success: true,
                message: "Подписка продлена на 30 дней",
                subscription_expires_at: newExpiration,
            });
        } catch (error) {
            await trx.rollback();
            console.error("POST /users/:telegram_id/extend error:", error.message);
            return res.status(500).json({ error: "Ошибка продления подписки" });
        }
    });

    return apiRouter;
};