#!/usr/bin/env bash
# measure_minscale1_sla.sh
# Σύγκριση autoscaling: μετράει latency με min-scale=1 (always-warm strategy).
# Πριν ξεκινήσει, βάζει min-scale=1 στο Knative service.
# Μετά το πέρας, επαναφέρει min-scale=0.
#
# Χρησιμοποιείτε τα ΙΔΙΑ unique αρχεία με το warm test (unique-10mb-N.bin)
# αλλά σε ΔΙΑΦΟΡΕΤΙΚΗ σειρά για να αποφύγετε deduplication.
#
# Usage:
#   export TOKEN='eyJ...'
#   RUNS=30 RECIPIENT_EMAIL='...' OUTPUT='minscale1_30.csv' \
#     ./measure_minscale1_sla.sh ./load-files

set -euo pipefail

API_URL="${API_URL:-https://api.securedrop.gr/api/files/upload}"
NAMESPACE="${NAMESPACE:-default}"
API_DEPLOY="${API_DEPLOY:-securedrop-api}"
API_CONTAINER="${API_CONTAINER:-securedrop-api}"
SCANNER_LABEL="${SCANNER_LABEL:-serving.knative.dev/service=securedrop-scanner}"
SCANNER_KSVC="${SCANNER_KSVC:-securedrop-scanner}"
RECIPIENT_EMAIL="${RECIPIENT_EMAIL:-adreas@karabetian.gr}"
RUNS="${RUNS:-30}"
STATUS_TIMEOUT="${STATUS_TIMEOUT:-300}"
OUTPUT="${OUTPUT:-minscale1_sla_results.csv}"
# Χρησιμοποιεί αρχεία από το index 21 έως 50 (ώστε να μην συγκρουστεί με warm/cold)
FILE_START="${FILE_START:-21}"
FILE_PREFIX="${FILE_PREFIX:-unique-10mb}"

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
FILE_END=$((FILE_START + RUNS - 1))
for i in $(seq "$FILE_START" "$FILE_END"); do
  fp="${FILES_DIR}/${FILE_PREFIX}-${i}.bin"
  if [ ! -f "$fp" ]; then
    echo "ERROR: Missing ${fp} — run generate_test_files.sh with count >= ${FILE_END}."; exit 1
  fi
done
command -v jq      >/dev/null || { echo "ERROR: jq required";     exit 1; }
command -v kubectl >/dev/null || { echo "ERROR: kubectl required"; exit 1; }
command -v curl    >/dev/null || { echo "ERROR: curl required";    exit 1; }
command -v python3 >/dev/null || { echo "ERROR: python3 required"; exit 1; }

# ── Cleanup trap (restore min-scale=0 even on error) ─────────────────────────
restore_minscale() {
  echo ""
  echo "[cleanup] Restoring min-scale=0 on ${SCANNER_KSVC}..."
  kubectl annotate ksvc "$SCANNER_KSVC" -n "$NAMESPACE" \
    autoscaling.knative.dev/min-scale=0 --overwrite 2>/dev/null || true
  echo "[cleanup] Done."
}
trap restore_minscale EXIT

# ── Header ───────────────────────────────────────────────────────────────────
echo "run,file_name,file_size,file_id,status,upload_time,completed_time,latency_sec,http_status" > "$OUTPUT"

# ── Step 1: Set min-scale=1 ───────────────────────────────────────────────────
echo "=== Setting min-scale=1 on ksvc/${SCANNER_KSVC} ==="
kubectl annotate ksvc "$SCANNER_KSVC" -n "$NAMESPACE" \
  autoscaling.knative.dev/min-scale=1 --overwrite

echo "[ok] Annotation applied. Current annotations:"
kubectl get ksvc "$SCANNER_KSVC" -n "$NAMESPACE" -o jsonpath='{.spec.template.metadata.annotations}' | python3 -c "import sys,json; d=json.load(sys.stdin); [print(f'  {k}: {v}') for k,v in d.items() if 'autoscaling' in k]"
echo ""

# ── Step 2: Wait for pod to be ready ─────────────────────────────────────────
echo "[wait] Waiting for scanner pod to be Running with min-scale=1..."
for i in $(seq 1 60); do
  running=$(
    kubectl get pods -n "$NAMESPACE" -l "$SCANNER_LABEL" \
      --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l
  )
  if [ "$running" -gt 0 ]; then
    echo "[ok] Scanner pod is running (${running} pod(s))"
    break
  fi
  sleep 2
done

# ── Helpers ───────────────────────────────────────────────────────────────────
wait_for_status_change() {
  local file_id="$1"
  local start; start=$(date +%s)
  while true; do
    line=$(
      kubectl logs -n "$NAMESPACE" "deploy/$API_DEPLOY" -c "$API_CONTAINER" \
        --timestamps --since=30m 2>/dev/null \
        | grep "Received status change for fileId: $file_id" \
        | tail -1 || true
    )
    if [ -n "$line" ]; then echo "$line"; return 0; fi
    now=$(date +%s)
    if [ $((now - start)) -gt "$STATUS_TIMEOUT" ]; then
      echo "ERROR: Timeout for fileId=$file_id" >&2; return 1
    fi
    sleep 1
  done
}

to_epoch() {
  python3 - "$1" <<'PY'
import sys
from datetime import datetime
s = sys.argv[1].strip()
if s.endswith("Z"): s = s.replace("Z", "+00:00")
if "." in s and "+" in s:
    prefix, tz = s.rsplit("+", 1)
    head, frac = prefix.split(".", 1)
    s = head + "." + frac[:6].ljust(6, "0") + "+" + tz
print(datetime.fromisoformat(s).timestamp())
PY
}

# ── Step 3: Run measurements ──────────────────────────────────────────────────
echo ""
echo "=== Starting min-scale=1 measurements (${RUNS} runs) ==="
echo "    Using files ${FILE_PREFIX}-${FILE_START}.bin ... ${FILE_PREFIX}-${FILE_END}.bin"
echo ""

for run in $(seq 1 "$RUNS"); do
  file_index=$((FILE_START + run - 1))
  FILE="${FILES_DIR}/${FILE_PREFIX}-${file_index}.bin"
  FILE_BASENAME=$(basename "$FILE")
  echo ""
  echo "===== MIN-SCALE=1 RUN ${run}/${RUNS} — ${FILE_BASENAME} ====="

  # Επαλήθευση: pod εξακολουθεί να τρέχει
  running=$(
    kubectl get pods -n "$NAMESPACE" -l "$SCANNER_LABEL" \
      --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l
  )
  echo "[info] Scanner pods running: ${running}"

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

  sleep 2
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results → $OUTPUT"
echo ""
echo "=== Statistical Summary (min-scale=1) ==="
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
# (trap θα κάνει restore min-scale=0)
