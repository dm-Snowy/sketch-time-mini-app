// database.js
const { Pool } = require('pg');

// Use environment variable for security
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // required for Supabase
});

// Initialize database (create tables if not exist)
async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS uploads (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      username TEXT,
      file_id TEXT NOT NULL,
      upload_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      session_date DATE NOT NULL,
      completed_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, session_date)
    )
  `);
}

// Save upload
async function saveUpload(userId, username, fileId) {
  const today = new Date().toISOString().split('T')[0];
  const result = await pool.query(
    `INSERT INTO uploads (user_id, username, file_id, upload_date)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, username, fileId, today]
  );
  return result.rows[0].id;
}

// Check if uploaded today
async function hasUploadedToday(userId) {
  const today = new Date().toISOString().split('T')[0];
  const result = await pool.query(
    `SELECT COUNT(*) FROM uploads WHERE user_id = $1 AND upload_date = $2`,
    [userId, today]
  );
  return parseInt(result.rows[0].count, 10) > 0;
}

// Mark session complete
async function markSessionComplete(userId) {
  const today = new Date().toISOString().split('T')[0];
  const result = await pool.query(
    `INSERT INTO sessions (user_id, session_date)
     VALUES ($1, $2)
     ON CONFLICT (user_id, session_date) DO UPDATE
     SET completed_at = NOW()
     RETURNING id`,
    [userId, today]
  );
  return result.rows[0].id;
}

// Get user stats
async function getUserStats(userId) {
  const uploads = await pool.query(
    `SELECT DISTINCT upload_date FROM uploads WHERE user_id = $1 ORDER BY upload_date DESC`,
    [userId]
  );
  const streakData = calculateStreaks(uploads.rows.map(r => r.upload_date.toISOString().split('T')[0]));

  const totalUploads = await pool.query(
    `SELECT COUNT(*) FROM uploads WHERE user_id = $1`,
    [userId]
  );

  const history = await pool.query(
    `SELECT upload_date, COUNT(*) as sketches
     FROM uploads
     WHERE user_id = $1
     GROUP BY upload_date
     ORDER BY upload_date DESC
     LIMIT 30`,
    [userId]
  );

  return {
    currentStreak: streakData.currentStreak,
    longestStreak: streakData.longestStreak,
    totalUploads: parseInt(totalUploads.rows[0].count, 10),
    recentHistory: history.rows,
    hasUploadedToday: streakData.hasUploadedToday
  };
}

// Helper: streak calculation
function calculateStreaks(uploadDates) {
  if (uploadDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, hasUploadedToday: false };
  }

  const today = new Date().toISOString().split('T')[0];
  const hasUploadedToday = uploadDates.includes(today);

  const dates = uploadDates.map(d => new Date(d)).sort((a, b) => b - a);

  let currentStreak = 0;
  let longestStreak = 1;
  let tempStreak = 1;

  const lastUpload = dates[0];
  const todayDate = new Date(today);
  const yesterdayDate = new Date(today);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);

  if (
    lastUpload.toDateString() === todayDate.toDateString() ||
    lastUpload.toDateString() === yesterdayDate.toDateString()
  ) {
    currentStreak = 1;

    for (let i = 1; i < dates.length; i++) {
      const prev = dates[i - 1];
      const curr = dates[i];
      const diff = Math.floor((prev - curr) / (1000 * 60 * 60 * 24));
      if (diff === 1) {
        currentStreak++;
      } else break;
    }
  }

  for (let i = 1; i < dates.length; i++) {
    const prev = dates[i - 1];
    const curr = dates[i];
    const diff = Math.floor((prev - curr) / (1000 * 60 * 60 * 24));
    if (diff === 1) {
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
