#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-https://api.securedrop.gr/api/files/upload}"
SCANNER_HEALTH_URL="${SCANNER_HEALTH_URL:-http://securedrop-scanner.default.svc.cluster.local/health}"

NAMESPACE="${NAMESPACE:-default}"
API_DEPLOY="${API_DEPLOY:-securedrop-api}"
API_CONTAINER="${API_CONTAINER:-securedrop-api}"
SCANNER_LABEL="${SCANNER_LABEL:-serving.knative.dev/service=securedrop-scanner}"

RECIPIENT_EMAIL="${RECIPIENT_EMAIL:-adreas@karabetian.gr}"
RUNS="${RUNS:-5}"
STATUS_TIMEOUT="${STATUS_TIMEOUT:-300}"
OUTPUT="${OUTPUT:-warm_sla_results.csv}"

if [ -z "${TOKEN:-}" ]; then
  echo "ERROR: TOKEN env var is missing."
  echo "Run: export TOKEN='eyJ...'"
  exit 1
fi

if [ $# -lt 1 ]; then
  echo "Usage: TOKEN='...' RUNS=5 RECIPIENT_EMAIL='email@example.com' $0 <file>"
  exit 1
fi

FILE="$1"

if [ ! -f "$FILE" ]; then
  echo "ERROR: File not found: $FILE"
  exit 1
fi

command -v jq >/dev/null || { echo "ERROR: jq is required"; exit 1; }
command -v kubectl >/dev/null || { echo "ERROR: kubectl is required"; exit 1; }
command -v curl >/dev/null || { echo "ERROR: curl is required"; exit 1; }

echo "run,file_name,file_size,file_id,status,upload_time,completed_time,latency_sec,http_status" > "$OUTPUT"

warm_up_scanner() {
  echo "Warming up scanner..."

  kubectl run warmup-curl -n "$NAMESPACE" --rm -i --restart=Never \
    --image=curlimages/curl -- \
    curl -fsS "$SCANNER_HEALTH_URL" >/dev/null || true

  echo "Waiting for scanner pod to be Running..."

  for i in $(seq 1 60); do
    running_count=$(
      kubectl get pods -n "$NAMESPACE" -l "$SCANNER_LABEL" \
        --field-selector=status.phase=Running \
        --no-headers 2>/dev/null | wc -l
    )

    if [ "$running_count" -gt 0 ]; then
      echo "Scanner is warm. Running pods=$running_count"
      return 0
    fi

    sleep 2
  done

  echo "ERROR: Scanner did not become Running."
  kubectl get pods -n "$NAMESPACE" -l "$SCANNER_LABEL" || true
  exit 1
}

wait_for_status_change() {
  local file_id="$1"
  local start
  start=$(date +%s)

  while true; do
    line=$(
      kubectl logs -n "$NAMESPACE" "deploy/$API_DEPLOY" -c "$API_CONTAINER" \
        --timestamps --since=30m 2>/dev/null \
        | grep "Received status change for fileId: $file_id" \
        | tail -1 || true
    )

    if [ -n "$line" ]; then
      echo "$line"
      return 0
    fi

    now=$(date +%s)
    if [ $((now - start)) -gt "$STATUS_TIMEOUT" ]; then
      echo "ERROR: Timeout waiting for status change for fileId=$file_id" >&2
      return 1
    fi

    sleep 1
  done
}

to_epoch() {
  python3 - "$1" <<'PY'
import sys
from datetime import datetime

s = sys.argv[1].strip()
if s.endswith("Z"):
    s = s.replace("Z", "+00:00")

# Trim nanoseconds to microseconds for Python datetime.
if "." in s:
    # Case: 2026-05-22T16:03:30.296013270+02:00
    if "+" in s:
        prefix, tz = s.rsplit("+", 1)
        head, frac = prefix.split(".", 1)
        s = head + "." + frac[:6].ljust(6, "0") + "+" + tz
    elif "-" in s[20:]:
        # Case with negative timezone.
        idx = max(s.rfind("-"), s.rfind("+"))
        prefix, tz = s[:idx], s[idx:]
        head, frac = prefix.split(".", 1)
        s = head + "." + frac[:6].ljust(6, "0") + tz

dt = datetime.fromisoformat(s)
print(dt.timestamp())
PY
}

warm_up_scanner

for run in $(seq 1 "$RUNS"); do
  echo
  echo "===== WARM RUN $run/$RUNS ====="

  echo "Uploading $FILE..."
  response_file=$(mktemp)

  http_status=$(
    curl -s -w "%{http_code}" \
      -X POST "$API_URL" \
      -H "Authorization: Bearer $TOKEN" \
      -F "file=@$FILE" \
      -F "recipientEmail=$RECIPIENT_EMAIL" \
      -o "$response_file"
  )

  response=$(cat "$response_file")
  rm -f "$response_file"

  if [ "$http_status" != "201" ]; then
    echo "Upload failed. HTTP_STATUS=$http_status"
    echo "$response"
    echo "$run,$(basename "$FILE"),,,upload_failed,,,,$http_status" >> "$OUTPUT"
    continue
  fi

  file_id=$(echo "$response" | jq -r '.fileId')
  file_name=$(echo "$response" | jq -r '.fileName')
  file_size=$(echo "$response" | jq -r '.fileSize')
  upload_time=$(echo "$response" | jq -r '.createdAt')

  echo "Uploaded fileId=$file_id createdAt=$upload_time"

  status_line=$(wait_for_status_change "$file_id")
  echo "$status_line"

  completed_time=$(echo "$status_line" | awk '{print $1}')
  status=$(echo "$status_line" | sed -n 's/.*status: \([^ ]*\).*/\1/p')

  upload_epoch=$(to_epoch "$upload_time")
  completed_epoch=$(to_epoch "$completed_time")

  latency_sec=$(python3 - <<PY
upload=$upload_epoch
completed=$completed_epoch
print(f"{completed-upload:.3f}")
PY
)

  echo "Latency: ${latency_sec}s status=$status"

  echo "$run,$file_name,$file_size,$file_id,$status,$upload_time,$completed_time,$latency_sec,$http_status" >> "$OUTPUT"

  # Μικρό pause ώστε να μείνει warm αλλά να μη γίνει burst/concurrent test.
  sleep 1
done

echo
echo "Results written to $OUTPUT"
cat "$OUTPUT"

echo
echo "Summary:"
python3 - "$OUTPUT" <<'PY'
import csv, sys, statistics

path = sys.argv[1]
values = []

with open(path) as f:
    rows = csv.DictReader(f)
    for r in rows:
        if r.get("latency_sec"):
            try:
                values.append(float(r["latency_sec"]))
            except ValueError:
                pass

if not values:
    print("No successful measurements.")
    raise SystemExit

values.sort()

def percentile(data, p):
    if len(data) == 1:
        return data[0]
    k = (len(data)-1) * (p/100)
    lo = int(k)
    hi = min(lo+1, len(data)-1)
    frac = k - lo
    return data[lo] * (1-frac) + data[hi] * frac

print(f"count={len(values)}")
print(f"avg={statistics.mean(values):.3f}s")
print(f"min={min(values):.3f}s")
print(f"max={max(values):.3f}s")
print(f"p50={percentile(values, 50):.3f}s")
print(f"p95={percentile(values, 95):.3f}s")
print(f"p99={percentile(values, 99):.3f}s")
PY