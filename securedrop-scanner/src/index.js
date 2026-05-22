const express = require("express");
const Minio = require("minio");
const net = require("net");
const axios = require("axios");

const {
  MINIO_ENDPOINT,
  MINIO_PORT = "9000",
  MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY,
  SOURCE_BUCKET = "test",
  APPROVED_BUCKET = "approved",
  REJECTED_BUCKET = "rejected",
  CLAMAV_HOST = "clamav",
  CLAMAV_PORT = "3310",
  API_BASE_URL,
  PORT = "8080"
} = process.env;

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
}

requireEnv("MINIO_ENDPOINT", MINIO_ENDPOINT);
requireEnv("MINIO_ACCESS_KEY", MINIO_ACCESS_KEY);
requireEnv("MINIO_SECRET_KEY", MINIO_SECRET_KEY);
requireEnv("API_BASE_URL", API_BASE_URL);

const minio = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: Number(MINIO_PORT),
  useSSL: false,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY
});

function decodeObjectKey(rawKey) {
  return decodeURIComponent(String(rawKey).replace(/\+/g, " "));
}

function extractInfoFromMinioEvent(event) {
  console.log("RAW MINIO EVENT:", JSON.stringify(event));

  const record = event.Records?.[0];

  if (!record?.s3?.object?.key) {
    throw new Error("Missing object key in MinIO event");
  }

  const bucket = record.s3.bucket?.name || SOURCE_BUCKET;
  const objectKey = decodeObjectKey(record.s3.object.key);

  const parts = objectKey.split("/");
  const fileId = parts.length >= 2 ? parts[1] : null;

  if (!fileId) {
    throw new Error(`Cannot extract fileId from objectKey=${objectKey}`);
  }

  return { bucket, objectKey, fileId };
}

function extractInfoFromRequest(body) {
  if (body?.Records) {
    return extractInfoFromMinioEvent(body);
  }

  const bucket = body.bucket || SOURCE_BUCKET;
  const objectKey = body.objectKey || body.key;
  const fileId = body.fileId;

  if (!objectKey) {
    throw new Error("Missing objectKey");
  }

  if (!fileId) {
    throw new Error("Missing fileId");
  }

  return {
    bucket,
    objectKey: decodeObjectKey(objectKey),
    fileId
  };
}

function scanStream(stream) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(Number(CLAMAV_PORT), CLAMAV_HOST);
    let response = "";
    let finished = false;

    function fail(err) {
      if (!finished) {
        finished = true;
        reject(err);
      }
    }

    socket.on("connect", () => {
      socket.write("zINSTREAM\0");

      stream.on("data", chunk => {
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length, 0);
        socket.write(size);
        socket.write(chunk);
      });

      stream.on("end", () => {
        socket.write(Buffer.alloc(4));
      });

      stream.on("error", fail);
    });

    socket.on("data", data => {
      response += data.toString();
    });

    socket.on("end", () => {
      if (finished) return;
      finished = true;

      const result = response.trim();

      if (result.includes("FOUND")) {
        resolve({ clean: false, result });
      } else if (result.includes("OK")) {
        resolve({ clean: true, result });
      } else {
        reject(new Error(`Unexpected ClamAV response: ${result}`));
      }
    });

    socket.on("error", fail);
  });
}

async function moveObject(bucketFrom, bucketTo, objectKey) {
  await minio.copyObject(bucketTo, objectKey, `/${bucketFrom}/${objectKey}`);
  await minio.removeObject(bucketFrom, objectKey);
}

async function updateStatus(fileId, status, result) {
  await axios.post(`${API_BASE_URL}/api/files/changeStatus`, {
    fileId,
    status,
    scanResult: result
  });
}

async function processScan({ bucket, objectKey, fileId }) {
  const startedAt = Date.now();

  console.log(`Scanning: ${bucket}/${objectKey}`);

  const stream = await minio.getObject(bucket, objectKey);
  const scan = await scanStream(stream);

  let status;

  if (scan.clean) {
    status = "approved";
    console.log(`CLEAN: ${objectKey}`);
    await moveObject(bucket, APPROVED_BUCKET, objectKey);
  } else {
    status = "rejected";
    console.log(`INFECTED: ${objectKey} => ${scan.result}`);
    await moveObject(bucket, REJECTED_BUCKET, objectKey);
  }

  await updateStatus(fileId, status, scan.result);

  return {
    fileId,
    bucket,
    objectKey,
    status,
    clean: scan.clean,
    scanResult: scan.result,
    scan_duration_ms: Date.now() - startedAt
  };
}

const app = express();

app.use(express.json({ limit: "10mb" }));

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "securedrop-scanner"
  });
});

app.post("/scan", async (req, res) => {
  try {
    const scanInfo = extractInfoFromRequest(req.body);
    const result = await processScan(scanInfo);

    res.status(200).json(result);
  } catch (err) {
    console.error("SCAN ERROR:", err);

    res.status(500).json({
      error: err.message
    });
  }
});

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`Securedrop scanner HTTP service listening on port ${PORT}`);
});