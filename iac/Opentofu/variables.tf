variable "api_config" {
  type        = map(string)
  description = "Όλες οι ρυθμίσεις και τα μυστικά για το Securedrop API"
  sensitive   = true
}

variable "webapp_config" { 
    type = map(string) 
    sensitive = true 
}

variable "keycloak_config" {
    type = map(string)
    sensitive = true 
}

variable "minio_config" {
    type = map(string)
    sensitive = true 
}

variable "nodered_config" {
    type = map(string)
    sensitive = true 
}

variable "rabbitmq_config" {
    type = map(string)
    sensitive = true
}

variable "thingsboard_config" {
    type = map(string)
    sensitive = true 
}

variable "clamav_config" {
  type        = map(string)
  description = "Ρυθμίσεις ClamAV από το tfvars"
}

variable "scanner_config" {
  type        = map(string)
  description = "Ρυθμίσεις scanner από το tfvars"
}

variable "k8s_host" {
  description = "Το URL του Kubernetes API"
  type        = map(string)
}

variable "k8s_ca_path" {
  description = "Η διαδρομή για το πιστοποιητικό CA"
  type        = map(string)
}