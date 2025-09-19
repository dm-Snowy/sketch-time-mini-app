const { Telegraf } = require('telegraf');
const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Timer tracking storage
// userId -> { duration, startTime, endTime, timeoutId }
const activeTimers = new Map();

const { initDatabase, saveUpload, getUserStats, markSessionComplete, hasUploadedToday } = require('./database');

// Initialize bot and express app
console.log('BOT_TOKEN available:', !!process.env.BOT_TOKEN);
const bot = new Telegraf(process.env.BOT_TOKEN || 'your_bot_token_here');
const app = express();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
            cb(null, true);
        } else {
            cb(new Error('Only PNG and JPEG files are allowed!'), false);
        }
    }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize DB
initDatabase();

/* ========= BOT COMMANDS ========= */

bot.start((ctx) => {
    const welcomeMessage = `
🎨 Welcome to Sketch-Time! 

This bot helps you track your daily sketching habit and build streaks!

📊 Use the Mini-App to track your progress and streaks
⏱️ Built-in timer to help you focus on your art
📸 Upload your daily sketch to mark it as completed and continue the streak

👉 Open the app via the green "Launch Sketch-Time" button below!
    `;
    
    ctx.reply(welcomeMessage);
});

bot.on('photo', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const username = ctx.from.username || ctx.from.first_name || 'Unknown';
        const photo = ctx.message.photo[ctx.message.photo.length - 1]; 
        const fileId = photo.file_id;
        
        await saveUpload(userId, username, fileId);
        const stats = await getUserStats(userId);
        
        ctx.reply(`
🎨 Great sketch! Added to your collection!

📊 Stats:
🔥 Current Streak: ${stats.currentStreak} days
🏆 Longest Streak: ${stats.longestStreak} days
📈 Total Sketches: ${stats.totalUploads}
        `, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '📊 View Full Stats', web_app: { url: `${process.env.APP_URL || 'https://your-app-url.com'}` } }
                ]]
            }
        });
        
    } catch (err) {
        console.error('Photo upload error:', err);
        ctx.reply('Error saving sketch. Please try again.');
    }
});

bot.on('document', (ctx) => {
    ctx.reply('⚠️ Please send sketches as *photos* (PNG/JPEG) instead of documents!');
});

/* ========= API ROUTES ========= */

// Start timer
app.post('/start-timer', async (req, res) => {
    try {
        const { userId, duration } = req.body;
        if (!userId || !duration) {
            return res.status(400).json({ error: 'User ID and duration required' });
        }

        const userIdInt = parseInt(userId);
        const durationMs = duration * 60 * 1000;
        const startTime = Date.now();
        const endTime = startTime + durationMs;

        // Cancel existing timer if any
        if (activeTimers.has(userIdInt)) {
            clearTimeout(activeTimers.get(userIdInt).timeoutId);
        }

        // Schedule notification
        const timeoutId = setTimeout(async () => {
            try {
                await bot.telegram.sendMessage(
                    userIdInt,
                    `⏰ Your ${duration}-minute session finished! Great job! 🎨`
                );
                await markSessionComplete(userIdInt);
            } catch (err) {
                console.error('Timer notification error:', err);
            } finally {
                activeTimers.delete(userIdInt);
            }
        }, durationMs);

        activeTimers.set(userIdInt, { duration, startTime, endTime, timeoutId });

        res.json({ success: true, startTime, endTime });
    } catch (err) {
        console.error('Start timer error:', err);
        res.status(500).json({ error: 'Failed to start timer' });
    }
});

// Get timer state
app.get('/timer/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        if (!userId) return res.status(400).json({ error: 'Invalid user ID' });

        if (activeTimers.has(userId)) {
            const t = activeTimers.get(userId);
            const remainingMs = Math.max(0, t.endTime - Date.now());

            return res.json({
                hasActiveTimer: true,
                duration: t.duration,
                startTime: t.startTime,
                endTime: t.endTime,
                remainingMs,
                isExpired: remainingMs === 0
            });
        }
        res.json({ hasActiveTimer: false });
    } catch (err) {
        console.error('Get timer error:', err);
        res.status(500).json({ error: 'Failed to get timer' });
    }
});

// Cancel timer early
app.post('/cancel-timer', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        const userIdInt = parseInt(userId);
        if (activeTimers.has(userIdInt)) {
            clearTimeout(activeTimers.get(userIdInt).timeoutId);
            activeTimers.delete(userIdInt);

            // Mark as complete on cancel
            await markSessionComplete(userIdInt);
            console.log(`Timer cancelled & session completed for user ${userIdInt}`);
        }

        res.json({ success: true, message: 'Timer cancelled and session completed' });
    } catch (err) {
        console.error('Cancel timer error:', err);
        res.status(500).json({ error: 'Failed to cancel timer' });
    }
});

// Upload sketch
app.post('/upload', upload.single('sketch'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        const filePath = req.file.path;
        await saveUpload(parseInt(userId), 'WebApp User', filePath);
        await markSessionComplete(parseInt(userId));

        const userIdInt = parseInt(userId);
        if (activeTimers.has(userIdInt)) {
            clearTimeout(activeTimers.get(userIdInt).timeoutId);
            activeTimers.delete(userIdInt);
        }

        const stats = await getUserStats(parseInt(userId));
        res.json({ success: true, message: 'Sketch uploaded! 🎨', stats, fileName: req.file.originalname });
    } catch (err) {
        console.error('Upload error:', err);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Failed to upload sketch' });
    }
});

// Stats
app.get('/stats/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        if (!userId) return res.status(400).json({ error: 'Invalid user ID' });
        const stats = await getUserStats(userId);
        res.json(stats);
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Done (mark session complete)
app.post('/done', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        const hasUploaded = await hasUploadedToday(userId);
        if (!hasUploaded) {
            return res.status(400).json({ error: 'Upload a sketch first!' });
        }

        await markSessionComplete(userId);
        const stats = await getUserStats(userId);
        res.json({ success: true, message: 'Session complete! 🎨', stats });
    } catch (err) {
        console.error('Done error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Serve Mini-App
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Bot error handler
bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    ctx.reply('⚠️ An error occurred, please try again.');
});

/* ========= START SERVICES ========= */

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Express server on port ${PORT}`));

bot.launch().then(() => console.log('Telegram bot started')).catch(console.error);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

