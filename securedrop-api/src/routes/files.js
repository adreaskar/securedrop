const express = require("express");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const verifyToken = require("../middleware/auth");
const minioService = require("../services/minio");
const db = require("../services/database");
const config = require("../config");

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileSize, // 50MB default
  },
});

// POST /api/files/upload - Upload file directly to backend
router.post("/upload", verifyToken, upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const { recipientEmail, message } = req.body;

    if (!file) {
      return res.status(400).json({ error: "No file provided" });
    }

    if (!recipientEmail) {
      return res.status(400).json({ error: "recipientEmail is required" });
    }

    // Generate unique file ID
    const fileId = uuidv4();
    const objectName = `${req.user.id}/${fileId}/${file.originalname}`;

    // Upload file to MinIO quarantine bucket
    await minioService.uploadFile(
      config.minio.buckets.quarantine,
      objectName,
      file.buffer,
      file.size,
      file.mimetype
    );

    // Create file transfer record
    const fileTransfer = await db.createFileTransfer({
      fileId,
      fileName: file.originalname,
      fileSize: file.size,
      fileType: file.mimetype,
      objectName,
      senderId: req.user.id,
      senderEmail: req.user.email,
      recipientEmail: recipientEmail.toLowerCase().trim(),
      message,
    });

    // TODO: Trigger virus scan (ClamAV)
    // await triggerVirusScan(fileId);

    res.status(201).json({
      id: fileTransfer.id,
      fileId: fileTransfer.file_id,
      fileName: fileTransfer.file_name,
      fileSize: fileTransfer.file_size,
      fileType: fileTransfer.file_type,
      recipientEmail: fileTransfer.recipient_email,
      message: fileTransfer.message,
      status: fileTransfer.status,
      createdAt: fileTransfer.created_at,
      senderId: fileTransfer.sender_id,
      senderEmail: fileTransfer.sender_email,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// GET /api/files/sent - Get user's sent files
router.get("/sent", verifyToken, async (req, res) => {
  try {
    const files = await db.getSentFiles(req.user.id);

    const formattedFiles = files.map((file) => ({
      id: file.file_id,
      fileName: file.file_name,
      fileSize: file.file_size,
      fileType: file.file_type,
      recipientEmail: file.recipient_email,
      message: file.message,
      status: file.status,
      createdAt: file.created_at,
      senderId: file.sender_id,
      senderEmail: file.sender_email,
    }));

    res.json(formattedFiles);
  } catch (error) {
    console.error("Error fetching sent files:", error);
    res.status(500).json({ error: "Failed to fetch sent files" });
  }
});

// GET /api/files/received - Get user's received files
router.get("/received", verifyToken, async (req, res) => {
  try {
    const files = await db.getReceivedFiles(req.user.email);

    const formattedFiles = files.map((file) => ({
      id: file.file_id,
      fileName: file.file_name,
      fileSize: file.file_size,
      fileType: file.file_type,
      recipientEmail: file.recipient_email,
      message: file.message,
      status: file.status,
      createdAt: file.created_at,
      senderId: file.sender_id,
      senderEmail: file.sender_email,
    }));

    res.json(formattedFiles);
  } catch (error) {
    console.error("Error fetching received files:", error);
    res.status(500).json({ error: "Failed to fetch received files" });
  }
});

// GET /api/files/:fileId/download - Download file
router.get("/:fileId/download", verifyToken, async (req, res) => {
  try {
    const { fileId } = req.params;

    // Get file transfer record
    const fileTransfer = await db.getFileTransferById(fileId);

    if (!fileTransfer) {
      return res.status(404).json({ error: "File not found" });
    }

    // Verify user is the recipient
    if (fileTransfer.recipient_email !== req.user.email) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Verify file is approved
    if (fileTransfer.status !== "approved") {
      return res.status(403).json({
        error: "File is not available for download",
        status: fileTransfer.status,
      });
    }

    // Stream file from MinIO
    const stream = await minioService.downloadFile(
      config.minio.buckets.approved,
      fileTransfer.object_name
    );

    // Set headers for file download
    res.setHeader("Content-Type", fileTransfer.file_type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileTransfer.file_name}"`
    );
    res.setHeader("Content-Length", fileTransfer.file_size);

    // Pipe the stream to response
    stream.pipe(res);
  } catch (error) {
    console.error("Error downloading file:", error);
    res.status(500).json({ error: "Failed to download file" });
  }
});

module.exports = router;
