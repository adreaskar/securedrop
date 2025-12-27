# SecureDrop - Quick Start Guide

## 🚀 Starting the Complete System

### 1. Start all services

```bash
cd securedrop
docker compose up -d
```

This will start:

- **PostgreSQL** (port 5432) - Database for Keycloak and SecureDrop
- **Keycloak** (port 8080) - Authentication server
- **MinIO** (port 9000, console 9001) - Object storage
- **SecureDrop Web App** (port 8081) - Frontend application
- **SecureDrop API** (port 3001) - Backend API
- **RabbitMQ** (port 5672, management 15672)
- **ClamAV** (port 3310) - Antivirus service
- **Node-RED** (port 1880) - Workflow automation
- **ThingsBoard** (port 8070) - IoT platform

### 2. Configure Keycloak

1. Open http://localhost:8080
2. Login with `admin` / `adminpassword`
3. Create realm: `securedrop-realm`
4. Create client: `web-app`
   - **Access Type**: `public`
   - **Valid Redirect URIs**: `http://localhost:8081/dashboard`
   - **Web Origins**: `http://localhost:8081`

### 3. Access the Application

- **Frontend**: http://localhost:8081
- **MinIO Console**: http://localhost:9001 (`minioadmin` / `minioadmin`)
- **RabbitMQ Management**: http://localhost:15672 (`user` / `password`)
- **Node-RED**: http://localhost:1880

### 4. Test File Upload Flow

1. Open http://localhost:8081
2. Click "Sign In with Keycloak"
3. Log in with your Keycloak user
4. You'll be redirected to `/dashboard`
5. Upload a file with a recipient email
6. Check MinIO - file should be in `quarantine` bucket

## 📦 Backend API Endpoints

All endpoints require JWT token from Keycloak in `Authorization: Bearer <token>` header.

### File Upload Flow

```
1. POST /api/files/upload-url
   ↓ Get pre-signed URL
2. PUT to MinIO (using pre-signed URL)
   ↓ Upload file directly to MinIO
3. POST /api/files/transfer
   ↓ Create transfer record in database
```

### Other Endpoints

- `GET /api/files/sent` - Your sent files
- `GET /api/files/received` - Files sent to you
- `GET /api/files/:fileId/download-url` - Get download URL for approved files

## 🗄️ Database Schema

The API automatically creates the `file_transfers` table in the `securedrop` database on first startup.

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
- Pre-signed URLs expire after 24 hours
- Rate limiting: 100 requests per 15 minutes
- Files must be approved before download
- User can only download files sent to their email
