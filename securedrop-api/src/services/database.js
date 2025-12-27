const { Pool } = require("pg");
const config = require("../config");

// // Create PostgreSQL connection pool
// const pool = new Pool({
//   host: config.database.host,
//   port: config.database.port,
//   database: config.database.database,
//   user: config.database.user,
//   password: config.database.password,
//   ssl: config.database.ssl || { rejectUnauthorized: false },
// });

const pool = new Pool({
  connectionString:
    process.env.SUPABASE_DB_URL || config.database.connectionString,
  ssl: { rejectUnauthorized: false }, // Required for Supabase
});

// Initialize database schema
async function initDatabase() {
  const client = await pool.connect();
  try {
    // Create file_transfers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS file_transfers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id VARCHAR(255) NOT NULL UNIQUE,
        file_name VARCHAR(500) NOT NULL,
        file_size BIGINT NOT NULL,
        file_type VARCHAR(100) NOT NULL,
        object_name VARCHAR(1000) NOT NULL,
        sender_id VARCHAR(255) NOT NULL,
        sender_email VARCHAR(255) NOT NULL,
        recipient_email VARCHAR(255) NOT NULL,
        message TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'quarantine',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        scanned_at TIMESTAMP,
        approved_at TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_sender_id ON file_transfers(sender_id);
      CREATE INDEX IF NOT EXISTS idx_recipient_email ON file_transfers(recipient_email);
      CREATE INDEX IF NOT EXISTS idx_status ON file_transfers(status);
      CREATE INDEX IF NOT EXISTS idx_file_id ON file_transfers(file_id);
    `);

    console.log("✓ Database initialized");
  } catch (err) {
    console.error("Error initializing database:", err);
    throw err;
  } finally {
    client.release();
  }
}

// Create file transfer record
async function createFileTransfer(data) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO file_transfers (
        file_id, file_name, file_size, file_type, object_name,
        sender_id, sender_email, recipient_email, message, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        data.fileId,
        data.fileName,
        data.fileSize,
        data.fileType,
        data.objectName,
        data.senderId,
        data.senderEmail,
        data.recipientEmail,
        data.message || null,
        "quarantine",
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// Get files sent by user
async function getSentFiles(senderId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, file_id, file_name, file_size, file_type,
              sender_id, sender_email, recipient_email, message,
              status, created_at, updated_at
       FROM file_transfers
       WHERE sender_id = $1
       ORDER BY created_at DESC`,
      [senderId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// Get files received by user (by email)
async function getReceivedFiles(recipientEmail) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, file_id, file_name, file_size, file_type,
              sender_id, sender_email, recipient_email, message,
              status, created_at, updated_at
       FROM file_transfers
       WHERE recipient_email = $1
       ORDER BY created_at DESC`,
      [recipientEmail]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// Get file transfer by ID
async function getFileTransferById(fileId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM file_transfers WHERE file_id = $1`,
      [fileId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// Update file transfer status
async function updateFileStatus(fileId, status) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE file_transfers
       SET status = $1, updated_at = NOW()
       WHERE file_id = $2
       RETURNING *`,
      [status, fileId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// Delete file transfer record
async function deleteFileTransfer(fileId, senderId) {
  const client = await pool.connect();
  try {
    // First verify the file belongs to the sender
    const result = await client.query(
      `DELETE FROM file_transfers
       WHERE file_id = $1 AND sender_id = $2
       RETURNING *`,
      [fileId, senderId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initDatabase,
  createFileTransfer,
  getSentFiles,
  getReceivedFiles,
  getFileTransferById,
  updateFileStatus,
  deleteFileTransfer,
};
