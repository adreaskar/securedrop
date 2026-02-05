# SecureDrop - Quick Start Guide

## 🚀 Testing the system on localhost

For the local demo, we will use Docker and Docker Compose to run all services.

Kubernetes files are available in the `k8s/` folder for production deployments.

### 1. Start all services

```bash
cd securedrop
docker compose up -d
```

This will start:

- **Keycloak** (port 8080) - Authentication server
- **PostgreSQL for Keycloak** (port 5432) - Database for Keycloak
- **MinIO** (port 9000, console 9001) - Object storage
- **SecureDrop Web App** (port 8081) - Frontend application
- **SecureDrop API** (port 3001) - Backend API
- **PostgreSQL for API** (port 5433) - Database for SecureDrop API
- **RabbitMQ** (port 5672, management 15672)
- **ClamAV** (port 3310) - Antivirus service
- **Node-RED** (port 1880) - Workflow automation
- **ThingsBoard** (port 8070) - IoT platform

UI's addresses:

- **Frontend**: http://localhost:8081
- **MinIO**: http://localhost:9001 (`minioadmin` / `minioadmin`)
- **RabbitMQ**: http://localhost:15672 (`user` / `password`)
- **Node-RED**: http://localhost:1880
- **ThingsBoard**: http://localhost:8070 (`tenant@thingsboard.org` / `tenant`)

### 2. Deploy Node-RED flow

1. Open http://localhost:1880
2. Deploy the existing flow
3. All connections should have a green indication

### 3. Test application

1. Open http://localhost:8081
2. Click "Sign In with Keycloak" (or register)
3. Log in with your Keycloak user
4. You'll be redirected to `/dashboard`
5. Upload a file and set a recipient email
6. Check MinIO - file should be in `quarantine` bucket
7. The UI will automatically poll every 5 seconds to show status updates
8. ClamAV will scan the file and update its status accordingly
9. Once approved, log in as the recipient and download the file from the Inbox section

## 📦 Backend API

All endpoints require JWT token from Keycloak in `Authorization: Bearer <token>` header.

### File Upload Flow

```
1. Frontend: POST /api/files/upload (multipart/form-data)
   ↓ Upload file + metadata directly to backend API
   ↓ Backend receives file in memory (multer)
   ↓ Backend uploads file to MinIO quarantine bucket
   ↓ Backend creates transfer record in database (status: "pending")
   ↓ Returns file metadata to frontend
2. External virus scanner calls POST /api/files/changeStatus
   ↓ Updates status to "approved" or "rejected"
   ↓ Status stored in database
   ↓ File changes bucket accordingly from node-red workflow
3. Frontend polls GET /api/files/sent or /api/files/received
   ↓ Gets updated file status every 5 seconds
4. User downloads: GET /api/files/:fileId/download
   ↓ Backend verifies status is "approved"
   ↓ Backend streams file from MinIO to user
```

### User Endpoints (Require JWT)

- `POST /api/files/upload` - Upload file with multipart/form-data
  - Form fields: `file` (binary), `recipientEmail` (string),
  - Returns file metadata including `fileId` and initial status
- `GET /api/files/sent` - Your sent files
- `GET /api/files/received` - Files sent to you
- `GET /api/files/:fileId/download` - Download approved files (streams from MinIO)
- `DELETE /api/files/:fileId` - Delete a file you uploaded (sender only)

### External Service Endpoints (No Auth Required)

- `POST /api/files/changeStatus` - Update file status after scanning

  ```json
  {
    "fileId": "uuid-of-file",
    "status": "approved", // or "rejected", "quarantine"
    "scanResult": "Clean" // optional scan details
  }
  ```

  **Note:** This route updates database status only. File movement between buckets is being handled by Node-RED workflow.

## 🧹 Cleanup

### Stop all services

```bash
docker-compose down
```

### Remove volumes (deletes all data)

```bash
docker-compose down -v
```

### Remove everything including images

```bash
docker-compose down -v --rmi all
```

## 🔒 Security Notes

- JWT tokens are validated on every API request
- Rate limiting: 100 requests per 5 minutes
- Files must be approved before download
- User can only download files sent to their email
