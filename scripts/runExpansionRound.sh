#!/usr/bin/env bash
# Ronda de expansión del catálogo: anime + manga + personajes + música.
#
# Cada fuente se lanza **por separado** para que se quede con el pool entero
# de proxies (100 IPs): la cuota de MAL y de AniList es por IP, así que
# repartir 5 fuentes a 20 IPs cada una multiplicaba por 5 el tiempo.
#
# El orden importa:
#   malCharacters  → el reparto completo (crea los personajes)
#   malPerson      → sus nombres/bio/retrato (el cruce por nombre lo necesita)
#   anilistMedia   → rol fino y voz (cruza con MAL por nombre normalizado)
set -uo pipefail
cd /home/sebas/Projects/anime-scraper-v2 || exit 1

export SCRAPER_MODE=backfill
export SCRAPER_PROXIES_PER_SOURCE=100
export TASK_LEASE_SECONDS=2400

for source in "$@"; do
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "▶ $source — $(date '+%F %T')"
  echo "════════════════════════════════════════════════════════════"
  bun run backfill "$source"
  echo "◀ $source terminado — $(date '+%F %T')"
done
