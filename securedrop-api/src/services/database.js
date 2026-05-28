const { Pool } = require("pg");
const config = require("../config");

const pool = new Pool({
  connectionString:
    process.env.SUPABASE_DB_URL || config.database.connectionString,
  ssl: config.database.ssl,
});

function sanitizeText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  return String(value)
    .replace(/\u0000/g, "")
    .replace(/\x00/g, "")
    .trim();
}

// Initialize database schema
async function initDatabase() {
  const client = await pool.connect();

  try {
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
        approved_at TIMESTAMP,
        file_hash VARCHAR(64),
        scan_result TEXT,
        cached_scan BOOLEAN NOT NULL DEFAULT FALSE,
        cached_from_file_id VARCHAR(255)
      );
    `);

    await client.query(`
      ALTER TABLE file_transfers
        ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64);

      ALTER TABLE file_transfers
        ADD COLUMN IF NOT EXISTS scan_result TEXT;

      ALTER TABLE file_transfers
        ADD COLUMN IF NOT EXISTS cached_scan BOOLEAN NOT NULL DEFAULT FALSE;

      ALTER TABLE file_transfers
        ADD COLUMN IF NOT EXISTS cached_from_file_id VARCHAR(255);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sender_id ON file_transfers(sender_id);
      CREATE INDEX IF NOT EXISTS idx_recipient_email ON file_transfers(recipient_email);
      CREATE INDEX IF NOT EXISTS idx_status ON file_transfers(status);
      CREATE INDEX IF NOT EXISTS idx_file_id ON file_transfers(file_id);
      CREATE INDEX IF NOT EXISTS idx_file_hash ON file_transfers(file_hash);
      CREATE INDEX IF NOT EXISTS idx_file_hash_status ON file_transfers(file_hash, status);
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
    const status = data.status || "quarantine";
    const isFinalStatus = status === "approved" || status === "rejected";
    const isApproved = status === "approved";

    const result = await client.query(
      `INSERT INTO file_transfers (
        file_id,
        file_name,
        file_size,
        file_type,
        object_name,
        sender_id,
        sender_email,
        recipient_email,
        message,
        status,
        file_hash,
        scan_result,
        cached_scan,
        cached_from_file_id,
        scanned_at,
        approved_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10::varchar,
        $11, $12, $13, $14,
        CASE WHEN $15::boolean THEN NOW() ELSE NULL END,
        CASE WHEN $16::boolean THEN NOW() ELSE NULL END
      )
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
        status,
        data.fileHash || null,
        sanitizeText(data.scanResult),
        Boolean(data.cachedScan),
        data.cachedFromFileId || null,
        isFinalStatus,
        isApproved,
      ]
    );

    return result.rows[0];
  } finally {
    client.release();
  }
}

// Find previous completed scan by file hash
async function getCompletedScanByHash(fileHash) {
  if (!fileHash) {
    return null;
  }

  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT *
       FROM file_transfers
       WHERE file_hash = $1
         AND status IN ('approved', 'rejected')
       ORDER BY scanned_at DESC NULLS LAST, updated_at DESC, created_at DESC
       LIMIT 1`,
      [fileHash]
    );

    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

// Get files sent by user
async function getSentFiles(senderId) {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT id,
              file_id,
              file_name,
              file_size,
              file_type,
              sender_id,
              sender_email,
              recipient_email,
              message,
              status,
              created_at,
              updated_at,
              scanned_at,
              approved_at,
              file_hash,
              scan_result,
              cached_scan,
              cached_from_file_id
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

// Get files received by user
async function getReceivedFiles(recipientEmail) {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT id,
              file_id,
              file_name,
              file_size,
              file_type,
              sender_id,
              sender_email,
              recipient_email,
              message,
              status,
              created_at,
              updated_at,
              scanned_at,
              approved_at,
              file_hash,
              scan_result,
              cached_scan,
              cached_from_file_id
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

// Get file transfer by fileId
async function getFileTransferById(fileId) {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT *
       FROM file_transfers
       WHERE file_id = $1`,
      [fileId]
    );

    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

// Update file transfer status
async function updateFileStatus(fileId, status, scanResult = null) {
  const client = await pool.connect();

  try {
    const cleanScanResult = sanitizeText(scanResult);

    const result = await client.query(
      `UPDATE file_transfers
       SET status = $1::varchar,
           scan_result = COALESCE($2, scan_result),
           scanned_at = CASE
             WHEN $1::varchar IN ('approved', 'rejected') THEN NOW()
             ELSE scanned_at
           END,
           approved_at = CASE
             WHEN $1::varchar = 'approved' THEN NOW()
             ELSE approved_at
           END,
           updated_at = NOW()
       WHERE file_id = $3
       RETURNING *`,
      [status, cleanScanResult, fileId]
    );

    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

// Delete file transfer record
async function deleteFileTransfer(fileId, senderId) {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `DELETE FROM file_transfers
       WHERE file_id = $1 AND sender_id = $2
       RETURNING *`,
      [fileId, senderId]
    );

    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initDatabase,
  createFileTransfer,
  getCompletedScanByHash,
  getSentFiles,
  getReceivedFiles,
  getFileTransferById,
  updateFileStatus,
  deleteFileTransfer,
};