require('dotenv').config();
const { Telegraf } = require('telegraf');
const { onMessage } = require('./handler');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

bot.on('text', onMessage);

bot.launch().then(() => console.log('Bot running'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
