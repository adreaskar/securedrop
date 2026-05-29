#!/usr/bin/env bash
# generate_test_files.sh
# Δημιουργεί unique binary αρχεία για τα SLA tests.
# Κάθε αρχείο έχει διαφορετικό περιεχόμενο → διαφορετικό hash → no deduplication.
#
# Usage: ./generate_test_files.sh [output_dir] [count] [size_mb]
# Defaults: ./load-files  50  10
#
# Παράγει:
#   unique-10mb-1.bin ... unique-10mb-50.bin  (warm + cold tests, 30 runs each)
#   concurrent-10mb-1.bin ... concurrent-10mb-30.bin  (3 batches × 10 concurrent)

set -euo pipefail

OUT_DIR="${1:-./load-files}"
WARM_COLD_COUNT="${2:-50}"   # 30 runs warm + 30 runs cold, 50 αρκεί
CONCURRENT_COUNT="${3:-30}"  # 3 batches × 10
SIZE_MB="${4:-10}"

mkdir -p "$OUT_DIR"

echo "=== Generating ${WARM_COLD_COUNT} unique files (${SIZE_MB}MB each) for warm/cold tests ==="
for i in $(seq 1 "$WARM_COLD_COUNT"); do
  fpath="${OUT_DIR}/unique-${SIZE_MB}mb-${i}.bin"
  if [ -f "$fpath" ]; then
    echo "  [skip] $fpath already exists"
  else
    dd if=/dev/urandom of="$fpath" bs=1M count="$SIZE_MB" 2>/dev/null
    echo "  [ok] $fpath"
  fi
done

echo ""
echo "=== Generating ${CONCURRENT_COUNT} unique files (${SIZE_MB}MB each) for concurrent tests ==="
for i in $(seq 1 "$CONCURRENT_COUNT"); do
  fpath="${OUT_DIR}/concurrent-${SIZE_MB}mb-${i}.bin"
  if [ -f "$fpath" ]; then
    echo "  [skip] $fpath already exists"
  else
    dd if=/dev/urandom of="$fpath" bs=1M count="$SIZE_MB" 2>/dev/null
    echo "  [ok] $fpath"
  fi
done

echo ""
echo "=== Done ==="
echo "Files in ${OUT_DIR}:"
ls -lh "$OUT_DIR" | tail -20
echo ""
echo "Total size: $(du -sh "$OUT_DIR" | cut -f1)"
