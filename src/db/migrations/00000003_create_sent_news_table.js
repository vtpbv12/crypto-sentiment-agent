exports.up = function (knex) {
    return knex.schema.createTable("sent_news", (table) => {
        table.increments("id").primary();
        table.string("news_id").notNullable().unique();
        table.timestamp("sent_at").defaultTo(knex.fn.now());
        table.timestamp("created_at").defaultTo(knex.fn.now());

        table.index("created_at");
    });
};

exports.down = function (knex) {
    return knex.schema.dropTableIfExists("sent_news");
};
