// database.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Create tables
async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS uploads (
      id SERIAL PRIMARY KEY,
      userId BIGINT NOT NULL,
      username TEXT,
      fileId TEXT,
      createdAt TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stats (
      userId BIGINT PRIMARY KEY,
      currentStreak INT DEFAULT 0,
      longestStreak INT DEFAULT 0,
      totalUploads INT DEFAULT 0,
      lastUploadDate DATE
    );
  `);

    // ✅ NEW: timers table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS timers (
      userId BIGINT PRIMARY KEY,
      duration INT NOT NULL,
      startTime BIGINT NOT NULL,
      endTime BIGINT NOT NULL
    );
  `);
}

// Save sketch
async function saveUpload(userId, username, fileId) {
  await pool.query(
    'INSERT INTO uploads (userId, username, fileId) VALUES ($1, $2, $3)',
    [userId, username, fileId]
  );

  // update stats
  const today = new Date().toISOString().slice(0, 10);
  const res = await pool.query('SELECT * FROM stats WHERE userId = $1', [userId]);

  if (res.rows.length === 0) {
    await pool.query(
      'INSERT INTO stats (userId, currentStreak, longestStreak, totalUploads, lastUploadDate) VALUES ($1, 1, 1, 1, $2)',
      [userId, today]
    );
  } else {
    let { currentstreak, longeststreak, totaluploads, lastuploaddate } = res.rows[0];
    totaluploads++;
    if (lastuploaddate === today) {
      // already uploaded today
    } else {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (lastuploaddate === yesterday) {
        currentstreak++;
      } else {
        currentstreak = 1;
      }
      if (currentstreak > longeststreak) longeststreak = currentstreak;
    }
    await pool.query(
      'UPDATE stats SET currentStreak=$1, longestStreak=$2, totalUploads=$3, lastUploadDate=$4 WHERE userId=$5',
      [currentstreak, longeststreak, totaluploads, today, userId]
    );
  }
}

async function getUserStats(userId) {
  const res = await pool.query('SELECT * FROM stats WHERE userId=$1', [userId]);
  if (res.rows.length === 0) {
    return { currentStreak: 0, longestStreak: 0, totalUploads: 0 };
  }
  return res.rows[0];
}

async function markSessionComplete(userId) {
  // for now just noop — already handled in saveUpload
  return;
}

async function hasUploadedToday(userId) {
  const res = await pool.query(
    'SELECT lastUploadDate FROM stats WHERE userId=$1',
    [userId]
  );
  if (res.rows.length === 0) return false;
  const today = new Date().toISOString().slice(0, 10);
  return res.rows[0].lastuploaddate === today;
}

//
// ✅ Timer helpers
//
async function saveTimer(userId, duration, startTime, endTime) {
  await pool.query(
    `INSERT INTO timers (userId, duration, startTime, endTime)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (userId)
     DO UPDATE SET duration=$2, startTime=$3, endTime=$4`,
    [userId, duration, startTime, endTime]
  );
}

async function deleteTimer(userId) {
  await pool.query('DELETE FROM timers WHERE userId=$1', [userId]);
}

async function getAllTimers() {
  const res = await pool.query('SELECT * FROM timers');
  return res.rows;
}

module.exports = {
  initDatabase,
  saveUpload,
  getUserStats,
  markSessionComplete,
  hasUploadedToday,
  saveTimer,
  deleteTimer,
  getAllTimers
};
