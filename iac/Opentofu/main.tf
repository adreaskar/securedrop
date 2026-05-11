#######################################################
# 1. PROVIDERS
#######################################################

provider "vault" {
  address = "https://vault.securedrop.gr"
}

provider "kubernetes" {
  config_path = "~/.kube/config"
}

#######################################################
# 2. ENGINES & K8S AUTH CONFIGURATION
#######################################################

# Ενεργοποίηση του KV v2
resource "vault_mount" "kvv2" {
  path        = "secret"
  type        = "kv"
  options     = { version = "2" }
  description = "KV Version 2 secret engine mount for Securedrop"
}

# Ενεργοποίηση του Kubernetes Auth Backend
resource "vault_auth_backend" "kubernetes" {
  type = "kubernetes"
}

# Η ΡΥΘΜΙΣΗ ΠΟΥ ΕΚΑΝΕΣ ΠΑΛΙΑ ΜΕ ΤΟ CLI:
# Αντικαθιστά το: vault write auth/kubernetes/config ...
resource "vault_kubernetes_auth_backend_config" "k8s_config" {
  backend            = vault_auth_backend.kubernetes.path
  kubernetes_host    = var.k8s_host.cluster_url
  kubernetes_ca_cert = file("${path.module}/${var.k8s_ca_path.cert}")
}

#######################################################
# 3. SECRETS ΑΝΑ POD
#######################################################

resource "vault_kv_secret_v2" "api_secrets" {
  mount     = vault_mount.kvv2.path
  name      = "securedrop/api"
  data_json = jsonencode(var.api_config)
}

resource "vault_kv_secret_v2" "webapp_secrets" {
  mount     = vault_mount.kvv2.path
  name      = "securedrop/webapp"
  data_json = jsonencode(var.webapp_config)
}

resource "vault_kv_secret_v2" "keycloak_secrets" {
  mount     = vault_mount.kvv2.path
  name      = "securedrop/keycloak"
  data_json = jsonencode(var.keycloak_config)
}

resource "vault_kv_secret_v2" "minio_secrets" {
  mount     = vault_mount.kvv2.path
  name      = "securedrop/minio"
  data_json = jsonencode(var.minio_config)
}

resource "vault_kv_secret_v2" "nodered_secrets" {
  mount     = vault_mount.kvv2.path
  name      = "securedrop/nodered"
  data_json = jsonencode(var.nodered_config)
}

resource "vault_kv_secret_v2" "rabbitmq_secrets" {
  mount     = vault_mount.kvv2.path
  name      = "securedrop/rabbitmq"
  data_json = jsonencode(var.rabbitmq_config)
}

resource "vault_kv_secret_v2" "thingsboard_secrets" {
  mount     = vault_mount.kvv2.path
  name      = "securedrop/thingsboard"
  data_json = jsonencode(var.thingsboard_config)
}

resource "vault_kv_secret_v2" "clamav_secrets" {
  mount     = vault_mount.kvv2.path
  name      = "securedrop/clamav"
  data_json = jsonencode(var.clamav_config)
}

resource "vault_kv_secret_v2" "scanner_secrets" {
  mount     = vault_mount.kvv2.path
  name      = "securedrop/scanner"
  data_json = jsonencode(var.scanner_config)
}

#######################################################
# 4. ΑΥΤΟΜΑΤΟΠΟΙΗΣΗ: K8S SAs, POLICIES & ROLES
#######################################################

locals {
  services = [
    "api", "webapp", "keycloak", "minio", 
    "nodered", "rabbitmq", "thingsboard", 
    "clamav", "scanner"
  ]
}

# Δημιουργία ServiceAccounts στο Kubernetes
resource "kubernetes_service_account_v1" "service_accounts" {
  for_each = toset(local.services)
  metadata {
    name      = "${each.key}-sa"
    namespace = "default"
  }
}

# Δημιουργία Policies στο Vault
resource "vault_policy" "service_policies" {
  for_each = toset(local.services)
  name     = "${each.key}-policy"
  policy   = <<-EOT
    path "${vault_mount.kvv2.path}/data/securedrop/${each.key}" {
      capabilities = ["read"]
    }
  EOT
}

# Δημιουργία Roles στο Vault (Σύνδεση SA -> Policy)
resource "vault_kubernetes_auth_backend_role" "service_roles" {
  for_each = toset(local.services)

  backend                          = vault_auth_backend.kubernetes.path
  role_name                        = "${each.key}-role"
  bound_service_account_names      = [kubernetes_service_account_v1.service_accounts[each.key].metadata[0].name]
  bound_service_account_namespaces = ["default"]
  token_policies                   = [vault_policy.service_policies[each.key].name]
  token_ttl                        = 86400
}