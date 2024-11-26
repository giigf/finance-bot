const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const { Pool } = require('pg');

// Инициализация бота
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// Подключение к PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Привет! Я бот для управления финансами. Вот что я умею:\n\n' +
    '/adduser <имя> - добавить пользователя\n' +
    '/addexpense <user_id> <категория> <сумма> [описание] [место] - добавить расход\n' +
    '/expenses <user_id> - показать все расходы пользователя');
});

// Команда для добавления пользователя
bot.onText(/\/adduser (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const username = match[1];

  try {
    const result = await pool.query(
      'INSERT INTO users (username) VALUES ($1) RETURNING *',
      [username]
    );
    bot.sendMessage(chatId, `Пользователь ${result.rows[0].username} добавлен с ID: ${result.rows[0].id}`);
  } catch (error) {
    console.error('Error adding user:', error);
    bot.sendMessage(chatId, 'Ошибка при добавлении пользователя.');
  }
});

// Команда для добавления расхода
bot.onText(/\/addexpense (\d+) (\w+) ([0-9.]+) ?(.*)?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = parseInt(match[1]);
  const category = match[2];
  const amount = parseFloat(match[3]);
  const description = match[4] || null;

  try {
    const result = await pool.query(
      `INSERT INTO expenses (user_id, category, amount, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, category, amount, description]
    );
    bot.sendMessage(chatId, `Расход добавлен: ${category} - ${amount} (Описание: ${description || 'не указано'})`);
  } catch (error) {
    console.error('Error adding expense:', error);
    bot.sendMessage(chatId, 'Ошибка при добавлении расхода.');
  }
});

// Команда для получения расходов пользователя
bot.onText(/\/expenses (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = parseInt(match[1]);

  try {
    const result = await pool.query('SELECT * FROM expenses WHERE user_id = $1', [userId]);
    if (result.rows.length === 0) {
      bot.sendMessage(chatId, 'У этого пользователя пока нет расходов.');
    } else {
      let response = 'Список расходов:\n';
      result.rows.forEach((expense) => {
        response += `- ${expense.category}: ${expense.amount} (Описание: ${expense.description || 'не указано'}, Место: ${expense.location || 'не указано'})\n`;
      });
      bot.sendMessage(chatId, response);
    }
  } catch (error) {
    console.error('Error fetching expenses:', error);
    bot.sendMessage(chatId, 'Ошибка при получении расходов.');
  }
});
