# SecureDrop

Πλατφόρμα ασφαλούς μεταφοράς αρχείων με antivirus scanning, authentication και πλήρες CI/CD pipeline.

---

## 🏭 Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   LOCAL DEVELOPMENT                  │
│              Docker Compose (all services)           │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                     PRODUCTION                       │
│                                                      │
│  git push → Jenkins (CI) → ArgoCD (CD) → MicroK8s  │
│                                                      │
│  Ansible   → VM setup, MicroK8s, Vault              │
│  OpenTofu  → Secrets, Kubernetes RBAC               │
└─────────────────────────────────────────────────────┘
```

---

## 🏭 Production Deployment

Για production, η πλατφόρμα τρέχει σε MicroK8s με πλήρες GitOps CI/CD pipeline:

| Εργαλείο | Ρόλος |
|---|---|
| Ansible | VM setup, MicroK8s installation, Vault initialization |
| OpenTofu | Secrets management, Kubernetes RBAC |
| Jenkins | CI — Docker image builds, linting, security scanning (Trivy) |
| ArgoCD | CD — GitOps sync από το `manifests` branch στο cluster |

Οδηγίες ανάπτυξης:
- **Ansible**: `ansible/README.md`
- **OpenTofu**: `opentofu/README.md`
- **Kubernetes manifests**: `k8s/README.md`

---

## 🚀 Local Development (Docker Compose)

Για τοπική δοκιμή όλων των υπηρεσιών:

### 1. Εκκίνηση υπηρεσιών

```bash
cd securedrop
docker compose up -d
```

Εκκινεί:
- **Keycloak** (port 8080) — Authentication server
- **PostgreSQL for Keycloak** (port 5432) — Database για Keycloak
- **MinIO** (port 9000, console 9001) — Object storage
- **SecureDrop Web App** (port 8081) — Frontend application
- **SecureDrop API** (port 3001) — Backend API
- **PostgreSQL for API** (port 5433) — Database για SecureDrop API
- **RabbitMQ** (port 5672, management 15672) — Message broker
- **ClamAV** (port 3310) — Antivirus engine
- **stateless-scanner** — Λαμβάνει αρχεία από RabbitMQ και τα στέλνει στο ClamAV
- **Node-RED** (port 1880) — Workflow automation
- **ThingsBoard** (port 8070) — IoT platform

### 2. UI Addresses

| Service | URL | Credentials |
|---|---|---|
| Frontend | http://localhost:8081 | Keycloak user |
| MinIO | http://localhost:9001 | `minioadmin` / `minioadmin` |
| RabbitMQ | http://localhost:15672 | `user` / `password` |
| Node-RED | http://localhost:1880 | — |
| ThingsBoard | http://localhost:8070 | `tenant@thingsboard.org` / `tenant` |

### 3. Deploy Node-RED flow

1. Άνοιξε http://localhost:1880
2. Κάνε Deploy το υπάρχον flow
3. Όλες οι συνδέσεις πρέπει να έχουν πράσινη ένδειξη

### 4. Test application

1. Άνοιξε http://localhost:8081
2. Κάνε "Sign In with Keycloak" (ή εγγραφή)
3. Σύνδεση με Keycloak user → redirect στο `/dashboard`
4. Ανέβασε αρχείο και όρισε recipient email
5. Έλεγξε το MinIO — το αρχείο πρέπει να είναι στο `quarantine` bucket
6. Το UI κάνει poll κάθε 5 δευτερόλεπτα για status updates
7. Το ClamAV σκανάρει το αρχείο μέσω του stateless-scanner
8. Μετά την έγκριση, ο παραλήπτης μπορεί να κατεβάσει το αρχείο από το Inbox

---

## 📦 Backend API

Όλα τα endpoints απαιτούν JWT token από το Keycloak στο header:
```
Authorization: Bearer <token>
```

### File Upload Flow

```
1. Frontend: POST /api/files/upload (multipart/form-data)
   ↓ Upload file + metadata στο backend API
   ↓ Backend λαμβάνει το αρχείο στη μνήμη (multer)
   ↓ Backend ανεβάζει το αρχείο στο MinIO quarantine bucket
   ↓ Backend δημιουργεί transfer record στη βάση (status: "pending")
   ↓ MinIO στέλνει notification στο RabbitMQ
   ↓ Returns file metadata στο frontend

2. stateless-scanner λαμβάνει το μήνυμα από το RabbitMQ
   ↓ Στέλνει το αρχείο στο ClamAV για scanning
   ↓ ClamAV επιστρέφει αποτέλεσμα (clean / infected)
   ↓ scanner καλεί POST /api/files/changeStatus
   ↓ Status ενημερώνεται σε "approved" ή "rejected"
   ↓ Node-RED workflow μετακινεί το αρχείο στο αντίστοιχο bucket

3. Frontend polls GET /api/files/sent ή /api/files/received
   ↓ Λαμβάνει ενημερωμένο status κάθε 5 δευτερόλεπτα

4. User downloads: GET /api/files/:fileId/download
   ↓ Backend επαληθεύει ότι το status είναι "approved"
   ↓ Backend κάνει stream το αρχείο από MinIO στον χρήστη
```

### User Endpoints (Require JWT)

- `POST /api/files/upload` — Upload αρχείου με multipart/form-data
  - Form fields: `file` (binary), `recipientEmail` (string)
  - Returns: file metadata με `fileId` και αρχικό status
- `GET /api/files/sent` — Αρχεία που έστειλε ο χρήστης
- `GET /api/files/received` — Αρχεία που έχει λάβει ο χρήστης
- `GET /api/files/:fileId/download` — Download εγκεκριμένου αρχείου (stream από MinIO)
- `DELETE /api/files/:fileId` — Διαγραφή αρχείου (μόνο ο αποστολέας)

### External Service Endpoints (No Auth Required)

- `POST /api/files/changeStatus` — Ενημέρωση status αρχείου μετά το scanning
  ```json
  {
    "fileId": "uuid-of-file",
    "status": "approved",
    "scanResult": "Clean"
  }
  ```
  > Αυτό το endpoint καλείται από τον stateless-scanner μέσω RabbitMQ queue. Ενημερώνει μόνο το status στη βάση. Η μετακίνηση αρχείων μεταξύ buckets γίνεται από το Node-RED workflow.

---

## 🧹 Cleanup

```bash
# Διακοπή υπηρεσιών
docker compose down

# Διαγραφή volumes (διαγράφει όλα τα δεδομένα)
docker compose down -v

# Διαγραφή όλων συμπεριλαμβανομένων των images
docker compose down -v --rmi all
```

---

## 🔒 Security Notes

- JWT tokens επαληθεύονται σε κάθε API request
- Rate limiting: 100 requests ανά 5 λεπτά
- Τα αρχεία απαιτούν έγκριση πριν το download
- Ο χρήστης μπορεί να κατεβάσει μόνο αρχεία που του έχουν σταλεί
- Στην production, όλα τα secrets διαχειρίζονται από HashiCorp Vault