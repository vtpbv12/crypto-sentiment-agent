exports.up = function (knex) {
    return knex.schema.createTable("crypto_prices", (table) => {
        table.increments("id").primary();
        table.string("crypto_name").notNullable();
        table.decimal("price_usd", 20, 10).notNullable();
        table.timestamp("timestamp").defaultTo(knex.fn.now());

        table.index("crypto_name");
        table.index("timestamp");
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("crypto_prices");
};
