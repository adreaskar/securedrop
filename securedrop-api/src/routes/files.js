const express = require("express");
const { v4: uuidv4 } = require("uuid");
const verifyToken = require("../middleware/auth");
const minioService = require("../services/minio");
const db = require("../services/database");
const config = require("../config");

const router = express.Router();

// POST /api/files/upload-url - Get pre-signed upload URL
router.post("/upload-url", verifyToken, async (req, res) => {
  try {
    const { fileName, fileType } = req.body;

    if (!fileName || !fileType) {
      return res
        .status(400)
        .json({ error: "fileName and fileType are required" });
    }

    // Generate unique file ID
    const fileId = uuidv4();

    // Generate pre-signed upload URL
    const { uploadUrl, objectName } = await minioService.generateUploadUrl(
      req.user.id,
      fileId,
      fileName
    );

    res.json({
      uploadUrl,
      fileId,
      objectName,
    });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// POST /api/files/transfer - Create file transfer record
router.post("/transfer", verifyToken, async (req, res) => {
  try {
    const { fileId, fileName, fileSize, fileType, recipientEmail, message } =
      req.body;

    if (!fileId || !fileName || !fileSize || !fileType || !recipientEmail) {
      return res.status(400).json({
        error:
          "fileId, fileName, fileSize, fileType, and recipientEmail are required",
      });
    }

    // Validate file size
    if (fileSize > config.maxFileSize) {
      return res.status(400).json({
        error: `File size exceeds maximum allowed size of ${
          config.maxFileSize / (1024 * 1024)
        }MB`,
      });
    }

    // Create object name (same format as generateUploadUrl)
    const objectName = `${req.user.id}/${fileId}/${fileName}`;

    // Create file transfer record
    const fileTransfer = await db.createFileTransfer({
      fileId,
      fileName,
      fileSize,
      fileType,
      objectName,
      senderId: req.user.id,
      senderEmail: req.user.email,
      recipientEmail: recipientEmail.toLowerCase().trim(),
      message,
    });

    // TODO: Trigger virus scan (ClamAV) - implement later
    // For now, auto-approve for testing
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
    console.error("Error creating file transfer:", error);
    res.status(500).json({ error: "Failed to create file transfer" });
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

// GET /api/files/:fileId/download-url - Get pre-signed download URL
router.get("/:fileId/download-url", verifyToken, async (req, res) => {
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

    // Generate pre-signed download URL
    const downloadUrl = await minioService.generateDownloadUrl(
      fileTransfer.object_name
    );

    res.json({ downloadUrl });
  } catch (error) {
    console.error("Error generating download URL:", error);
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

module.exports = router;
