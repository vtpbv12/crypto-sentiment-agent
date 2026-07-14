// YYYYMMDDHHmm_create_daily_tables_with_unique.js
exports.up = async function (knex) {
    // breaking_news_daily
    const hasBreaking = await knex.schema.hasTable("breaking_news_daily");
    if (!hasBreaking) {
        await knex.schema.createTable("breaking_news_daily", (t) => {
            t.increments("id").primary();
            t.date("day").notNullable().unique().index(); // UNIQUE + INDEX
            t.text("message").notNullable();
            t.jsonb("payload").defaultTo(knex.raw(`'{}'::jsonb`));
            t.timestamp("created_at").defaultTo(knex.fn.now());
            t.timestamp("updated_at").defaultTo(knex.fn.now());
        });
    } else {
        // На случай, если таблица уже есть после неполного отката — гарантируем уникальность
        await knex.schema.alterTable("breaking_news_daily", (t) => {
            t.unique(["day"]);
        });
    }

    // daily_forecasts
    const hasForecasts = await knex.schema.hasTable("daily_forecasts");
    if (!hasForecasts) {
        await knex.schema.createTable("daily_forecasts", (t) => {
            t.increments("id").primary();
            t.date("day").notNullable().unique().index(); // UNIQUE + INDEX
            t.text("message").notNullable();
            t.jsonb("payload").defaultTo(knex.raw(`'{}'::jsonb`));
            t.timestamp("created_at").defaultTo(knex.fn.now());
            t.timestamp("updated_at").defaultTo(knex.fn.now());
        });
    } else {
        await knex.schema.alterTable("daily_forecasts", (t) => {
            t.unique(["day"]);
        });
    }
};

exports.down = async function (knex) {
    // если хочешь сохранять таблицы, можно вместо drop убрать только уникальные индексы
    await knex.schema.dropTableIfExists("breaking_news_daily");
    await knex.schema.dropTableIfExists("daily_forecasts");
};
