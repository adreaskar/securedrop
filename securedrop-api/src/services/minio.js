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

// Upload file to MinIO
async function uploadFile(bucket, objectName, buffer, size, contentType) {
  try {
    await minioClient.putObject(bucket, objectName, buffer, size, {
      "Content-Type": contentType,
    });
    console.log(`✓ Uploaded file to ${bucket}: ${objectName}`);
  } catch (err) {
    console.error("Error uploading file:", err);
    throw err;
  }
}

// Download file from MinIO (returns stream)
async function downloadFile(bucket, objectName) {
  try {
    const stream = await minioClient.getObject(bucket, objectName);
    return stream;
  } catch (err) {
    console.error("Error downloading file:", err);
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

// Delete file from MinIO
async function deleteFile(bucket, objectName) {
  try {
    await minioClient.removeObject(bucket, objectName);
    console.log(`✓ Deleted file from ${bucket}: ${objectName}`);
  } catch (err) {
    console.error("Error deleting file:", err);
    throw err;
  }
}

module.exports = {
  minioClient,
  initBuckets,
  uploadFile,
  downloadFile,
  moveFile,
  getFileMetadata,
  deleteFile,
};
