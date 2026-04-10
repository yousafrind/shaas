#!/usr/bin/env bash
# backup.sh — Back up all Docker volumes to timestamped tar.gz files

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="${REPO_ROOT}/backups/${TIMESTAMP}"

VOLUMES=("minio-data" "hiclaw-data" "workspace")
WARN_SIZE_GB=10

mkdir -p "$BACKUP_DIR"
echo "Backing up to: $BACKUP_DIR"
echo ""

TOTAL_BYTES=0

for vol in "${VOLUMES[@]}"; do
  # Check volume exists
  if ! docker volume inspect "$vol" > /dev/null 2>&1; then
    echo "  SKIP: $vol (volume does not exist)"
    continue
  fi

  echo -n "  Backing up $vol… "
  OUTFILE="${BACKUP_DIR}/${vol}.tar.gz"

  docker run --rm \
    -v "${vol}:/source:ro" \
    -v "${BACKUP_DIR}:/backup" \
    alpine \
    tar czf "/backup/${vol}.tar.gz" -C /source . 2>/dev/null

  SIZE=$(du -b "$OUTFILE" 2>/dev/null | cut -f1)
  TOTAL_BYTES=$((TOTAL_BYTES + SIZE))
  SIZE_HUMAN=$(du -sh "$OUTFILE" | cut -f1)
  echo "done (${SIZE_HUMAN})"
done

echo ""
TOTAL_HUMAN=$(echo "$TOTAL_BYTES" | awk '{
  if ($1 >= 1073741824) printf "%.1f GB", $1/1073741824
  else if ($1 >= 1048576) printf "%.1f MB", $1/1048576
  else printf "%.0f KB", $1/1024
}')
echo "Total backup size: $TOTAL_HUMAN"
echo "Location: $BACKUP_DIR"

# Warn if over threshold
TOTAL_GB=$((TOTAL_BYTES / 1073741824))
if [ "$TOTAL_GB" -ge "$WARN_SIZE_GB" ]; then
  echo ""
  echo "WARNING: Backup exceeds ${WARN_SIZE_GB}GB — consider cleaning old backups in backups/"
fi
