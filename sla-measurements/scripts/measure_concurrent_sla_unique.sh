#!/usr/bin/env bash
# measure_concurrent_sla_unique.sh
# Concurrent SLA — N παράλληλα uploads ανά batch, B batches συνολικά.
# Κάθε upload χρησιμοποιεί διαφορετικό αρχείο για να παρακαμφθεί το dedup.
#
# Παράγει: CONCURRENCY × BATCHES δείγματα (π.χ. 10 × 3 = 30)
#
# Usage:
#   export TOKEN='eyJ...'
#   CONCURRENCY=10 BATCHES=3 RECIPIENT_EMAIL='...' OUTPUT='concurrent_30.csv' \
#     ./measure_concurrent_sla_unique.sh ./load-files

set -euo pipefail

API_URL="${API_URL:-https://api.securedrop.gr/api/files/upload}"
NAMESPACE="${NAMESPACE:-default}"
API_DEPLOY="${API_DEPLOY:-securedrop-api}"
API_CONTAINER="${API_CONTAINER:-securedrop-api}"
RECIPIENT_EMAIL="${RECIPIENT_EMAIL:-adreas@karabetian.gr}"
CONCURRENCY="${CONCURRENCY:-10}"
BATCHES="${BATCHES:-3}"
STATUS_TIMEOUT="${STATUS_TIMEOUT:-180}"
OUTPUT="${OUTPUT:-concurrent_sla_results.csv}"
FILE_PREFIX="${FILE_PREFIX:-concurrent-10mb}"

TOTAL=$((CONCURRENCY * BATCHES))

# ── Validation ───────────────────────────────────────────────────────────────
if [ -z "${TOKEN:-}" ]; then
  echo "ERROR: Set TOKEN env var."; exit 1
fi
if [ $# -lt 1 ]; then
  echo "Usage: TOKEN='...' CONCURRENCY=10 BATCHES=3 $0 <files_dir>"; exit 1
fi
FILES_DIR="$1"
if [ ! -d "$FILES_DIR" ]; then
  echo "ERROR: Directory not found: $FILES_DIR"; exit 1
fi
for i in $(seq 1 "$TOTAL"); do
  fp="${FILES_DIR}/${FILE_PREFIX}-${i}.bin"
  if [ ! -f "$fp" ]; then
    echo "ERROR: Missing ${fp} — run generate_test_files.sh first."; exit 1
  fi
done
command -v jq      >/dev/null || { echo "ERROR: jq required";     exit 1; }
command -v microk8s kubectl >/dev/null || { echo "ERROR: microk8s kubectl required"; exit 1; }
command -v curl    >/dev/null || { echo "ERROR: curl required";    exit 1; }
command -v python3 >/dev/null || { echo "ERROR: python3 required"; exit 1; }

# ── Header ───────────────────────────────────────────────────────────────────
echo "run,batch,file_name,file_size,file_id,status,upload_time,completed_time,latency_sec,http_status" > "$OUTPUT"

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# ── Helper: parse ISO → epoch ────────────────────────────────────────────────
to_epoch() {
  python3 - "$1" <<'PY'
import sys
from datetime import datetime
s = sys.argv[1].strip()
if s.endswith("Z"):
    s = s.replace("Z", "+00:00")
if "." in s and "+" in s:
    prefix, tz = s.rsplit("+", 1)
    head, frac = prefix.split(".", 1)
    s = head + "." + frac[:6].ljust(6, "0") + "+" + tz
print(datetime.fromisoformat(s).timestamp())
PY
}

# ── Helper: wait for status change ───────────────────────────────────────────
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
      echo "TIMEOUT:${file_id}"; return 1
    fi
    sleep 1
  done
}

