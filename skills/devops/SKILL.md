# DevOps Skill

## Purpose
Enables agents to manage Docker services, check health, inspect logs, and perform volume backups. All commands support `--json` for machine-readable output.

## Commands

### Check service health
```bash
# Check all services
docker compose ps --format json

# Check specific service
docker inspect $(docker compose ps -q {service}) --format '{{json .State}}' | jq .

# JSON output
docker compose ps --format json | jq '[.[] | {name: .Name, status: .Status, health: .Health}]'
```

### View logs
```bash
# Tail logs from a service
docker compose logs {service} --tail=100 --no-log-prefix

# JSON structured logs (if service supports it)
docker compose logs {service} --tail=100 | jq -R 'try fromjson catch {raw: .}'
```

### Start / stop services
```bash
# Start all
docker compose --env-file .env.local up -d

# Stop all
docker compose down

# Restart single service
docker compose restart {service}

# Rebuild and restart
docker compose up -d --build {service}
```

### Volume backup
```bash
# Backup a named volume to tar.gz
docker run --rm \
  -v {volume_name}:/source:ro \
  -v $(pwd)/backups:/backup \
  alpine \
  tar czf /backup/{volume_name}-$(date +%Y%m%d-%H%M%S).tar.gz -C /source .
```

### MinIO operations
```bash
# List buckets
docker compose exec minio mc ls local/ --json

# Copy file to bucket
docker compose exec minio mc cp /tmp/file.txt local/{bucket}/file.txt --json

# Check bucket exists
docker compose exec minio mc ls local/{bucket} --json 2>&1 | jq '{exists: (. | length > 0)}'
```

### Health check pattern
```bash
# Standard health check — returns 0 on success, 1 on failure
check_service() {
  local url=$1
  local name=$2
  if curl -sf "$url" > /dev/null 2>&1; then
    echo '{"service":"'"$name"'","status":"ok"}'
  else
    echo '{"service":"'"$name"'","status":"fail"}'
    return 1
  fi
}
```

## Output Format
All health check commands return JSON arrays:
```json
[
  {"service": "minio", "status": "ok"},
  {"service": "event-bus", "status": "ok"},
  {"service": "metering", "status": "fail"}
]
```

## Examples

### Example 1: Check all 8 services are healthy
```bash
services=(
  "http://localhost:9000/minio/health/live|minio"
  "http://localhost:4001/health|event-bus"
  "http://localhost:4002/health|metering"
)
results=()
for entry in "${services[@]}"; do
  url="${entry%|*}"; name="${entry#*|}"
  if curl -sf "$url" > /dev/null 2>&1; then
    results+=('{"service":"'"$name"'","status":"ok"}')
  else
    results+=('{"service":"'"$name"'","status":"fail"}')
  fi
done
echo "[$(IFS=,; echo "${results[*]}")]"
```

### Example 2: Backup all volumes
```bash
for vol in minio-data hiclaw-data workspace; do
  docker run --rm -v ${vol}:/source:ro -v $(pwd)/backups:/backup alpine \
    tar czf /backup/${vol}-$(date +%Y%m%d).tar.gz -C /source . 2>&1
  echo '{"volume":"'"$vol"'","status":"backed_up"}'
done
```
