# SecureDrop — OpenTofu (Vault Configuration)

Οδηγίες εκτέλεσης του OpenTofu για τη διαμόρφωση του HashiCorp Vault και τη σύνδεσή του με το Kubernetes cluster.

---

## Προαπαιτούμενα

- OpenTofu εγκατεστημένο στο local μηχάνημα
- Vault ήδη εγκατεστημένο και unsealed (βλ. Ansible playbooks)
- `kubectl` ρυθμισμένο με πρόσβαση στο cluster (`~/.kube/config`)
- Vault token με δικαιώματα διαχειριστή

```bash
# Έλεγχος OpenTofu
tofu version

# Έλεγχος Vault connectivity
vault status

# Έλεγχος Kubernetes connectivity
kubectl get nodes
```

---

## Ρύθμιση Μεταβλητών

**1. Αντέγραψε και συμπλήρωσε το secrets.tfvars:**
```bash
cp secrets.tfvars_EXAMPLE secrets.tfvars
```

Συμπλήρωσε όλες τις κενές τιμές για κάθε service (passwords, URLs, API keys).

**2. Αντέγραψε το CA certificate του cluster:**
```bash
cp k8s-ca.crt_EXAMPLE k8s-ca.crt
```

Αντικατάστησε το περιεχόμενο με το πραγματικό CA certificate του MicroK8s cluster:
```bash
microk8s kubectl config view --raw \
  -o jsonpath='{.clusters[0].cluster.certificate-authority-data}' \
  | base64 -d > k8s-ca.crt
```

**3. Ενημέρωσε το cluster URL στο secrets.tfvars:**
```hcl
k8s_host = {
  cluster_url = "https://<VM1-IP>:16443"
}
```

> ⚠️ Τα αρχεία `secrets.tfvars` και `k8s-ca.crt` δεν ανεβαίνουν ποτέ στο repository.

---

## Ρύθμιση Vault Token

Το OpenTofu χρειάζεται Vault token για να επικοινωνήσει με τον Vault server:

```bash
export VAULT_TOKEN="<your-root-token>"
export VAULT_ADDR="https://vault.securedrop.gr"
```

---

## Εκτέλεση

**Βήμα 1 — Αρχικοποίηση providers:**
```bash
tofu init
```

**Βήμα 2 — Έλεγχος αλλαγών (dry-run):**
```bash
tofu plan -var-file="secrets.tfvars"
```

**Βήμα 3 — Εφαρμογή:**
```bash
tofu apply -var-file="secrets.tfvars"
```

Επιβεβαίωσε με `yes` όταν ζητηθεί.

---

## Τι δημιουργείται

Μετά την επιτυχή εκτέλεση, το OpenTofu έχει:

- Ενεργοποιήσει το **KV v2 secret engine** στο path `secret/`
- Ενεργοποιήσει και ρυθμίσει το **Kubernetes Auth Backend**
- Εισάγει τα secrets για όλες τις υπηρεσίες στο Vault:
  - `secret/securedrop/api`
  - `secret/securedrop/webapp`
  - `secret/securedrop/keycloak`
  - `secret/securedrop/minio`
  - `secret/securedrop/nodered`
  - `secret/securedrop/rabbitmq`
  - `secret/securedrop/thingsboard`
  - `secret/securedrop/clamav`
  - `secret/securedrop/scanner`
- Δημιουργήσει για κάθε υπηρεσία: **ServiceAccount**, **Vault Policy** και **Vault Role**

---

## Χρήσιμες Εντολές

```bash
# Προβολή τρέχουσας κατάστασης
tofu show

# Καταστροφή όλων των resources (ΠΡΟΣΟΧΗ)
tofu destroy -var-file="secrets.tfvars"

# Ενημέρωση συγκεκριμένου resource
tofu apply -var-file="secrets.tfvars" -target=vault_kv_secret_v2.api_secrets

# Έλεγχος secrets στο Vault
vault kv get secret/securedrop/api
```
