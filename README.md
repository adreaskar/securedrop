# SecureDrop — Kubernetes Manifests

Kubernetes manifests για την ανάπτυξη της πλατφόρμας SecureDrop σε MicroK8s cluster.

---

## Προαπαιτούμενα

Πριν από οποιαδήποτε ανάπτυξη, βεβαιώσου ότι έχουν εκτελεστεί τα παρακάτω βήματα:

- ✅ Ansible playbooks (VM setup, MicroK8s installation)
- ✅ OpenTofu (Vault configuration, secrets, ServiceAccounts)
- ✅ `kubectl` ρυθμισμένο με πρόσβαση στο cluster
- ✅ DNS records να δείχνουν στην IP του cluster

---

## Deployment

### Αυτόματο (CI/CD — Προτεινόμενο)

Η ανάπτυξη γίνεται αυτόματα μέσω του CI/CD pipeline:

```
git push origin master
      ↓
Jenkins (build-docker-images)
      ↓
ArgoCD sync (manifests branch)
      ↓
Kubernetes cluster
```

Κάθε push στο `master` branch ενεργοποιεί αυτόματα το Jenkins pipeline που χτίζει τα Docker images, ενημερώνει τα manifests και το ArgoCD κάνει sync στο cluster.

### Χειροκίνητο (μέσω Ansible)

Για την αρχική ανάπτυξη ή έκτακτη χειροκίνητη εφαρμογή:

```bash
cd ansible/
ansible-playbook -i hosts.ini deploy_k8s.yml
```

### Χειροκίνητο (απευθείας kubectl)

```bash
# Εφαρμογή συγκεκριμένου component
kubectl apply -f k8s/api/

# Εφαρμογή όλων με τη σωστή σειρά
kubectl apply -f k8s/middleware/
kubectl apply -f k8s/keycloak/
kubectl apply -f k8s/minio/
kubectl apply -f k8s/rabbitmq/
kubectl apply -f k8s/clamav/
kubectl apply -f k8s/nodered/
kubectl apply -f k8s/thingsboard/
kubectl apply -f k8s/api/
kubectl apply -f k8s/stateless-scanner/
kubectl apply -f k8s/webapp/
kubectl apply -f k8s/servicemonitor/
kubectl apply -f k8s/ingress/
kubectl apply -f k8s/cluster-issuer-traefik.yaml
```

---

## Firewall (UFW)

```bash
sudo ufw allow 80
sudo ufw allow 443
```

---

## Rollback

Για επαναφορά σε προηγούμενη έκδοση, αλλαγή του image tag στο manifest και push:

```bash
# Εύρεση διαθέσιμων tags
docker images securedropgr/api

# Αλλαγή tag στο manifest
sed -i 's|securedropgr/api:.*|securedropgr/api:<previous-tag>|' k8s/api/01-deployment.yml

git add k8s/api/01-deployment.yml
git commit -m "rollback: api to <previous-tag>"
git push origin master
```

Το ArgoCD θα εντοπίσει την αλλαγή και θα κάνει αυτόματα sync.

---

## Project Structure

```text
k8s/
├── api/                        # API (backend service)
├── clamav/                     # ClamAV antivirus engine — εκτελεί το πραγματικό scanning των αρχείων
├── ingress/                    # Ingress (SSL, block metrics)
├── keycloak/                   # Identity & Access Management
├── middleware/                 # Traefik Middlewares (routing, security, redirects)
├── minio/                      # MinIO object storage (S3-compatible)
├── nodered/                    # Node-RED για αυτοματισμούς και service integration
├── rabbitmq/                   # RabbitMQ message broker
├── servicemonitor/             # Prometheus ServiceMonitors για observability
├── stateless-scanner/          # Stateless file streamer to antivirus scanner service
├── thingsboard/                # IoT dashboard
├── webapp/                     # Frontend web application
├── .env.example                # Παράδειγμα environment variables
├── argocd-securedrop-app.yaml  # ArgoCD Application CRD
├── cluster-issuer-traefik.yaml # ClusterIssuer για cert-manager / Traefik
├── kustomization.yml           # Kustomization file
└── observability-values.yaml   # Custom values για το Kube-Prometheus-Stack
```

---

## Χρήσιμες Εντολές

```bash
# Κατάσταση pods
kubectl get pods -o wide

# Logs συγκεκριμένου pod
kubectl logs -f deployment/api

# Κατάσταση πιστοποιητικών SSL
kubectl get certificate,order,challenge

# Κατάσταση ArgoCD sync
kubectl get application -n argocd
```