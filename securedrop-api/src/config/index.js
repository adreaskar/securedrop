require("dotenv").config();

module.exports = {
  // Server
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || "development",

  // Keycloak
  keycloak: {
    url: process.env.KEYCLOAK_URL || "http://localhost:8080",
    realm: process.env.KEYCLOAK_REALM || "securedrop-realm",
    clientId: process.env.KEYCLOAK_CLIENT_ID || "web-app",
  },

  // MinIO
  minio: {
    endPoint: process.env.MINIO_ENDPOINT || "minio",
    port: parseInt(process.env.MINIO_PORT) || 9000,
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
    buckets: {
      quarantine: "quarantine",
      approved: "approved",
      rejected: "rejected",
    },
  },

  // PostgreSQL
  database: {
    host: process.env.DB_HOST || "db",
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || "securedrop",
    user: process.env.DB_USER || "admin",
    password: process.env.DB_PASSWORD || "adminpassword",
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false, // Add this
    connectionString: process.env.SUPABASE_DB_URL, // Add this
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:8081",
  },

  // File upload limits
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB
};
