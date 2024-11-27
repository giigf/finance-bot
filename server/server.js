const { Telegraf } = require('telegraf');
const { Pool } = require('pg');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

let userState = {}; // Хранилище состояния пользователей

// Установка команд для меню
bot.telegram.setMyCommands([
  { command: 'start', description: 'Начать работу с ботом' },
  { command: 'addexpense', description: 'Добавить расход' },
]);


// Команда /start
bot.start(async (ctx) => {
  const telegramId = ctx.from.id;

  try {
    // Проверяем, существует ли уже пользователь в базе данных
    const userCheck = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [telegramId]);

    // Если пользователь не найден, создаем нового
    if (userCheck.rows.length === 0) {
      await pool.query('INSERT INTO users (telegram_id, username) VALUES ($1, $2)', [
        telegramId,
        ctx.from.username || null, // Если имя пользователя не указано, то оставляем null
      ]);
      ctx.reply('Вы успешно зарегистрированы!');
    } else {
      ctx.reply('Вы уже зарегистрированы!');
    }
  } catch (error) {
    console.error('Ошибка при регистрации пользователя:', error);
    ctx.reply('Произошла ошибка при регистрации. Попробуйте позже.');
  }

  ctx.reply('Добро пожаловать! Этот бот поможет вам управлять финансами.\n\nКоманды:\n/addexpense — добавить расход');
});

// Команда /addexpense — вывод кнопок с категориями
bot.command('addexpense', (ctx) => {
  ctx.reply('Выберите категорию:', {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🍔 Еда', callback_data: 'category_food' },
          { text: '🚖 Такси', callback_data: 'category_taxi' },
        ],
        [
          { text: '🎮 Донат', callback_data: 'category_donation' },
          { text: '🏬 Покупки', callback_data: 'category_shopping' },
        ],
        [
          { text: '💻 Техника', callback_data: 'category_tech' },
          { text: '🏋️‍♂️ Спорт', callback_data: 'category_sport' },
        ],
        [
          { text: '📚 Книги', callback_data: 'category_books' },
          { text: '🎉 Развлечения', callback_data: 'category_entertainment' },
        ],
        [
          { text: '🏠 Дом', callback_data: 'category_home' },
          { text: '💼 Работа', callback_data: 'category_work' },
        ],
        [
          { text: '❓ Другое (введите вручную)', callback_data: 'category_other' },
        ],
      ],
    },
  });
});

// Обработка выбора категории
bot.on('callback_query', async (ctx) => {
  const telegramId = ctx.from.id;
  const categoryData = ctx.callbackQuery.data;

  if (categoryData.startsWith('category_')) {
    if (categoryData === 'category_other') {
      userState[telegramId] = { step: 'custom_category' };
      await ctx.answerCbQuery();
      return ctx.reply('Введите свою категорию:');
    }

    const category = categoryData.split('_')[1];
    userState[telegramId] = { category, step: 'amount' };

    await ctx.answerCbQuery();
    ctx.reply(`Вы выбрали категорию "${category}". Теперь введите сумму:`);
  } else if (categoryData.startsWith('location_')) {
    const location = categoryData.split('_')[1];
    const state = userState[telegramId];

    if (state) {
      state.location = location;

      try {
        const userCheck = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [telegramId]);
        if (userCheck.rows.length === 0) {
          ctx.reply('Вы не зарегистрированы. Пожалуйста, используйте команду /start.');
          return;
        }

        const userId = userCheck.rows[0].id;

        await pool.query(
          `INSERT INTO expenses (user_id, category, amount, description, location)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, state.category, state.amount, state.description || null, location]
        );

        ctx.reply(
          `Расход добавлен:\nКатегория: ${state.category}\nСумма: ${state.amount}\nОписание: ${state.description || 'не указано'}\nЛокация: ${location}`
        );
      } catch (error) {
        console.error('Ошибка при добавлении расхода:', error);
        ctx.reply('Произошла ошибка. Попробуйте позже.');
      }

      delete userState[telegramId];
    }
  }
});

// Обработка текста (ввод суммы, кастомной категории или описания)
bot.on('text', async (ctx) => {
  const telegramId = ctx.from.id;
  const text = ctx.message.text;
  const state = userState[telegramId];

  if (!state) return;

  if (state.step === 'custom_category') {
    userState[telegramId].category = text;
    userState[telegramId].step = 'amount';
    ctx.reply(`Категория "${text}" сохранена. Теперь введите сумму:`);
  } else if (state.step === 'amount') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      ctx.reply('Введите корректную сумму (например: 250.50).');
      return;
    }

    userState[telegramId].amount = amount;
    userState[telegramId].step = 'location';

    ctx.reply('Выберите локацию:', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🏠 Дома', callback_data: 'location_home' },
            { text: '💼 Работа', callback_data: 'location_work' },
          ],
          [
            { text: '🎢 Гуляю', callback_data: 'location_walk' },
            { text: '📚 Учёба', callback_data: 'location_study' },
          ],
          [{ text: '❓ Другое (введите вручную)', callback_data: 'location_other' }],
        ],
      },
    });
  } else if (state.step === 'location_other') {
    userState[telegramId].location = text;

    try {
      const userCheck = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [telegramId]);
      if (userCheck.rows.length === 0) {
        ctx.reply('Вы не зарегистрированы. Пожалуйста, используйте команду /start.');
        return;
      }

      const userId = userCheck.rows[0].id;

      await pool.query(
        `INSERT INTO expenses (user_id, category, amount, description, location)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, state.category, state.amount, state.description || null, text]
      );

      ctx.reply(
        `Расход добавлен:\nКатегория: ${state.category}\nСумма: ${state.amount}\nОписание: ${state.description || 'не указано'}\nЛокация: ${text}`
      );
    } catch (error) {
      console.error('Ошибка при добавлении расхода:', error);
      ctx.reply('Произошла ошибка. Попробуйте позже.');
    }

    delete userState[telegramId];
  }
});



bot.launch();
