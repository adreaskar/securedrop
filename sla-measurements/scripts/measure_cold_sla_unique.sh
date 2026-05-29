#!/usr/bin/env bash
# measure_cold_sla_unique.sh
# Cold SLA — μετράει latency από scale-to-zero (cold start).
# Μεταξύ κάθε run επαληθεύει ότι ο scanner έχει scaled-to-zero.
#
# Usage:
#   export TOKEN='eyJ...'
#   RUNS=30 RECIPIENT_EMAIL='you@example.com' OUTPUT='cold_30.csv' \
#     ./measure_cold_sla_unique.sh ./load-files

set -euo pipefail

API_URL="${API_URL:-https://api.securedrop.gr/api/files/upload}"
NAMESPACE="${NAMESPACE:-default}"
API_DEPLOY="${API_DEPLOY:-securedrop-api}"
API_CONTAINER="${API_CONTAINER:-securedrop-api}"
SCANNER_LABEL="${SCANNER_LABEL:-serving.knative.dev/service=securedrop-scanner}"
RECIPIENT_EMAIL="${RECIPIENT_EMAIL:-adreas@karabetian.gr}"
RUNS="${RUNS:-30}"
STATUS_TIMEOUT="${STATUS_TIMEOUT:-120}"
SCALE_ZERO_TIMEOUT="${SCALE_ZERO_TIMEOUT:-90}"  # max seconds to wait for scale-to-zero
OUTPUT="${OUTPUT:-cold_sla_results.csv}"
FILE_PREFIX="${FILE_PREFIX:-cold-10mb}"

# ── Validation ───────────────────────────────────────────────────────────────
if [ -z "${TOKEN:-}" ]; then
  echo "ERROR: Set TOKEN env var."; exit 1
