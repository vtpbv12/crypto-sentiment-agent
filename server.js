require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");

const app = express();

// CORS - РАЗРЕШАЕМ ВСЁ НАХУЙ
app.use(cors({
    origin: "*", // Разрешаем ВСЕ домены
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
    credentials: true
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const apiRouter = express.Router();

const server = http.createServer(app);
const APP_PORT = process.env.APP_PORT || 5001;

// Тестовый роут чтобы проверить что сервер работает
app.get("/", (req, res) => {
    res.json({ status: "ok", message: "API работает" });
});

// ВАЖНО: Подключаем роуты ПЕРЕД app.use
require(`./src/api/subscribe`)(apiRouter);

// РЕГИСТРИРУЕМ роутер
app.use("/api/v1", apiRouter);

// Логируем все роуты для отладки
console.log("\nЗарегистрированные роуты:");
apiRouter.stack.forEach((r) => {
    if (r.route && r.route.path) {
        console.log(`  ${Object.keys(r.route.methods)[0].toUpperCase()} /api/v1${r.route.path}`);
    }
});

server.listen(APP_PORT, () => {
    console.log(`HTTP server started on port ${APP_PORT}`);
    console.log(`Test: http://localhost:${APP_PORT}/api/v1/users/stats`);
});