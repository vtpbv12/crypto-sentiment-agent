exports.up = function(knex) {
    return knex.schema.table('users', function(table) {
        table.boolean('trial_used').defaultTo(false).notNullable();
    });
};

exports.down = function(knex) {
    return knex.schema.table('users', function(table) {
        table.dropColumn('trial_used');
    });
};