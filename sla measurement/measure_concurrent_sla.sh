#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-https://api.securedrop.gr/api/files/upload}"
NAMESPACE="${NAMESPACE:-default}"
API_DEPLOY="${API_DEPLOY:-securedrop-api}"
API_CONTAINER="${API_CONTAINER:-securedrop-api}"
RECIPIENT_EMAIL="${RECIPIENT_EMAIL:-adreas@karabetian.gr}"
CONCURRENCY="${CONCURRENCY:-10}"
STATUS_TIMEOUT="${STATUS_TIMEOUT:-300}"
OUTPUT="${OUTPUT:-concurrent_sla_results.csv}"

if [ -z "${TOKEN:-}" ]; then
  echo "ERROR: TOKEN env var is missing."
  echo "Run: export TOKEN='eyJ...'"
  exit 1
fi

if [ $# -lt 1 ]; then
  echo "Usage: TOKEN='...' CONCURRENCY=10 RECIPIENT_EMAIL='email@example.com' $0 <file>"
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

WORKDIR="$(mktemp -d)"
UPLOAD_DIR="$WORKDIR/uploads"
mkdir -p "$UPLOAD_DIR"

echo "run,file_name,file_size,file_id,status,upload_time,completed_time,latency_sec,http_status" > "$OUTPUT"

to_epoch() {
  python3 - "$1" <<'PY'
import sys
from datetime import datetime

s = sys.argv[1].strip()
if s.endswith("Z"):
    s = s.replace("Z", "+00:00")

# Trim nanoseconds to microseconds for Python datetime.
if "." in s:
    if "+" in s:
        prefix, tz = s.rsplit("+", 1)
        head, frac = prefix.split(".", 1)
        s = head + "." + frac[:6].ljust(6, "0") + "+" + tz
    elif "-" in s[20:]:
        idx = max(s.rfind("-"), s.rfind("+"))
        prefix, tz = s[:idx], s[idx:]
        head, frac = prefix.split(".", 1)
        s = head + "." + frac[:6].ljust(6, "0") + tz

dt = datetime.fromisoformat(s)
print(dt.timestamp())
PY
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

echo "Starting concurrent upload test"
echo "File: $FILE"
echo "Concurrency: $CONCURRENCY"
echo "Recipient: $RECIPIENT_EMAIL"
echo "Output: $OUTPUT"
echo

for run in $(seq 1 "$CONCURRENCY"); do
  (
    response_file="$UPLOAD_DIR/response-$run.json"
    status_file="$UPLOAD_DIR/status-$run.txt"

    http_status=$(
      curl -s -w "%{http_code}" \
        -X POST "$API_URL" \
        -H "Authorization: Bearer $TOKEN" \
        -F "file=@$FILE" \
        -F "recipientEmail=$RECIPIENT_EMAIL" \
        -o "$response_file"
    )

    echo "$http_status" > "$status_file"
  ) &
done

wait

echo "All upload requests finished."
echo

for run in $(seq 1 "$CONCURRENCY"); do
  response_file="$UPLOAD_DIR/response-$run.json"
  status_file="$UPLOAD_DIR/status-$run.txt"

  http_status="$(cat "$status_file")"
  response="$(cat "$response_file")"

  if [ "$http_status" != "201" ]; then
    echo "Run $run upload failed. HTTP_STATUS=$http_status"
    echo "$response"
    echo "$run,$(basename "$FILE"),,,upload_failed,,,,$http_status" >> "$OUTPUT"
    continue
  fi

  file_id="$(echo "$response" | jq -r '.fileId')"
  file_name="$(echo "$response" | jq -r '.fileName')"
  file_size="$(echo "$response" | jq -r '.fileSize')"
  upload_time="$(echo "$response" | jq -r '.createdAt')"

  echo "Run $run uploaded: fileId=$file_id upload_time=$upload_time"

  status_line="$(wait_for_status_change "$file_id")"
  echo "Run $run completed: $status_line"

  completed_time="$(echo "$status_line" | awk '{print $1}')"
  status="$(echo "$status_line" | sed -n 's/.*status: \([^ ]*\).*/\1/p')"

  upload_epoch="$(to_epoch "$upload_time")"
  completed_epoch="$(to_epoch "$completed_time")"

  latency_sec="$(
    python3 - <<PY
upload=$upload_epoch
completed=$completed_epoch
print(f"{completed-upload:.3f}")
PY
  )"

  echo "$run,$file_name,$file_size,$file_id,$status,$upload_time,$completed_time,$latency_sec,$http_status" >> "$OUTPUT"
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
success = 0
failed = 0

with open(path) as f:
    rows = csv.DictReader(f)
    for r in rows:
        if r.get("http_status") == "201" and r.get("latency_sec"):
            success += 1
            try:
                values.append(float(r["latency_sec"]))
            except ValueError:
                pass
        else:
            failed += 1

values.sort()

def percentile(data, p):
    if len(data) == 1:
        return data[0]
    k = (len(data)-1) * (p/100)
    lo = int(k)
    hi = min(lo+1, len(data)-1)
    frac = k - lo
    return data[lo] * (1-frac) + data[hi] * frac

print(f"successful_uploads={success}")
print(f"failed_uploads={failed}")

if not values:
    print("No successful measurements.")
    raise SystemExit

print(f"count={len(values)}")
print(f"avg={statistics.mean(values):.3f}s")
print(f"min={min(values):.3f}s")
print(f"max={max(values):.3f}s")
print(f"p50={percentile(values, 50):.3f}s")
print(f"p95={percentile(values, 95):.3f}s")
print(f"p99={percentile(values, 99):.3f}s")
PY

rm -rf "$WORKDIR"