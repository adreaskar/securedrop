# SecureDrop - Quick Start Guide

## 🚀 Starting the Complete System

### 1. Start all services

```bash
cd /Users/adreaskar/dev/msc/cloud-platforms
docker-compose up -d
```

This will start:

- **PostgreSQL** (port 5432) - Database for Keycloak and SecureDrop
- **Keycloak** (port 8080) - Authentication server
- **MinIO** (port 9000, console 9001) - Object storage
- **SecureDrop API** (port 3001) - Backend API
- **SecureDrop Web App** (port 8081) - Frontend
- **RabbitMQ** (port 5672, management 15672)
- **ClamAV** (port 3310) - Antivirus (for future integration)
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
5. Create a test user in the realm

### 3. Access the Application

- **Frontend**: http://localhost:8081
- **Backend API Health**: http://localhost:3001/health
- **MinIO Console**: http://localhost:9001 (`minioadmin` / `minioadmin`)

### 4. Test File Upload Flow

1. Open http://localhost:8081
2. Click "Sign In with Keycloak"
3. Log in with your Keycloak user
4. You'll be redirected to `/dashboard`
5. Upload a file with a recipient email
6. Check MinIO console - file should be in `quarantine` bucket
7. Check backend logs - file transfer record created

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

## 🐛 Troubleshooting

### Check service status

```bash
docker-compose ps
```

### View API logs

```bash
docker-compose logs -f api
```

### View frontend logs

```bash
docker-compose logs -f webapp
```

### Restart a service

```bash
docker-compose restart api
docker-compose restart webapp
```

### Rebuild after code changes

```bash
docker-compose up -d --build api webapp
```

### Access PostgreSQL

```bash
docker exec -it keycloak-db psql -U admin -d securedrop
```

### Check MinIO buckets

The API creates these buckets automatically:

- `quarantine` - Uploaded files awaiting scan
- `approved` - Clean files ready for download
- `rejected` - Infected files

## 🔄 Development Workflow

### Frontend changes

The frontend has hot-reload enabled. Changes to `securedrop/src/*` will auto-reload.

### Backend changes

The backend uses bind mounts. Restart to apply changes:

```bash
docker-compose restart api
```

Or use nodemon for auto-restart (update package.json script).

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

## 📝 Next Steps

1. **Implement ClamAV virus scanning**
   - Create a scan service that watches quarantine bucket
   - Scan files and move to approved/rejected buckets
2. **Set up Node-RED workflow**
   - Listen for file upload events
   - Trigger ClamAV scan
   - Send email notifications
3. **Add file download in Inbox page**

   - Currently only shows received files
   - Add download button that calls `/api/files/:fileId/download-url`

4. **Implement file expiry**
   - Auto-delete old files from MinIO
   - Add cleanup cron job

## 🔒 Security Notes

- JWT tokens are validated on every API request
- Pre-signed URLs expire after 24 hours
- Rate limiting: 100 requests per 15 minutes
- Files must be approved before download
- User can only download files sent to their email

## 📚 Additional Documentation

- Frontend: `securedrop/SETUP.md`
- Backend: `securedrop-api/README.md`
- Docker Compose: `docker-compose.yml`