# ── Upload worker (runs in background) ───────────────────────────────────────
# Writes result to $TMPDIR/<global_run_number>.result
upload_worker() {
  local global_run="$1"
  local batch="$2"
  local file="$3"
  local result_file="${TMPDIR}/${global_run}.result"

  response_file=$(mktemp)
  http_status=$(
    curl -s -w "%{http_code}" \
      -X POST "$API_URL" \
      -H "Authorization: Bearer $TOKEN" \
      -F "file=@${file}" \
      -F "recipientEmail=${RECIPIENT_EMAIL}" \
      -o "$response_file"
  )
  response=$(cat "$response_file"); rm -f "$response_file"

  if [ "$http_status" != "201" ]; then
    echo "${global_run},${batch},$(basename $file),,,upload_failed,,,,$http_status" > "$result_file"
    return
  fi

  file_id=$(echo "$response"   | jq -r '.fileId')
  file_name=$(echo "$response" | jq -r '.fileName')
  file_size=$(echo "$response" | jq -r '.fileSize')
  upload_time=$(echo "$response" | jq -r '.createdAt')

  status_line=$(wait_for_status_change "$file_id" || echo "TIMEOUT:${file_id}")

  if echo "$status_line" | grep -q "^TIMEOUT:"; then
    echo "${global_run},${batch},${file_name},${file_size},${file_id},timeout,${upload_time},,,$http_status" > "$result_file"
    return
  fi

  completed_time=$(echo "$status_line" | awk '{print $1}')
  status=$(echo "$status_line" | sed -n 's/.*status: \([^ ]*\).*/\1/p')

  upload_epoch=$(to_epoch "$upload_time")
  completed_epoch=$(to_epoch "$completed_time")
  latency_sec=$(python3 -c "print(f'{$completed_epoch - $upload_epoch:.3f}')")

  echo "${global_run},${batch},${file_name},${file_size},${file_id},${status},${upload_time},${completed_time},${latency_sec},${http_status}" > "$result_file"
}

# ── Main ─────────────────────────────────────────────────────────────────────
echo "Concurrent SLA: ${CONCURRENCY} parallel uploads × ${BATCHES} batches = ${TOTAL} samples"
echo ""

global_run=0

for batch in $(seq 1 "$BATCHES"); do
  echo ""
  echo "===== BATCH ${batch}/${BATCHES} — launching ${CONCURRENCY} parallel uploads ====="

  batch_pids=()
  batch_runs=()

  for slot in $(seq 1 "$CONCURRENCY"); do
    global_run=$((global_run + 1))
    file_index=$((CONCURRENCY * (batch - 1) + slot))
    FILE="${FILES_DIR}/${FILE_PREFIX}-${file_index}.bin"

    upload_worker "$global_run" "$batch" "$FILE" &
    batch_pids+=($!)
    batch_runs+=($global_run)
    echo "  [launched] run=${global_run} file=$(basename $FILE) pid=$!"
  done

  echo "  [waiting] for ${#batch_pids[@]} workers..."
  for pid in "${batch_pids[@]}"; do
    wait "$pid" || true
  done

  echo "  [batch ${batch} done] Collecting results..."
  for gr in "${batch_runs[@]}"; do
    rf="${TMPDIR}/${gr}.result"
    if [ -f "$rf" ]; then
      cat "$rf" >> "$OUTPUT"
      echo "    run ${gr}: $(cat $rf | cut -d',' -f6,9)"
    else
      echo "    run ${gr}: NO RESULT FILE (worker may have crashed)"
    fi
  done

  # Pause between batches to let the system stabilize
  if [ "$batch" -lt "$BATCHES" ]; then
    echo "  [pause] 15s between batches..."
    sleep 15
  fi
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results → $OUTPUT"
echo ""
echo "=== Statistical Summary ==="
python3 - "$OUTPUT" <<'PY'
import csv, sys, statistics

values = []
errors = 0
with open(sys.argv[1]) as f:
    for r in csv.DictReader(f):
        try: values.append(float(r["latency_sec"]))
        except: errors += 1

if not values:
    print("No successful measurements."); raise SystemExit

values.sort()
def pct(d, p):
    n = len(d)
    if n == 1: return d[0]
    k = (n-1)*p/100; lo = int(k); hi = min(lo+1, n-1)
    return d[lo] + (k-lo)*(d[hi]-d[lo])

print(f"  count   = {len(values)}  (errors/timeouts: {errors})")
print(f"  mean    = {statistics.mean(values):.3f}s")
print(f"  stdev   = {statistics.stdev(values):.3f}s")
print(f"  min     = {min(values):.3f}s")
print(f"  p50     = {pct(values, 50):.3f}s")
print(f"  p90     = {pct(values, 90):.3f}s")
print(f"  p95     = {pct(values, 95):.3f}s")
print(f"  p99     = {pct(values, 99):.3f}s")
print(f"  max     = {max(values):.3f}s")
print(f"  success = {len(values)}/{len(values)+errors} ({100*len(values)/(len(values)+errors):.1f}%)")
PY
