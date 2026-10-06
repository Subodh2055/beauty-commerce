#!/bin/sh
# Restore a dump made by backup-postgres.sh into a database.
#
#   restore-postgres.sh /backups/beauty_commerce-20261008T001500Z.dump [target_db]
#
# Uses PGHOST/PGUSER/PGPASSWORD. target_db defaults to PGDATABASE. The target
# is dropped and recreated, so restore into a scratch name first, check it,
# then swap — never straight over production without a fresh backup.
set -eu

DUMP="${1:?usage: restore-postgres.sh <file.dump> [target_db]}"
TARGET="${2:-${PGDATABASE:?PGDATABASE or a target_db argument is required}}"

if [ -f "$DUMP.sha256" ]; then
  (cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256")
fi

printf 'This DROPS and recreates database "%s". Type its name to continue: ' "$TARGET"
read -r answer
[ "$answer" = "$TARGET" ] || { echo "aborted"; exit 1; }

dropdb --if-exists "$TARGET"
createdb "$TARGET"
# pgvector must exist before the schema that uses it.
psql -v ON_ERROR_STOP=1 -d "$TARGET" -c "CREATE EXTENSION IF NOT EXISTS vector"
pg_restore --no-owner --no-privileges --exit-on-error -d "$TARGET" "$DUMP"
echo "restored $DUMP into $TARGET"
