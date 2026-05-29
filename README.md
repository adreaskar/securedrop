# SecureDrop - Kubernetes Deployment Guide

Let's deploy SecureDrop on a Kubernetes cluster using **MicroK8s**.

## 📋 Prerequisites

The server must have **MicroK8s** and **Docker** installed.

## 🧱 Firewall Configuration (UFW)

To make the UIs of the services accessible, the following ports must be opened on the server:

```bash
sudo ufw allow 80
sudo ufw allow 443
```

## 🚀 Deployment

```bash

git clone https://github.com/adreaskar/securedrop.git
cd securedrop/k8s

# Dry run (preview only)
DRY_RUN=true ./deploy.sh

# Real deployment
./deploy.sh

```

## 📂 Project Structure

```text
k8s/
├─ api/                        # API (backend services)
│  ├─ 01-deployment.yml
│  └─ 02-service.yml
├─ clamav/                     # ClamAV antivirus service for file scanning
│  ├─ 01-storage.yaml
│  ├─ 02-deployment.yaml
│  └─ 03-service.yaml
├─ ingress/                    # Ingress  (SSL, block metrics)
│  ├─ ingress-block-metrics.yaml
│  └─ ssl-ingress-traefik.yaml
├─ keycloak/                   # Identity & Access Management
│  ├─ 01-deployment.yaml
│  └─ 02-service.yaml
├─ middleware/                 # Traefik Middlewares (CRDs for routing, security, redirects)
│  ├─ middleware-block.yaml
│  └─ redirect-middleware.yaml
├─ minio/                      # MinIO object storage (S3-compatible)
│  ├─ 01-storage.yaml
│  ├─ 02-deployment.yaml
│  ├─ 03-service.yaml
│  └─ 04-minio-setup-script.yaml
├─ nodered/                    # Node-RED for IoT flows, automation, and service integration
│  ├─ 01-storage.yaml
│  ├─ 02-deployment.yml
│  └─ 03-service.yml
├─ rabbitmq/                   # RabbitMQ message broker for asynchronous communication
│  ├─ 01-storage.yaml
│  ├─ 02-rabbitmq-topology.yaml
│  ├─ 03-deployment.yaml
│  └─ 04-service.yaml
├─ servicemonitor/             # Prometheus ServiceMonitors for observability
│  ├─ clamav-monitor.yaml
│  ├─ keycloak-monitor.yaml
│  ├─ minio-monitor.yaml
│  └─ rabbitmq-monitor.yaml
├─ thingsboard/                 # Dashboard For clients
│  ├─ 01-storage.yaml
│  ├─ 02-deployment.yaml
│  └─ 03-service.yaml
├─ webapp/                      # Frontend web application
│  ├─ 01-deployment.yaml
│  └─ 02-service.yaml
├─ cluster-issuer-traefik.yaml  # ClusterIssuer for cert-manager / Traefik
├─ deploy.sh                    # Script For Deployment
├─ .env.example                 # Example environment variables
├─ kustomization.yml            # Root kustomization (namespace, secrets, configs)
└─ README.md                    # Project documentation
```
