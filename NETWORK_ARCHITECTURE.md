# Network Architecture: Frontend, Backend, and MinIO

## TL;DR

- **Frontend** (`localhost:8081`) runs in **browser** → Uses `localhost` for API and MinIO
- **Backend API** (`minio` service) runs in **Docker** → Uses service names for internal communication
- **MinIO pre-signed URLs** must be accessible from browser → Use `localhost:9000`

## The Issue

When you have services running in Docker, there are **two different network contexts**:

1. **Inside Docker Network**: Containers communicate using service names (`minio`, `keycloak`, `api`)
2. **Outside Docker (Browser)**: Your browser runs on the host machine and uses `localhost` or `127.0.0.1`

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (Host OS)                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  SecureDrop Frontend (React/Vite)                       │ │
│  │  Talks to: localhost:3001 (API)                         │ │
│  │  Talks to: localhost:9000 (MinIO via pre-signed URLs)  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
              │                              │
              │ http://localhost:3001        │ http://localhost:9000
              │                              │
┌─────────────▼──────────────────────────────▼─────────────────┐
│                     Docker Network                            │
│  ┌──────────────────────┐      ┌─────────────────────────┐  │
│  │  securedrop-api      │─────►│  minio (service)        │  │
│  │  Port: 3001          │      │  Port: 9000             │  │
│  │  Talks to MinIO via: │      │                         │  │
│  │  minio:9000          │      │  Pre-signed URLs use:   │  │
│  │                      │      │  localhost:9000         │  │
│  └──────────────────────┘      └─────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

## File Upload Flow

1. **Browser** → `POST /api/files/upload-url` → **Backend API**
2. **Backend API** → Generates pre-signed URL using `minioClientExternal` (with `localhost:9000`)
3. **Backend API** → Returns `http://localhost:9000/quarantine/...?signature=...`
4. **Browser** → `PUT http://localhost:9000/quarantine/...` → **MinIO** (direct upload)
5. **Browser** → `POST /api/files/transfer` → **Backend API** (save metadata)

## Why Two MinIO Clients?

In `/securedrop-api/src/services/minio.js`:

### Internal Client (for backend operations)

```javascript
const minioClient = new Minio.Client({
  endPoint: "minio", // Docker service name
  port: 9000,
  // ...
});
```

Used for:

- Creating/checking buckets
- Moving files between buckets
- Getting file metadata
- Any operation the backend does directly

### External Client (for pre-signed URLs)

```javascript
const minioClientExternal = new Minio.Client({
  endPoint: "localhost", // Browser-accessible host
  port: 9000,
  // ...
});
```

Used for:

- Generating upload URLs for browser
- Generating download URLs for browser
- Any URL that will be used by the browser

## Configuration Files

### Frontend `.env` (`/securedrop/.env`)

```bash
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_API_BASE_URL=http://localhost:3001/api
```

✅ **Uses `localhost`** - Frontend runs in browser

### Backend `.env` (`/securedrop-api/.env`)

```bash
# Internal (for backend-to-MinIO communication)
MINIO_ENDPOINT=minio
MINIO_PORT=9000

# External (for browser-accessible URLs)
MINIO_EXTERNAL_ENDPOINT=localhost
MINIO_EXTERNAL_PORT=9000

# Keycloak (internal)
KEYCLOAK_URL=http://keycloak:8080

# CORS (external)
CORS_ORIGIN=http://localhost:8081
```

✅ **Uses service names for internal**, **localhost for external**

## Production Deployment

When deploying to production with a domain name:

```bash
# Backend .env
MINIO_ENDPOINT=minio  # Internal (stays same)
MINIO_EXTERNAL_ENDPOINT=files.yourdomain.com  # Public domain
KEYCLOAK_URL=http://keycloak:8080  # Internal
CORS_ORIGIN=https://app.yourdomain.com  # Frontend domain
```

The browser will then upload/download using `https://files.yourdomain.com`.

## Common Mistakes

### ❌ Wrong: Using service names in frontend

```typescript
const API_BASE_URL = "http://api:3001/api"; // Browser can't resolve 'api'
```

### ✅ Correct: Using localhost in frontend

```typescript
const API_BASE_URL = "http://localhost:3001/api";
```

### ❌ Wrong: Using localhost in backend for inter-service communication

```javascript
const pool = new Pool({
  host: "localhost", // Won't find other containers
  port: 5432,
});
```

### ✅ Correct: Using service names in backend

```javascript
const pool = new Pool({
  host: "db", // Docker service name
  port: 5432,
});
```

## Testing

After making these changes, test the upload flow:

1. Start services: `docker-compose up -d`
2. Check API logs: `docker-compose logs -f api`
3. Upload a file from the frontend
4. Check the pre-signed URL in browser DevTools Network tab
5. Should see: `http://localhost:9000/quarantine/...` (not `http://minio:9000/...`)

## Summary

| Service         | Runs In | Talks To Backend Via | Talks To MinIO Via                            |
| --------------- | ------- | -------------------- | --------------------------------------------- |
| **Frontend**    | Browser | `localhost:3001`     | `localhost:9000` (pre-signed URLs)            |
| **Backend API** | Docker  | N/A                  | `minio:9000` (internal operations)            |
| **Backend API** | Docker  | N/A                  | `localhost:9000` (generates URLs for browser) |

The key insight: **Pre-signed URLs are used by the browser, so they must use browser-accessible hostnames**.
