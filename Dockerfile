# anime-scraper-v2 — worker de ingesta (Modo B) + status server.
#
# No sirve la app: escribe en la Postgres de anidev. El contenedor queda vivo
# con `src/server.ts` (health/stats) y los schedules de Dokploy lanzan
# `incremental` por `docker exec`.

FROM oven/bun:1.4.2 AS build
WORKDIR /app

# Dependencias primero: la capa se reutiliza si no cambia el lockfile.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY drizzle ./drizzle
RUN bun run build

FROM oven/bun:1.4.2
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=UTC
ENV PORT=3000

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
COPY scripts/ingest-schema.sql ./scripts/ingest-schema.sql
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["bun", "dist/src/server.js"]
