# SecureDrop — Ansible Playbooks

Οδηγίες εκτέλεσης των Ansible playbooks για την προετοιμασία και ανάπτυξη της πλατφόρμας SecureDrop.

---

## Προαπαιτούμενα

- Ansible εγκατεστημένο στο local μηχάνημα
- SSH πρόσβαση και στα δύο VMs με root ή sudo user
- Python 3 στα VMs

```bash
pip install ansible
```

---

## Ρύθμιση Inventory & Variables

**1. Αντέγραψε και συμπλήρωσε το inventory:**
```bash
cp hosts.ini_EXAMPLE hosts.ini
```

Συμπλήρωσε τις IPs των VM1 και VM2.

**2. Αντέγραψε και συμπλήρωσε τα αρχεία μεταβλητών:**
```bash
cp users_vars_EXAMPLE.yml users_vars_DO_NOT_SHARE.yml
cp microk8s_users_EXAMPLE.yaml microk8s_users.yml
```

- `users_vars_DO_NOT_SHARE.yml` — usernames και SSH public keys των διαχειριστών
- `microk8s_users.yml` — users που θα έχουν πρόσβαση στο cluster και εξωτερική IP του Traefik

> ⚠️ Τα αρχεία `*_DO_NOT_SHARE*` και `*keys*.json` δεν ανεβαίνουν ποτέ στο repository.

---

## Σειρά Εκτέλεσης

### Βήμα 1 — Security Baseline (VM1 & VM2)

```bash
ansible-playbook -i hosts.ini vms_cofiguration.yml
ansible-playbook -i hosts.ini vms_cofiguration.yml
```

Εγκαθιστά UFW, Fail2ban και κλειδώνει το SSH και στα δύο VMs.

---

### Βήμα 2 — Δημιουργία Χρηστών (VM2)

```bash
ansible-playbook -i hosts.ini create_users.yml
```

Δημιουργεί τους admin users με SSH keys και passwordless sudo.

---

### Βήμα 3 — Εγκατάσταση Jenkins & Vault (VM2)

```bash
ansible-playbook -i hosts.ini vm2_install_tools.yml
```

Εγκαθιστά Jenkins (Java 21) και HashiCorp Vault από official repositories.

---

### Βήμα 4 — Αρχικοποίηση Vault (VM2)

```bash
ansible-playbook -i hosts.ini vm2_setup_vault.yml
```

Ρυθμίζει, αρχικοποιεί και αποσφραγίζει το Vault. Τα unseal keys αποθηκεύονται τοπικά στο αρχείο `vault_keys_DO_NOT_SHARE.json`.

> ⚠️ Φύλαξε το αρχείο αυτό σε ασφαλές μέρος. Χωρίς τα keys δεν μπορεί να ξεκλειδωθεί το Vault μετά από restart.

---

### Βήμα 5 — Nginx Reverse Proxy & SSL (VM2)

```bash
ansible-playbook -i hosts.ini vm2_setup_ingress.yml
```

Εγκαθιστά Nginx, εκδίδει πιστοποιητικά Let's Encrypt για `jenkins.securedrop.gr` και `vault.securedrop.gr` και κλείνει την άμεση πρόσβαση στις πόρτες 8080/8200.

> Προϋπόθεση: Τα DNS records να δείχνουν ήδη στην IP του VM2.

---

### Βήμα 6 — Εγκατάσταση MicroK8s (VM1)

```bash
ansible-playbook -i hosts.ini install_microk8s.yaml
```

Εγκαθιστά MicroK8s, ενεργοποιεί τα addons (dns, storage, traefik, cert-manager κλπ) και εγκαθιστά τον Vault Agent Injector μέσω Helm.

---

### Βήμα 7 — Application Deployment (cluster)

```bash
ansible-playbook -i hosts.ini deploy_k8s.yml
```

Τρέχει τοπικά. Εγκαθιστά το Kube-Prometheus-Stack μέσω Helm και εφαρμόζει όλα τα Kubernetes manifests με τη σωστή σειρά.

> Προϋπόθεση: `kubectl` και `helm` να είναι ρυθμισμένα τοπικά και να έχουν πρόσβαση στο cluster.

---

## Χρήσιμες Εντολές

```bash
# Έλεγχος connectivity σε όλα τα hosts
ansible all -i hosts.ini -m ping

# Dry-run ενός playbook (χωρίς αλλαγές)
ansible-playbook -i hosts.ini <playbook>.yml --check

# Εκτέλεση συγκεκριμένου task με tag
ansible-playbook -i hosts.ini <playbook>.yml --tags "<tag>"
```
