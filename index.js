const { Telegraf } = require('telegraf');
const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
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
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
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

// Initialize database
initDatabase();

// Bot commands
bot.start((ctx) => {
    const welcomeMessage = `
🎨 Welcome to Sketch-Time! 

This bot helps you track your daily sketching habit and build streaks!

📸 Send me your daily sketches (PNG/JPEG images)
📊 Use the Mini-App to track your progress and streaks
⏱️ Built-in timer to help you focus on your art

To get started, just send me a sketch or open the Mini-App!
    `;
    
    ctx.reply(welcomeMessage, {
        reply_markup: {
            inline_keyboard: [[
                { text: '🎨 Open Sketch Tracker', web_app: { url: `${process.env.APP_URL || 'https://your-app-url.com'}` } }
            ]]
        }
    });
});

// Handle photo uploads
bot.on('photo', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const username = ctx.from.username || ctx.from.first_name || 'Unknown';
        const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Get highest resolution
        const fileId = photo.file_id;
        
        // Save upload to database
        await saveUpload(userId, username, fileId);
        
        // Get updated stats
        const stats = await getUserStats(userId);
        
        const responseMessage = `
🎨 Great sketch! Added to your collection!

📊 Your Stats:
🔥 Current Streak: ${stats.currentStreak} days
🏆 Longest Streak: ${stats.longestStreak} days
📈 Total Sketches: ${stats.totalUploads}

Keep it up! ${stats.currentStreak > 0 ? '🔥' : '💪'}
        `;
        
        ctx.reply(responseMessage, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '📊 View Full Stats', web_app: { url: `${process.env.APP_URL || 'https://your-app-url.com'}` } }
                ]]
            }
        });
        
    } catch (error) {
        console.error('Error handling photo upload:', error);
        ctx.reply('Sorry, there was an error saving your sketch. Please try again.');
    }
});

// Handle non-photo files
bot.on('document', (ctx) => {
    ctx.reply('Please send your sketches as photos (PNG/JPEG) rather than documents for better tracking!');
});

// API Routes

// Handle file upload
app.post('/upload', upload.single('sketch'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        // Extract user ID from Telegram WebApp initData
        // For now, we'll use a simple approach - in production you'd validate the initData
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        
        // Save upload to database with file path instead of file_id
        const filePath = req.file.path;
        await saveUpload(parseInt(userId), 'WebApp User', filePath);
        
        // Get updated stats
        const stats = await getUserStats(parseInt(userId));
        
        res.json({ 
            success: true, 
            message: 'Sketch uploaded successfully! 🎨',
            stats: stats,
            fileName: req.file.originalname
        });
        
    } catch (error) {
        console.error('Error handling file upload:', error);
        
        // Clean up uploaded file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ error: 'Failed to upload sketch' });
    }
});

// Get user statistics
app.get('/stats/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        
        if (!userId) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        
        const stats = await getUserStats(userId);
        res.json(stats);
        
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Mark daily session as complete
app.post('/done', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        
        // Check if user has uploaded an image today
        const hasUploaded = await hasUploadedToday(userId);
        
        if (!hasUploaded) {
            return res.status(400).json({ 
                error: 'You must upload a sketch today before marking the session as complete!' 
            });
        }
        
        // Mark session complete
        await markSessionComplete(userId);
        
        // Get updated stats
        const stats = await getUserStats(userId);
        
        res.json({ 
            success: true, 
            message: 'Session marked as complete! Great work! 🎨',
            stats: stats
        });
        
    } catch (error) {
        console.error('Error marking session complete:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Serve the Mini-App
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    ctx.reply('An error occurred. Please try again.');
});

// Start services
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Express server running on port ${PORT}`);
});

bot.launch().then(() => {
    console.log('Telegram bot started successfully');
}).catch((error) => {
    console.error('Error starting bot:', error);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
