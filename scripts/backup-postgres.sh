#!/bin/sh
# Logical backup of the app database with retention.
#
#   Uses the standard libpq env: PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
#   BACKUP_DIR        where dumps go            (default /backups)
#   BACKUP_KEEP_DAYS  delete dumps older than   (default 14)
#
# Runs nightly in the `backup` service of docker-compose.prod.yml, or by hand:
#   docker compose -f docker-compose.prod.yml exec backup sh /usr/local/bin/backup-postgres.sh
#
# Output: <db>-<UTC timestamp>.dump (pg_dump custom format: compressed, and
# restorable table by table) plus a .sha256 next to it. A dump is written to a
# temp name and renamed only once pg_dump succeeds and the archive lists
# cleanly, so a half-written file never looks like a backup.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
DB="${PGDATABASE:?PGDATABASE is required}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/$DB-$STAMP.dump"
TMP="$OUT.partial"

mkdir -p "$BACKUP_DIR"
echo "[backup] dumping $DB to $OUT"
pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="$TMP" "$DB"
pg_restore --list "$TMP" > /dev/null   # verify the archive is readable
mv "$TMP" "$OUT"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256")
echo "[backup] ok: $(du -h "$OUT" | cut -f1)"

# Retention: keep the last KEEP_DAYS days, but never delete the newest dump.
find "$BACKUP_DIR" -name "$DB-*.dump" -type f -mtime +"$KEEP_DAYS" ! -path "$OUT" -print -delete
find "$BACKUP_DIR" -name "$DB-*.dump.sha256" -type f -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name "*.partial" -type f -mmin +120 -delete
