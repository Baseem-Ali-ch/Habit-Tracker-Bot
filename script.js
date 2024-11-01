
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();

// Replace with your Telegram bot token from BotFather
const token = process.env.TOKEN; // Replace with your token
const bot = new TelegramBot(token, { polling: true });

// Initialize the SQLite database
const db = new sqlite3.Database('./habit-streaks.db', (err) => {
    if (err) console.error('❌ Could not connect to database:', err);
    else console.log('✅ Connected to database successfully.');
});

// Create the table if it doesn't exist
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

// Command to start tracking a new habit
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '🌱 Please enter the name of the habit you want to track:');
});

// Separate function for handling habit addition
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

// Listen for text messages after /start command
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (msg.text && !msg.text.startsWith('/')) {
        const habit = msg.text.toLowerCase().trim();
        addNewHabit(chatId, habit);
    }
});

// Command to update a habit streak
bot.onText(/\/update/, (msg) => {
    const chatId = msg.chat.id;
    db.all(`SELECT habit FROM habits WHERE user_id = ?`, [chatId], (err, rows) => {
        if (err || rows.length === 0) {
            bot.sendMessage(chatId, '📋 You have no habits to update.');
            return;
        }
        const habitButtons = rows.map(row => [{ text: `🔹 ${row.habit}`, callback_data: `UPDATE_${row.habit}` }]);
        bot.sendMessage(chatId, '🏆 Choose a habit to update:', {
            reply_markup: { inline_keyboard: habitButtons }
        });
    });
});

// Command to view habit streak details
bot.onText(/\/streak/, (msg) => {
    const chatId = msg.chat.id;
    db.all(`SELECT habit FROM habits WHERE user_id = ?`, [chatId], (err, rows) => {
        if (err || rows.length === 0) {
            bot.sendMessage(chatId, '📊 You have no habits to check.');
            return;
        }
        const habitButtons = rows.map(row => [{ text: `📈 ${row.habit}`, callback_data: `VIEW_${row.habit}` }]);
        bot.sendMessage(chatId, '📋 Choose a habit to view streak details:', {
            reply_markup: { inline_keyboard: habitButtons }
        });
    });
});

// Command to reset a habit streak
bot.onText(/\/reset/, (msg) => {
    const chatId = msg.chat.id;
    db.all(`SELECT habit FROM habits WHERE user_id = ?`, [chatId], (err, rows) => {
        if (err || rows.length === 0) {
            bot.sendMessage(chatId, '🚫 You have no habits to reset.');
            return;
        }
        const habitButtons = rows.map(row => [{ text: `🔄 ${row.habit}`, callback_data: `RESET_${row.habit}` }]);
        bot.sendMessage(chatId, '⚠️ Choose a habit to reset:', {
            reply_markup: { inline_keyboard: habitButtons }
        });
    });
});

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

// Function to update habit streak
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

// Function to view habit streak
function viewHabitStreak(chatId, habit) {
    db.get(`SELECT start_date, last_updated, streak_count FROM habits WHERE user_id = ? AND habit = ?`, [chatId, habit], (err, row) => {
        if (err || !row) {
            bot.sendMessage(chatId, `❌ Habit "${habit}" not found.`);
        } else {
            bot.sendMessage(chatId, `📊 *Habit Streak Details*\n🏁 Habit: ${habit}\n🚦 Start Date: ${row.start_date}\n🕒 Last Updated: ${row.last_updated}\n🔥 Current Streak: ${row.streak_count} days`, { parse_mode: 'Markdown' });
        }
    });
}

// Function to reset habit
function resetHabit(chatId, habit) {
    db.run(`DELETE FROM habits WHERE user_id = ? AND habit = ?`, [chatId, habit], (err) => {
        if (err) {
            bot.sendMessage(chatId, `❌ Error resetting habit "${habit}".`);
        } else {
            bot.sendMessage(chatId, `🔄 Habit "${habit}" has been reset. Start again with /start!`);
        }
    });
}


// Optional: Command to list all tracked habits
bot.onText(/\/habits/, (msg) => {
    const chatId = msg.chat.id;

    db.all(`
        SELECT habit, streak_count FROM habits WHERE user_id = ?
    `, [chatId], (err, rows) => {
        if (err || rows.length === 0) {
            bot.sendMessage(chatId, '📭 No habits being tracked.');
        } else {
            const habitsList = rows.map(row => `🌱 ${row.habit}: ${row.streak_count} days`).join('\n');
            bot.sendMessage(chatId, `📋 *Tracked Habits:*\n${habitsList}`, { parse_mode: 'Markdown' });
        }
    });
});

console.log('🤖 Habit Tracker Bot is running!');
