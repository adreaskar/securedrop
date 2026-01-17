#!/usr/bin/env bash
set -euo pipefail


ISSUER_FILE="./cluster-issuer-traefik.yaml"
DRY_RUN="${DRY_RUN:-false}"
KUBECTL="microk8s kubectl"

log() { echo "[+] $*"; }
cmd() { echo "    $ $*"; [[ "$DRY_RUN" == "true" ]] || eval "$@"; }

apply_yaml() {
  local file="$1"
  [[ -f "$file" ]] && cmd "$KUBECTL apply -f \"$file\""
}

apply_folder() {
  local dir="$1"
  [[ -d "$dir" ]] || return
  log "Applying folder: $dir"
  for f in $(find "$dir" -maxdepth 1 -type f \( -name '*.yaml' -o -name '*.yml' \) | sort -V); do
    apply_yaml "$f"
  done
}

log "Starting deployment (DRY_RUN=$DRY_RUN)"

# enable addons if not enabled
microk8s enable traefik cert-manager observability registry storage hostpath-storage dns community

# 1. apply secrets
if [[ -f "./kustomization.yml" || -f "./kustomization.yaml" ]]; then
  log "Applying root kustomization: ."
  cmd "$KUBECTL apply -k ."
fi

# 2. Apply issuer first
apply_yaml "$ISSUER_FILE"

# 3. Apply all component folders in order
for folder in middleware keycloak minio rabbitmq clamav nodered thingsboard api webapp servicemonitor ingress; do
  apply_folder "./$folder"
  sleep 5
done

log "Deployment completed."
