const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path
const dbPath = path.join(__dirname, 'sketches.db');

// Initialize database
function initDatabase() {
    const db = new sqlite3.Database(dbPath);
    
    // Create tables if they don't exist
    db.serialize(() => {
        // Uploads table
        db.run(`
            CREATE TABLE IF NOT EXISTS uploads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                username TEXT,
                file_id TEXT NOT NULL,
                upload_date DATE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Sessions table for tracking completed sessions
        db.run(`
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                session_date DATE NOT NULL,
                completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, session_date)
            )
        `);
        
        // Create indexes for better performance
        db.run(`CREATE INDEX IF NOT EXISTS idx_uploads_user_date ON uploads(user_id, upload_date)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_user_date ON sessions(user_id, session_date)`);
    });
    
    db.close();
}

// Save upload to database
function saveUpload(userId, username, fileId) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        
        db.run(
            `INSERT INTO uploads (user_id, username, file_id, upload_date) VALUES (?, ?, ?, ?)`,
            [userId, username, fileId, today],
            function(err) {
                db.close();
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            }
        );
    });
}

// Check if user has uploaded today
function hasUploadedToday(userId) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        const today = new Date().toISOString().split('T')[0];
        
        db.get(
            `SELECT COUNT(*) as count FROM uploads WHERE user_id = ? AND upload_date = ?`,
            [userId, today],
            (err, row) => {
                db.close();
                if (err) {
                    reject(err);
                } else {
                    resolve(row.count > 0);
                }
            }
        );
    });
}

// Mark session as complete
function markSessionComplete(userId) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        const today = new Date().toISOString().split('T')[0];
        
        db.run(
            `INSERT OR REPLACE INTO sessions (user_id, session_date) VALUES (?, ?)`,
            [userId, today],
            function(err) {
                db.close();
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            }
        );
    });
}

// Get user statistics including streaks
function getUserStats(userId) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        
        // Get all upload dates for the user, ordered by date
        db.all(
            `SELECT DISTINCT upload_date FROM uploads WHERE user_id = ? ORDER BY upload_date DESC`,
            [userId],
            (err, rows) => {
                if (err) {
                    db.close();
                    reject(err);
                    return;
                }
                
                // Calculate streaks
                const streakData = calculateStreaks(rows.map(row => row.upload_date));
                
                // Get total uploads count
                db.get(
                    `SELECT COUNT(*) as total FROM uploads WHERE user_id = ?`,
                    [userId],
                    (err, countRow) => {
                        if (err) {
                            db.close();
                            reject(err);
                            return;
                        }
                        
                        // Get recent uploads for history
                        db.all(
                            `SELECT upload_date, COUNT(*) as sketches FROM uploads 
                             WHERE user_id = ? 
                             GROUP BY upload_date 
                             ORDER BY upload_date DESC 
                             LIMIT 30`,
                            [userId],
                            (err, historyRows) => {
                                db.close();
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve({
                                        currentStreak: streakData.currentStreak,
                                        longestStreak: streakData.longestStreak,
                                        totalUploads: countRow.total,
                                        recentHistory: historyRows,
                                        hasUploadedToday: streakData.hasUploadedToday
                                    });
                                }
                            }
                        );
                    }
                );
            }
        );
    });
}

// Calculate current and longest streaks
function calculateStreaks(uploadDates) {
    if (uploadDates.length === 0) {
        return { currentStreak: 0, longestStreak: 0, hasUploadedToday: false };
    }
    
    const today = new Date().toISOString().split('T')[0];
    const hasUploadedToday = uploadDates.includes(today);
    
    // Convert dates to Date objects and sort
    const dates = uploadDates.map(date => new Date(date)).sort((a, b) => b - a);
    
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 1;
    
    // Check if today or yesterday was the last upload for current streak
    const lastUpload = dates[0];
    const todayDate = new Date(today);
    const yesterdayDate = new Date(today);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    
    if (lastUpload.toDateString() === todayDate.toDateString() || 
        lastUpload.toDateString() === yesterdayDate.toDateString()) {
        currentStreak = 1;
        
        // Calculate current streak by checking consecutive days
        for (let i = 1; i < dates.length; i++) {
            const currentDate = dates[i];
            const previousDate = dates[i - 1];
            const dayDifference = Math.floor((previousDate - currentDate) / (1000 * 60 * 60 * 24));
            
            if (dayDifference === 1) {
                currentStreak++;
            } else {
                break;
            }
        }
    }
    
    // Calculate longest streak
    longestStreak = 1;
    tempStreak = 1;
    
    for (let i = 1; i < dates.length; i++) {
        const currentDate = dates[i];
        const previousDate = dates[i - 1];
        const dayDifference = Math.floor((previousDate - currentDate) / (1000 * 60 * 60 * 24));
        
        if (dayDifference === 1) {
            tempStreak++;
            longestStreak = Math.max(longestStreak, tempStreak);
        } else {
            tempStreak = 1;
        }
    }
    
    return { currentStreak, longestStreak, hasUploadedToday };
}

module.exports = {
    initDatabase,
    saveUpload,
    getUserStats,
    markSessionComplete,
    hasUploadedToday
};
