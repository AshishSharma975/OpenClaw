import { Telegraf } from "telegraf";
import chalk from "chalk";
import { WELCOME } from "./constants";
import { registerHandler } from "./handlers";

export async function runTelegramMode() {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const ownerId = process.env.TELEGRAM_OWNER_ID?.trim();

    if (!token) {
        console.log(chalk.red("❌ TELEGRAM_BOT_TOKEN is missing in .env"));
        return;
    }

    if (!ownerId) {
        console.log(chalk.red("❌ TELEGRAM_OWNER_ID is missing in .env"));
        return;
    }

    const bot = new Telegraf(token);
    registerHandler(bot);

    try {
        await bot.telegram.sendMessage(ownerId, WELCOME, { parse_mode: "Markdown" });
        console.log(chalk.green("sent welcome to telegram.\n"));
    } catch (err: any) {
        console.log(chalk.red(`❌ Telegram error: ${err.message}`));
        if (err?.response?.error_code === 401 || err?.response?.description?.includes("Unauthorized")) {
            console.log(chalk.yellow("👉 Apka TELEGRAM_BOT_TOKEN galat ya expired hai. Kripya @BotFather se naya token lekar .env me dalein."));
        } else if (err?.response?.description?.includes("chat not found")) {
            console.log(chalk.yellow("👉 Bot ko Telegram par pehle ek baar /start message bhejein taaki bot apko message bhej sake."));
        }
        return;
    }

    bot.launch();
    console.log(chalk.green("telegram mode started successfully. Press Ctrl+C to exit.\n"));

    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));

    await new Promise<void>((resolve) => {
        process.once("SIGINT", () => resolve());
        process.once("SIGTERM", () => resolve());
    });
}