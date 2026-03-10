#!/usr/bin/env bash
set -euo pipefail

ISSUER_FILE="./cluster-issuer-traefik.yaml"
DRY_RUN="${DRY_RUN:-false}"


MICROK8S_CMD="microk8s"
KUBECTL_CMD="$MICROK8S_CMD kubectl"
REQUIRED_ADDONS=("traefik" "cert-manager" "observability" "registry" "storage" "hostpath-storage" "dns" "community")

log() { echo -e "\033[1;34m[+]\033[0m $*"; }

cmd() {
  echo "    $ $*"
  if [[ "$DRY_RUN" != "true" ]]; then
    eval "$@"
  fi
}

apply_yaml() {
  local file="$1"
  if [[ -f "$file" ]]; then
    log "Applying file: $file"
    cmd "$KUBECTL_CMD apply -f \"$file\""
  else
    echo "Warning: File $file not found, skipping."
  fi
}

apply_folder() {
  local dir="$1"
  [[ -d "$dir" ]] || return
  log "Applying folder: $dir"
  for f in $(find "$dir" -maxdepth 1 -type f \( -name '*.yaml' -o -name '*.yml' \) | sort -V); do
    apply_yaml "$f"
  done
}

ensure_addons() {
  local missing_addons=()
  log "Checking MicroK8s addons status..."
  local current_status
  current_status=$($MICROK8S_CMD status --format short 2>/dev/null || echo "")

  for addon in "${REQUIRED_ADDONS[@]}"; do
    if echo "$current_status" | grep -qw "$addon"; then
      echo "    - Addon '$addon' is already enabled."
    else
      missing_addons+=("$addon")
    fi
  done

  if [ ${#missing_addons[@]} -gt 0 ]; then
    log "Enabling missing addons: ${missing_addons[*]}"
    
    local ENABLE_CMD="$MICROK8S_CMD enable ${missing_addons[*]}"
    
    # Conditionally append the persistence flag if observability is being enabled
    if echo "${missing_addons[@]}" | grep -qw "observability"; then
      log "Applying persistent volume configuration for Observability stack..."
      ENABLE_CMD="$ENABLE_CMD --kube-prometheus-stack-values=./observability-values.yaml"
    fi
    
    cmd "$ENABLE_CMD"
  else
    log "All required addons are already enabled."
  fi
}


log "Starting deployment (DRY_RUN=$DRY_RUN)"
ensure_addons

if [[ -f "./kustomization.yml" || -f "./kustomization.yaml" ]]; then
  log "Applying root kustomization: ."
  cmd "$KUBECTL_CMD apply -k ."
fi

apply_yaml "$ISSUER_FILE"


FOLDERS=(middleware keycloak minio rabbitmq clamav nodered thingsboard api webapp servicemonitor ingress)

for folder in "${FOLDERS[@]}"; do
  if [[ -d "./$folder" ]]; then
    apply_folder "./$folder"
    if [[ "$DRY_RUN" != "true" ]]; then
        log "Waiting 5 seconds..."
        sleep 5
    fi
  fi
done

log "Deployment completed."
