const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const config = require("./config");
const minioService = require("./services/minio");
const db = require("./services/database");
const filesRoutes = require("./routes/files");

const app = express();

app.set("trust proxy", 1); // Trust first proxy if behind one

// Middleware
app.use(helmet()); // Security headers
app.use(express.json()); // Parse JSON bodies
app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
  }),
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // Limit each IP to 100 requests
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api/", limiter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "securedrop-api",
  });
});

// API Routes
app.use("/api/files", filesRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: config.nodeEnv === "development" ? err.message : undefined,
  });
});

// Initialize services and start server
async function start() {
  try {
    console.log("🚀 Starting SecureDrop API...");

    // Initialize MinIO buckets
    console.log("📦 Initializing MinIO buckets...");
    await minioService.initBuckets();

    // Initialize database
    console.log("💾 Initializing database...");
    await db.initDatabase();

    // Start server
    app.listen(config.port, () => {
      console.log(`✓ Server running on port ${config.port}`);
      console.log(`✓ Environment: ${config.nodeEnv}`);
      console.log(`✓ CORS origin: ${config.cors.origin}`);
      console.log("✨ SecureDrop API is ready!");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  await db.pool.end();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully...");
  await db.pool.end();
  process.exit(0);
});

start();
