const express = require("express");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const crypto = require("crypto");

const verifyToken = require("../middleware/auth");
const minioService = require("../services/minio");
const db = require("../services/database");
const config = require("../config");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileSize,
  },
});

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function getBucketForStatus(status) {
  switch (status) {
    case "approved":
      return config.minio.buckets.approved;
    case "rejected":
      return config.minio.buckets.rejected;
    case "quarantine":
    case "scanning":
    default:
      return config.minio.buckets.quarantine;
  }
}

function formatFileTransfer(file) {
  return {
    id: file.file_id,
    fileName: file.file_name,
    fileSize: file.file_size,
    fileType: file.file_type,
    recipientEmail: file.recipient_email,
    message: file.message,
    status: file.status,
    createdAt: file.created_at,
    updatedAt: file.updated_at,
    scannedAt: file.scanned_at,
    approvedAt: file.approved_at,
    senderId: file.sender_id,
    senderEmail: file.sender_email,
    cachedScan: file.cached_scan || false,
    cachedFromFileId: file.cached_from_file_id || null,
  };
}

// POST /api/files/upload
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

    const fileId = uuidv4();
    const objectName = `${req.user.id}/${fileId}/${file.originalname}`;

    const fileHash = sha256(file.buffer);
    const previousScan = await db.getCompletedScanByHash(fileHash);

    const cachedScan = Boolean(previousScan);
    const initialStatus = cachedScan ? previousScan.status : "quarantine";
    const targetBucket = getBucketForStatus(initialStatus);

    await minioService.uploadFile(
      targetBucket,
      objectName,
      file.buffer,
      file.size,
      file.mimetype,
    );

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
      fileHash,
      status: initialStatus,
      scanResult: cachedScan
        ? previousScan.scan_result ||
          "Reused previous scan result by SHA-256 hash"
        : null,
      cachedScan,
      cachedFromFileId: cachedScan ? previousScan.file_id : null,
    });

    return res.status(201).json({
      id: fileTransfer.id,
      fileId: fileTransfer.file_id,
      fileName: fileTransfer.file_name,
      fileSize: fileTransfer.file_size,
      fileType: fileTransfer.file_type,
      recipientEmail: fileTransfer.recipient_email,
      message: fileTransfer.message,
      status: fileTransfer.status,
      createdAt: fileTransfer.created_at,
      updatedAt: fileTransfer.updated_at,
      scannedAt: fileTransfer.scanned_at,
      approvedAt: fileTransfer.approved_at,
      senderId: fileTransfer.sender_id,
      senderEmail: fileTransfer.sender_email,
      cachedScan: fileTransfer.cached_scan,
      cachedFromFileId: fileTransfer.cached_from_file_id,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    return res.status(500).json({ error: "Failed to upload file" });
  }
});

// GET /api/files/sent
router.get("/sent", verifyToken, async (req, res) => {
  try {
    const files = await db.getSentFiles(req.user.id);
    return res.json(files.map(formatFileTransfer));
  } catch (error) {
    console.error("Error fetching sent files:", error);
    return res.status(500).json({ error: "Failed to fetch sent files" });
  }
});

// GET /api/files/received
router.get("/received", verifyToken, async (req, res) => {
  try {
    const files = await db.getReceivedFiles(req.user.email);
    return res.json(files.map(formatFileTransfer));
  } catch (error) {
    console.error("Error fetching received files:", error);
    return res.status(500).json({ error: "Failed to fetch received files" });
  }
});

// GET /api/files/:fileId/download
router.get("/:fileId/download", verifyToken, async (req, res) => {
  try {
    const { fileId } = req.params;

    const fileTransfer = await db.getFileTransferById(fileId);

    if (!fileTransfer) {
      return res.status(404).json({ error: "File not found" });
    }

    if (fileTransfer.recipient_email !== req.user.email) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (fileTransfer.status !== "approved") {
      return res.status(403).json({
        error: "File is not available for download",
        status: fileTransfer.status,
      });
    }

    const stream = await minioService.downloadFile(
      config.minio.buckets.approved,
      fileTransfer.object_name,
    );

    res.setHeader("Content-Type", fileTransfer.file_type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileTransfer.file_name}"`,
    );
    res.setHeader("Content-Length", fileTransfer.file_size);

    return stream.pipe(res);
  } catch (error) {
    console.error("Error downloading file:", error);
    return res.status(500).json({ error: "Failed to download file" });
  }
});

// DELETE /api/files/:fileId
router.delete("/:fileId", verifyToken, async (req, res) => {
  try {
    const { fileId } = req.params;

    const fileTransfer = await db.getFileTransferById(fileId);

    if (!fileTransfer) {
      return res.status(404).json({ error: "File not found" });
    }

    if (fileTransfer.sender_id !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const bucket = getBucketForStatus(fileTransfer.status);

    await minioService.deleteFile(bucket, fileTransfer.object_name);

    const deletedRecord = await db.deleteFileTransfer(fileId, req.user.id);

    if (!deletedRecord) {
      return res.status(500).json({ error: "Failed to delete file record" });
    }

    return res.json({
      success: true,
      message: "File deleted successfully",
      fileId,
    });
  } catch (error) {
    console.error("Error deleting file:", error);
    return res.status(500).json({ error: "Failed to delete file" });
  }
});

// POST /api/files/changeStatus
router.post("/changeStatus", async (req, res) => {
  try {
    const { fileId, status, scanResult } = req.body;

    console.log(
      `Received status change for fileId: ${fileId}, status: ${status}`,
    );

    const validStatuses = ["quarantine", "approved", "rejected"];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid status. Must be one of: quarantine, approved, rejected",
      });
    }

    const fileTransfer = await db.getFileTransferById(fileId);

    if (!fileTransfer) {
      return res.status(404).json({ error: "File not found" });
    }

    const updatedFileTransfer = await db.updateFileStatus(
      fileId,
      status,
      scanResult || null,
    );

    if (!updatedFileTransfer) {
      return res.status(404).json({ error: "File not found after update" });
    }

    return res.json({
      success: true,
      message: "File status updated successfully",
      fileId,
      status,
      scanResult: scanResult || null,
      file: {
        id: updatedFileTransfer.file_id,
        fileName: updatedFileTransfer.file_name,
        status: updatedFileTransfer.status,
        updatedAt: updatedFileTransfer.updated_at,
        scannedAt: updatedFileTransfer.scanned_at,
        approvedAt: updatedFileTransfer.approved_at,
        cachedScan: updatedFileTransfer.cached_scan,
      },
    });
  } catch (error) {
    console.error("Error updating file status:", error);
    return res.status(500).json({ error: "Failed to update file status" });
  }
});

module.exports = router;
