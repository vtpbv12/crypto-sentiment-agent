require("dotenv").config();

const common = {
    client: "pg",
    connection: process.env.DATABASE_URL,
    migrations: {
        directory: "./src/db/migrations",
    },
    pool: {
        min: 2,
        max: 30,
        acquireTimeoutMillis: 10000
    },
    acquireConnectionTimeout: 10000,
};

module.exports = {
    development: common,
    production: common, // добавляем
};
