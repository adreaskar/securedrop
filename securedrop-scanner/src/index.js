const amqp = require("amqplib");
const Minio = require("minio");
const net = require("net");
const axios = require("axios");

const {
  RABBITMQ_URL,
  QUEUE_NAME = "file.uploaded",
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
  WORKER_PREFETCH = "1"
} = process.env;

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

function extractInfo(event) {
  console.log("RAW EVENT:", JSON.stringify(event));

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

async function handle(msg, ch) {
  try {
    const event = JSON.parse(msg.content.toString());
    const { bucket, objectKey, fileId } = extractInfo(event);

    console.log(`Scanning: ${bucket}/${objectKey}`);

    const stream = await minio.getObject(bucket, objectKey);
    const scan = await scanStream(stream);

    if (scan.clean) {
      console.log(`CLEAN: ${objectKey}`);
      await moveObject(bucket, APPROVED_BUCKET, objectKey);
      await updateStatus(fileId, "approved", scan.result);
    } else {
      console.log(`INFECTED: ${objectKey} => ${scan.result}`);
      await moveObject(bucket, REJECTED_BUCKET, objectKey);
      await updateStatus(fileId, "rejected", scan.result);
    }

    ch.ack(msg);
  } catch (err) {
    console.error("ERROR:", err.message);

    // Προσωρινά requeue=false για να μη μπει σε άπειρο retry loop όσο κάνουμε debug.
    // Αργότερα το κάνουμε DLQ/retry policy.
    ch.nack(msg, false, false);
  }
}

async function main() {
  if (!RABBITMQ_URL) throw new Error("Missing RABBITMQ_URL");
  if (!MINIO_ENDPOINT) throw new Error("Missing MINIO_ENDPOINT");
  if (!MINIO_ACCESS_KEY) throw new Error("Missing MINIO_ACCESS_KEY");
  if (!MINIO_SECRET_KEY) throw new Error("Missing MINIO_SECRET_KEY");
  if (!API_BASE_URL) throw new Error("Missing API_BASE_URL");

  const conn = await amqp.connect(RABBITMQ_URL);
  const ch = await conn.createChannel();

  await ch.assertQueue(QUEUE_NAME, { durable: true });
  ch.prefetch(Number(WORKER_PREFETCH));

  console.log(`Scanner ready. queue=${QUEUE_NAME}`);

  ch.consume(QUEUE_NAME, msg => {
    if (msg) handle(msg, ch);
  });
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
