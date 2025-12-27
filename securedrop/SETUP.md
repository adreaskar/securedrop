# SecureDrop - Setup Guide

## Overview

SecureDrop is a secure file sharing application with:

- **Keycloak** authentication (port 8080)
- **MinIO** object storage (port 9000)
- **React** frontend (port 8081)

## Current Configuration

### Environment Variables

Your `.env` file is configured with:

```bash
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=securedrop-realm
VITE_KEYCLOAK_CLIENT_ID=web-app
VITE_API_BASE_URL=http://localhost:3001/api
```

### Keycloak Setup (IMPORTANT)

The app is configured to use `/dashboard` as the redirect URI for ALL authentication flows.

**In Keycloak Admin Console → Clients → web-app → Settings:**

- **Valid Redirect URIs**:
  - `http://localhost:8081/dashboard` (exact match)
  - OR `http://localhost:8081/*` (wildcard - recommended for flexibility)
- **Web Origins**:
  - `http://localhost:8081`
- **Valid Post Logout Redirect URIs**:
  - `http://localhost:8081`

**Why `/dashboard`?**

- The frontend specifies `redirectUri: "/dashboard"` in `keycloak.init()`, `keycloak.login()`, and `keycloak.register()`
- This means ALL Keycloak auth responses go to `/dashboard`
- When visiting the homepage `/`, Keycloak still needs a valid redirect URI for SSO checks
- We use `/dashboard` consistently across all flows to avoid "Invalid redirect_uri" errors

## Authentication Flow

1. **User visits** `http://localhost:8081` → Public landing page

   - Keycloak performs silent SSO check (no redirect if not logged in)
   - If already logged in from another tab/session, user info is restored

2. **User clicks "Sign In"** → Redirected to Keycloak login at `http://localhost:8080`

3. **User logs in** → Keycloak redirects to `http://localhost:8081/dashboard`

4. **User logs out** → Redirected back to `http://localhost:8081`

### Public Routes

- `/` (landing page) - No authentication required
- `/auth` - Login/Register page

### Protected Routes

- `/dashboard` - Requires authentication
- `/inbox` - Requires authentication

If a user tries to access protected routes without logging in, they're redirected to `/auth`.

## File Upload Flow (MinIO Integration)

When a user uploads a file in the dashboard:

1. **Frontend requests** pre-signed upload URL from backend API (`POST /api/files/upload-url`)

   - Sends Keycloak JWT token in Authorization header
   - Backend validates token and generates MinIO pre-signed URL

2. **Frontend uploads** file directly to MinIO using pre-signed URL

   - File goes to `quarantine` bucket

3. **Frontend notifies** backend of successful upload (`POST /api/files/transfer`)

   - Backend creates file transfer record in database
   - Backend triggers virus scan (ClamAV integration)

4. **Scanning workflow**:
   - File status: `quarantine` → `scanning` → `approved` or `rejected`
   - If approved: File moved to `approved` bucket
   - Recipient can download from `/inbox`

## Backend API Requirements

You need to implement a backend API at `http://localhost:3001/api` with these endpoints:

### 1. POST /api/files/upload-url

Get pre-signed URL for uploading to MinIO.

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
  "fileId": "uuid"
}
```

### 2. POST /api/files/transfer

Create file transfer record after upload.

**Request:**

```json
{
  "fileId": "uuid",
  "fileName": "document.pdf",
  "fileSize": 1048576,
  "fileType": "application/pdf",
  "recipientEmail": "user@example.com",
  "message": "Optional message"
}
```

### 3. GET /api/files/sent

Get files sent by authenticated user.

### 4. GET /api/files/received

Get files received by authenticated user (matched by email from JWT).

### 5. GET /api/files/:fileId/download-url

Get pre-signed URL for downloading approved files.

**Response:**

```json
{
  "downloadUrl": "https://minio:9000/approved/..."
}
```

## Running the Application

### Start all services:

```bash
cd /Users/adreaskar/dev/msc/cloud-platforms
docker-compose up -d
```

### Access the services:

- **Frontend**: http://localhost:8081
- **Keycloak Admin**: http://localhost:8080 (admin/adminpassword)
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)
- **Node-RED**: http://localhost:1880

## Keycloak Configuration Checklist

In your Keycloak `web-app` client:

- [x] **Valid Redirect URIs**: `http://localhost:8081/dashboard` or `http://localhost:8081/*`
- [x] **Web Origins**: `http://localhost:8081`
- [x] **Valid Post Logout Redirect URIs**: `http://localhost:8081`
- [ ] **Access Type**: `public`
- [ ] **Standard Flow Enabled**: `ON`
- [ ] **Direct Access Grants**: `OFF` (recommended)

## MinIO Bucket Setup

Create these buckets in MinIO:

1. **quarantine** - For uploaded files awaiting scan
2. **approved** - For clean files ready for download
3. **rejected** - For infected files (optional)

## Testing the Flow

1. Start services: `docker-compose up -d`
2. Configure Keycloak realm and client
3. Create MinIO buckets
4. Implement backend API
5. Open http://localhost:8081
6. Click "Sign In with Keycloak"
7. Log in with Keycloak credentials
8. You should be redirected to `/dashboard`
9. Upload a file to test MinIO integration

## Troubleshooting

### Issue: "Redirect URI mismatch"

- Verify Keycloak client has exact URI: `http://localhost:8081/dashboard` or `http://localhost:8081/*`

### Issue: "CORS errors"

- Check Web Origins in Keycloak client: `http://localhost:8081`
- Ensure backend API has CORS enabled for `http://localhost:8081`

### Issue: "Token expired"

- Token auto-refresh is configured in `useAuth.tsx`
- Check Keycloak session timeout settings

### Issue: "File upload fails"

- Verify backend API is running on port 3001
- Check MinIO is accessible at port 9000
- Verify Keycloak JWT token is being sent correctly

## Next Steps

1. **Implement Backend API** - See `BACKEND_API.md` for detailed specifications
2. **Set up ClamAV Integration** - Connect to ClamAV service on port 3310
3. **Configure Node-RED Workflows** - Automate file scanning and notifications
4. **Set up Database** - Store file metadata and transfer records

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Browser   │─────▶│   Keycloak   │      │   MinIO     │
│ :8081       │      │   :8080      │      │   :9000     │
└─────────────┘      └──────────────┘      └─────────────┘
       │                    │                     ▲
       │                    │                     │
       │                JWT Token                 │
       │                    │                     │
       └────────────────────▼─────────────────────┘
                      Backend API
                         :3001
                            │
                            ▼
                   ┌────────────────┐
                   │   PostgreSQL   │
                   │   (metadata)   │
                   └────────────────┘
```

## Security Notes

- JWT tokens are validated by the backend on every API call
- Files are scanned before being made available for download
- Pre-signed URLs expire after 24 hours
- User can only download files they are the recipient of
- All uploads go through quarantine before approval
