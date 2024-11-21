const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();

// Initialize the SQLite database
const db = new sqlite3.Database('./habit-streaks.db', (err) => {
    if (err) console.error('❌ Could not connect to database:', err);
    else console.log('✅ Connected to database successfully.');
});

// Create the habits table if it doesn't exist
db.run(`
    CREATE TABLE IF NOT EXISTS habits (
        user_id INTEGER,
        habit TEXT,
        start_date TEXT,
        last_updated TEXT,
        streak_count INTEGER,
        PRIMARY KEY (user_id, habit)
    )
`);

// Initialize the Telegram bot with webhook mode
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { webHook: true });
bot.setWebHook(`${process.env.VERCEL_URL}/api`); // Ensure VERCEL_URL is set in environment variables

// Handle the /start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '🌱 Please enter the name of the habit you want to track:');
});

// Listen for text messages after /start command
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (msg.text && !msg.text.startsWith('/')) {
        const habit = msg.text.toLowerCase().trim();
        addNewHabit(chatId, habit);
    }
});

// Function to add a new habit
function addNewHabit(chatId, habit) {
    const today = new Date().toISOString().split('T')[0];
    db.run(`
        INSERT INTO habits (user_id, habit, start_date, last_updated, streak_count)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, habit) DO NOTHING
    `, [chatId, habit, today, today, 1], (err) => {
        if (err) {
            bot.sendMessage(chatId, '⚠️ Error starting habit.');
        } else {
            bot.sendMessage(chatId, `🌟 Great! Habit "${habit}" is now being tracked.`);
        }
    });
}

// Centralized callback query handler
bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    const action = data.split('_')[0];
    const habit = data.split('_').slice(1).join('_'); // Handle habit names with spaces

    switch (action) {
        case 'UPDATE':
            updateHabitStreak(chatId, habit);
            break;
        case 'VIEW':
            viewHabitStreak(chatId, habit);
            break;
        case 'RESET':
            resetHabit(chatId, habit);
            break;
    }
    bot.answerCallbackQuery(callbackQuery.id);
});

// Functions for habit updates, viewing, and resets
function updateHabitStreak(chatId, habit) {
    const today = new Date().toISOString().split('T')[0];
    db.get(`SELECT last_updated, streak_count FROM habits WHERE user_id = ? AND habit = ?`, [chatId, habit], (err, row) => {
        if (err || !row) {
            bot.sendMessage(chatId, `❌ Habit "${habit}" not found.`);
            return;
        }
        const lastUpdated = row.last_updated;
        const streakCount = row.streak_count;
        const newStreakCount = lastUpdated === today ? streakCount : (new Date(today) - new Date(lastUpdated) === 86400000 ? streakCount + 1 : 1);

        db.run(`UPDATE habits SET last_updated = ?, streak_count = ? WHERE user_id = ? AND habit = ?`, [today, newStreakCount, chatId, habit], (err) => {
            if (err) {
                bot.sendMessage(chatId, '❌ Error updating habit.');
            } else {
                bot.sendMessage(chatId, `🎉 Habit "${habit}" updated. Current streak: ${newStreakCount} days!`);
            }
        });
    });
}

function viewHabitStreak(chatId, habit) {
    db.get(`SELECT start_date, last_updated, streak_count FROM habits WHERE user_id = ? AND habit = ?`, [chatId, habit], (err, row) => {
        if (err || !row) {
            bot.sendMessage(chatId, `❌ Habit "${habit}" not found.`);
        } else {
            bot.sendMessage(chatId, `📊 *Habit Streak Details*\n🏁 Habit: ${habit}\n🚦 Start Date: ${row.start_date}\n🕒 Last Updated: ${row.last_updated}\n🔥 Current Streak: ${row.streak_count} days`, { parse_mode: 'Markdown' });
        }
    });
}

function resetHabit(chatId, habit) {
    db.run(`DELETE FROM habits WHERE user_id = ? AND habit = ?`, [chatId, habit], (err) => {
        if (err) {
            bot.sendMessage(chatId, `❌ Error resetting habit "${habit}".`);
        } else {
            bot.sendMessage(chatId, `🔄 Habit "${habit}" has been reset. Start again with /start!`);
        }
    });
}

// Export the webhook handler for Vercel
module.exports = (req, res) => {
    bot.processUpdate(req.body); // Process incoming updates
    res.status(200).send('Bot is running!');
};