fi
if [ $# -lt 1 ]; then
  echo "Usage: TOKEN='...' RUNS=30 $0 <files_dir>"; exit 1
fi
FILES_DIR="$1"
if [ ! -d "$FILES_DIR" ]; then
  echo "ERROR: Directory not found: $FILES_DIR"; exit 1
fi
for run in $(seq 1 "$RUNS"); do
  fp="${FILES_DIR}/${FILE_PREFIX}-${run}.bin"
  if [ ! -f "$fp" ]; then
    echo "ERROR: Missing ${fp} — run generate_test_files.sh first."; exit 1
  fi
done
command -v jq      >/dev/null || { echo "ERROR: jq required";     exit 1; }
command -v microk8s kubectl >/dev/null || { echo "ERROR: microk8s kubectl required"; exit 1; }
command -v curl    >/dev/null || { echo "ERROR: curl required";    exit 1; }
command -v python3 >/dev/null || { echo "ERROR: python3 required"; exit 1; }

# ── Header ───────────────────────────────────────────────────────────────────
echo "run,file_name,file_size,file_id,status,upload_time,completed_time,latency_sec,http_status" > "$OUTPUT"

# ── Helper: verify scale-to-zero before each cold run ───────────────────────
wait_for_scale_to_zero() {
  echo "[cold] Waiting for scanner to scale to zero..."
  local start; start=$(date +%s)
  while true; do
    running=$(
      microk8s kubectl get pods -n "$NAMESPACE" -l "$SCANNER_LABEL" \
        --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l
    )
    total=$(
      microk8s kubectl get pods -n "$NAMESPACE" -l "$SCANNER_LABEL" \
        --no-headers 2>/dev/null | wc -l
    )
    if [ "$total" -eq 0 ]; then
      echo "[cold] Scale-to-zero confirmed (0 pods)"
      return 0
    fi
    now=$(date +%s)
    if [ $((now - start)) -gt "$SCALE_ZERO_TIMEOUT" ]; then
      echo "WARNING: Scale-to-zero timeout after ${SCALE_ZERO_TIMEOUT}s (${total} pods still present)"
      echo "         Continuing anyway — latency may include non-cold-start overhead."
      return 0
    fi
    echo "[cold] Waiting... (${total} pods present, running=${running})"
    sleep 5
  done
}

# ── Helper: status change ────────────────────────────────────────────────────
wait_for_status_change() {
  local file_id="$1"
  local start; start=$(date +%s)
  while true; do
    line=$(
      microk8s kubectl logs -n "$NAMESPACE" "deploy/$API_DEPLOY" -c "$API_CONTAINER" \
        --timestamps --since=30m 2>/dev/null \
        | grep "Received status change for fileId: $file_id" \
        | tail -1 || true
    )
    if [ -n "$line" ]; then echo "$line"; return 0; fi
    now=$(date +%s)
    if [ $((now - start)) -gt "$STATUS_TIMEOUT" ]; then
      echo "ERROR: Timeout waiting for fileId=$file_id" >&2; return 1
    fi
    sleep 1
  done
}

# ── Helper: parse ISO timestamp → epoch ─────────────────────────────────────
to_epoch() {
  python3 - "$1" <<'PY'
import sys
from datetime import datetime
s = sys.argv[1].strip()
if s.endswith("Z"):
    s = s.replace("Z", "+00:00")
if "." in s:
    if "+" in s:
        prefix, tz = s.rsplit("+", 1)
        head, frac = prefix.split(".", 1)
        s = head + "." + frac[:6].ljust(6, "0") + "+" + tz
dt = datetime.fromisoformat(s)
print(dt.timestamp())
PY
}

# ── Main ─────────────────────────────────────────────────────────────────────
echo "Starting COLD SLA test — ${RUNS} runs"
echo "Each run waits for scale-to-zero before uploading."
echo ""

for run in $(seq 1 "$RUNS"); do
  FILE="${FILES_DIR}/${FILE_PREFIX}-${run}.bin"
  FILE_BASENAME=$(basename "$FILE")
  echo ""
  echo "===== COLD RUN ${run}/${RUNS} — ${FILE_BASENAME} ====="

  # Βήμα 1: Verify scale-to-zero
  wait_for_scale_to_zero

  # Βήμα 2: Upload (το Knative pod ξεκινάει από μηδέν)
  echo "[cold] Uploading — cold start begins now..."
  response_file=$(mktemp)
  http_status=$(
    curl -s -w "%{http_code}" \
      -X POST "$API_URL" \
      -H "Authorization: Bearer $TOKEN" \
      -F "file=@${FILE}" \
      -F "recipientEmail=${RECIPIENT_EMAIL}" \
      -o "$response_file"
  )
  response=$(cat "$response_file"); rm -f "$response_file"

  if [ "$http_status" != "201" ]; then
    echo "[FAIL] HTTP ${http_status}"
    echo "$run,$FILE_BASENAME,,,upload_failed,,,,$http_status" >> "$OUTPUT"
    # Ακόμα και αποτυχία: περίμενε για scale-to-zero πριν το επόμενο run
    sleep 30
    continue
  fi

  file_id=$(echo "$response"   | jq -r '.fileId')
  file_name=$(echo "$response" | jq -r '.fileName')
  file_size=$(echo "$response" | jq -r '.fileSize')
  upload_time=$(echo "$response" | jq -r '.createdAt')
  echo "[ok] Uploaded fileId=$file_id  createdAt=$upload_time"

  status_line=$(wait_for_status_change "$file_id")
  echo "$status_line"

  completed_time=$(echo "$status_line" | awk '{print $1}')
  status=$(echo "$status_line" | sed -n 's/.*status: \([^ ]*\).*/\1/p')

  upload_epoch=$(to_epoch "$upload_time")
  completed_epoch=$(to_epoch "$completed_time")
  latency_sec=$(python3 - <<PY
u = $upload_epoch
c = $completed_epoch
print(f"{c - u:.3f}")
PY
)

  echo "[latency] ${latency_sec}s  status=${status}"
  echo "${run},${file_name},${file_size},${file_id},${status},${upload_time},${completed_time},${latency_sec},${http_status}" >> "$OUTPUT"

  # Βήμα 3: Αναμονή για scale-to-zero πριν το επόμενο run
  # window=10s + small buffer = 25s is typically enough
  echo "[cold] Waiting for natural scale-to-zero (window=6s)..."
  sleep 20
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results → $OUTPUT"
echo ""
echo "=== Statistical Summary ==="
python3 - "$OUTPUT" <<'PY'
import csv, sys, statistics

values = []
with open(sys.argv[1]) as f:
    for r in csv.DictReader(f):
        try: values.append(float(r["latency_sec"]))
        except: pass

if not values:
    print("No successful measurements."); raise SystemExit

values.sort()

def pct(d, p):
    n = len(d)
    if n == 1: return d[0]
    k = (n-1)*p/100; lo = int(k); hi = min(lo+1, n-1)
    return d[lo] + (k-lo)*(d[hi]-d[lo])

print(f"  count = {len(values)}")
print(f"  mean  = {statistics.mean(values):.3f}s")
print(f"  stdev = {statistics.stdev(values):.3f}s")
print(f"  min   = {min(values):.3f}s")
print(f"  p50   = {pct(values, 50):.3f}s")
print(f"  p90   = {pct(values, 90):.3f}s")
print(f"  p95   = {pct(values, 95):.3f}s")
print(f"  p99   = {pct(values, 99):.3f}s")
print(f"  max   = {max(values):.3f}s")
PY
