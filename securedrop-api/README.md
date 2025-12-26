# SecureDrop Backend API

Backend API service for SecureDrop - handles file operations, MinIO storage, and Keycloak authentication.

## Features

- ✅ Keycloak JWT authentication
- ✅ MinIO pre-signed URL generation
- ✅ PostgreSQL file metadata storage
- ✅ Rate limiting and security headers
- ✅ Automatic bucket creation
- ✅ Database schema initialization

## API Endpoints

All endpoints require `Authorization: Bearer <jwt-token>` header.

### POST /api/files/upload-url

Get pre-signed URL for uploading file to MinIO.

**Request:**

```json
{
  "fileName": "document.pdf",
  "fileType": "application/pdf"
}
```

**Response:**

```json
{
  "uploadUrl": "https://minio:9000/quarantine/...",
  "fileId": "550e8400-e29b-41d4-a716-446655440000",
  "objectName": "user-id/file-id/document.pdf"
}
```

### POST /api/files/transfer

Create file transfer record after upload.

**Request:**

```json
{
  "fileId": "550e8400-e29b-41d4-a716-446655440000",
  "fileName": "document.pdf",
  "fileSize": 1048576,
  "fileType": "application/pdf",
  "recipientEmail": "recipient@example.com",
  "message": "Optional message"
}
```

### GET /api/files/sent

Get files sent by authenticated user.

### GET /api/files/received

Get files received by authenticated user (matched by email).

### GET /api/files/:fileId/download-url

Get pre-signed download URL for approved files.

## Environment Variables

See `.env` file for configuration options:

- `KEYCLOAK_URL` - Keycloak server URL
- `KEYCLOAK_REALM` - Keycloak realm name
- `MINIO_ENDPOINT` - MinIO server endpoint
- `MINIO_ACCESS_KEY` - MinIO access key
- `MINIO_SECRET_KEY` - MinIO secret key
- `DB_HOST` - PostgreSQL host
- `DB_NAME` - Database name
- `DB_USER` - Database user
- `DB_PASSWORD` - Database password

## Running Locally

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run in production mode
npm start
```

## Docker

The service is configured to run in Docker via docker-compose:

```bash
docker-compose up -d api
```

## Database Schema

The API automatically creates the `file_transfers` table on startup:

```sql
CREATE TABLE file_transfers (
  id UUID PRIMARY KEY,
  file_id VARCHAR(255) UNIQUE,
  file_name VARCHAR(500),
  file_size BIGINT,
  file_type VARCHAR(100),
  object_name VARCHAR(1000),
  sender_id VARCHAR(255),
  sender_email VARCHAR(255),
  recipient_email VARCHAR(255),
  message TEXT,
  status VARCHAR(20) DEFAULT 'quarantine',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  scanned_at TIMESTAMP,
  approved_at TIMESTAMP
);
```

## Health Check

GET `/health` - Returns API health status.

## Security

- JWT token validation using Keycloak public keys
- Rate limiting (100 requests per 15 minutes)
- Helmet security headers
- CORS configuration
- File size validation
