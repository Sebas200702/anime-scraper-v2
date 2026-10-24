#!/bin/sh
# Arranque del contenedor: aplica el DDL idempotente de `ingest.*` y ejecuta el
# comando (el status server). Los schedules de Dokploy corren después por
# `docker exec` (incremental / discovery).
set -e

echo "→ aplicando schema ingest.* (idempotente)"
bun dist/src/scripts/ingestSchema.js

echo "→ arrancando: $@"
exec "$@"
