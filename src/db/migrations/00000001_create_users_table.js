exports.up = function (knex) {
    return knex.schema.createTable("users", (table) => {
        table.increments("id").primary();
        table.string("telegram_id").unique().notNullable(); // индекс создаётся
        table.string("first_name");
        table.string("last_name");
        table.string("username");
        table.boolean("is_subscribed").defaultTo(false);
        table.timestamp("trial_started_at");
        table.timestamp("subscription_expires_at");
        table.timestamps(true, true); // created_at, updated_at
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("users");
};
