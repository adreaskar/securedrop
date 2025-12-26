const Minio = require("minio");
const config = require("../config");

// Initialize MinIO client
const minioClient = new Minio.Client({
  endPoint: config.minio.endPoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
});

// Ensure buckets exist
async function initBuckets() {
  const buckets = Object.values(config.minio.buckets);

  for (const bucket of buckets) {
    try {
      const exists = await minioClient.bucketExists(bucket);
      if (!exists) {
        await minioClient.makeBucket(bucket, "us-east-1");
        console.log(`✓ Created bucket: ${bucket}`);
      } else {
        console.log(`✓ Bucket exists: ${bucket}`);
      }
    } catch (err) {
      console.error(`Error checking/creating bucket ${bucket}:`, err);
    }
  }
}

// Generate pre-signed PUT URL for file upload
async function generateUploadUrl(
  userId,
  fileId,
  fileName,
  expirySeconds = 86400
) {
  const objectName = `${userId}/${fileId}/${fileName}`;
  const bucket = config.minio.buckets.quarantine;

  try {
    const uploadUrl = await minioClient.presignedPutObject(
      bucket,
      objectName,
      expirySeconds
    );
    return { uploadUrl, objectName };
  } catch (err) {
    console.error("Error generating upload URL:", err);
    throw err;
  }
}

// Generate pre-signed GET URL for file download
async function generateDownloadUrl(objectName, expirySeconds = 86400) {
  const bucket = config.minio.buckets.approved;

  try {
    const downloadUrl = await minioClient.presignedGetObject(
      bucket,
      objectName,
      expirySeconds
    );
    return downloadUrl;
  } catch (err) {
    console.error("Error generating download URL:", err);
    throw err;
  }
}

// Move file between buckets (quarantine -> approved/rejected)
async function moveFile(objectName, fromBucket, toBucket) {
  try {
    // Copy to new bucket
    await minioClient.copyObject(
      toBucket,
      objectName,
      `/${fromBucket}/${objectName}`
    );

    // Remove from old bucket
    await minioClient.removeObject(fromBucket, objectName);

    console.log(
      `✓ Moved file from ${fromBucket} to ${toBucket}: ${objectName}`
    );
  } catch (err) {
    console.error("Error moving file:", err);
    throw err;
  }
}

// Get file metadata
async function getFileMetadata(bucket, objectName) {
  try {
    const stat = await minioClient.statObject(bucket, objectName);
    return stat;
  } catch (err) {
    console.error("Error getting file metadata:", err);
    throw err;
  }
}

module.exports = {
  minioClient,
  initBuckets,
  generateUploadUrl,
  generateDownloadUrl,
  moveFile,
  getFileMetadata,
};
