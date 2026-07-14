require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const priceAndNewsChecker = require("./src/cron/priceAndNewsChecker");
const dailyAnalyticsCron = require("./src/cron/dailyAnalyticsCron");
const breakingNewsCron = require("./src/cron/breakingNewsCron");

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Подключение команд
require("./src/bot/commands/start")(bot);
require("./src/bot/commands/broadcast")(bot); // 👈 ДОБАВЛЕНО

priceAndNewsChecker(bot);
dailyAnalyticsCron(bot);
breakingNewsCron(bot);

console.log("Бот успешно запущен...");
console.log("Команды админа: /broadcast, /stats");