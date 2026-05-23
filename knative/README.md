# Knative Platform

Installed version:

- Knative Serving: knative-v1.22.0
- net-kourier: knative-v1.22.0

This folder stores the knative platform configuration as code.

## Install on a new cluster

```bash
kubectl apply -f knative/00-serving-crds.yaml
kubectl apply -k knative/core
kubectl apply -k knative/kourier
```

## Verify
```bash
kubectl get pods -n knative-serving
kubectl get pods -n kourier-system
kubectl get svc -n kourier-system
kubectl get configmap config-network -n knative-serving -o yaml | grep ingress-class -A2
kubectl get configmap config-domain -n knative-serving -o yaml | grep -E "svc.cluster.local|example.com"
```

Expected:

config-network.data.ingress-class = kourier.ingress.networking.knative.dev
config-domain.data.svc.cluster.local = ""
Knative services are cluster-local, e.g. http://securedrop-scanner.default.svc.cluster.local