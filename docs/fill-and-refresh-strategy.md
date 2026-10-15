# Estrategia de fill y refresh (solo faltantes, nunca re-barrido)

> Cómo el pipeline llena el catálogo **una vez** (Modo A) y después solo
> scrapea lo que falta o lo que venció (Modo B), sin repetir jamás el proceso
> extenso inicial. Complementa `ROADMAP.md` (§5–§6) y el change
> `anidev-v2/openspec/changes/ingest-queue-postgres`.

---

## 1. El principio: la DB es el progreso

Toda la estrategia se apoya en tres propiedades:

1. **Identidad idempotente**: cada unidad de trabajo tiene clave natural
   `(source, task_type, entity_id)`. Insertar dos veces la misma tarea es
   imposible por unique index.
2. **Due-ness**: una tarea está "due" si `status = 'pending'` y
   `scheduled_at <= now()`. El progreso no es un archivo de checkpoint: es la
   tabla de tareas.
3. **Reanudabilidad**: cortar una corrida (crash, cuota, fin del día) no pierde
   nada — los leases expirados vuelven a `pending` y el generador solo crea lo
   que falta.

Hoy esto **no** se cumple: `getExistingEntityIds` trae todos los ids a memoria
y "si existe fila → no crear" impide cualquier refresh
(`src/scripts/initialize*Tasks.ts`). El rediseño convierte esa regla en
"inserta faltantes + re-arma vencidos".

---

## 2. Los cuatro mecanismos

### M1 — Generador idempotente (inserta faltantes + re-arma vencidos)

```sql
INSERT INTO ingest.task (source, task_type, entity_id, payload, priority, scheduled_at)
SELECT 'jikan', 'jikan.anime_full', a.mal_id, jsonb_build_object('animeId', a.mal_id), 5, now()
FROM anime a
ON CONFLICT (source, task_type, entity_id) DO UPDATE
  SET status = 'pending', scheduled_at = now()
  WHERE ingest.task.status = 'completed'
    AND ingest.task.refresh_after <= now();
```

- Lo que no existe → se inserta. Lo que venció → se re-arma. Lo fresco → no se
  toca. Correrlo 100 veces es barato y no duplica nada.
- Es una sola sentencia set-based (sin round-trips por fila): pensada para
  ~30k ids por tipo.

### M2 — Frescura por política (datos, no código)

`ingest.task_policy(source, task_type, refresh_interval, refresh_interval_airing,
max_attempts, priority)`:

| task_type | Intervalo | Racional |
|---|---|---|
| `jikan.anime_full` | airing: **7d** / finished: **90d** | score/members/favoritos cambian continuo |
| `jikan.anime_characters` | **180d** | estable |
| `jikan.anime_staff` | **180d** | estable |
| `kitsu.episodes` | airing: **post-broadcast +1d** / finished: **nunca** | cuota Kitsu 60/min |
| `animethemes.anime` | **30d** | OP/ED nuevos al aire |
| `animethemes.artist` | **90d** | estable |
| `tvdb.artworks` | **180d** | estable |
| `jikan.listing_pages` | **diario** (solo delta) | descubrimiento |
| `jikan.seasons` | **semanal** | temporada nueva |

Al completar: `refresh_after = now() + intervalo` (el intervalo "airing" se
elige con una condición `hot`, p. ej. `anime.status = 'Currently Airing'`).
Cambiar cadencia = `UPDATE` a la tabla, sin deploy (y es lo que edita el
dashboard de control de D.0).

### M3 — Descubrimiento barato (delta, no barrido)

Para IDs nuevos **no** se re-listea todo:

- `/seasons/now` + `/seasons/{year}/{season}` → lista cerrada de la temporada
  (job semanal): cada id nuevo genera *sus* tareas derivadas.
- `/schedules/{day}` → además entrega el broadcast day (dato que necesitamos).
- Listing general (`/anime?page=N`) → solo las últimas páginas, usando
  `MAX(mal_id)` conocido como cursor; el resto ya está.

### M4 — Closure de dependencias (faltantes que aparecen a mitad de camino)

- FK inexistente detectada por un mapper (character/staff de un VA, p. ej.) →
  **encola el padre faltante** con prioridad alta; la relación se reintenta
  cuando el padre complete. Patrón ya existente: `src/shared/artistResolver.ts`.
- No-aplicable (anime sin `kitsu_id`) → `skipped` con `skip_reason`, **no**
  `failed`; se re-arma cuando el mapping se resuelva.
- Resultado: un segundo pase pequeño (solo lo descubierto en el primero), nunca
  un re-barrido.

---

## 3. Modo A — Fill inicial (una vez, por oleadas, reanudable)

1. **Sembrar desde prod** (no redescubrir): clonar el catálogo a local con
   `bun run db:clone-prod` de anidev-v2 (ya existe) y correr el generador: crea
   solo las tareas que falten por id y tipo.
2. **Oleadas FK-safe**:
   - **Oleada 1 — padres**: anime (listing+full), character, staff,
     producer/studio/licensor, artist, taxonomía (genre/theme/demographic), music.
   - **Oleada 2 — junctions e hijos**: anime_genre/theme/demographic/producer
     (+rol), anime_character + VA, anime_staff, relations, external ids, media.
   - **Oleada 3 — pesados**: episodios (Kitsu), AnimeThemes (music+media),
     TVDB artworks.
3. **Drenar la cola** por oleada (`drain --due`); cortar y reanudar es gratis.
4. **Promoción A→prod** (diff-upsert): por clave natural, orden padres→hijos,
   validación referencial previa, transacción atómica, rollback ante fallo. Solo
   inserts nuevos + updates cambiados. Nunca swap destructivo.

**Costo de cobertura nueva** (la pregunta clave): agregar studos/broadcast no es
un refill — es **un task_type nuevo barrido una vez**:
`30k ids ÷ 3 req/s ≈ 2.8 h`. Después entra al refresh rodante.

---

## 4. Modo B — Incremental (por construcción nunca extenso)

Cada corrida (cron del host, `--mode incremental`):

1. `claim_due(limit)` por prioridad (presupuesto por corrida).
2. Descubrimiento barato (M3): seasons/schedules + delta de listing.
3. Refresco por política (M2): solo lo vencido.
4. Registro en `ingest.run` (processed, retried, blocked, dead-lettered).

**Números del barrido rodante** (catálogo ~30k animes):

| Concepto | Cálculo | Resultado |
|---|---|---|
| `anime_full` airing (~1.3k) | 1.3k ÷ 7d | ~185/día |
| `anime_full` finished (~28.7k) | 28.7k ÷ 90d | ~319/día |
| **Total `/full`** | ~504/día a 3 req/s | **~3 min/día de Jikan** |
| Kitsu episodios (solo airing, tras broadcast day) | ~1.3k ÷ 7d × ~5 páginas | ~930 req/día ≈ 16 min a 1/s |

Es decir: el "siempre actualizado" cuesta minutos al día, no una corrida
extensa. El barrido completo de un tipo solo se paga una vez (Modo A o cuando
se agrega cobertura).

---

## 5. Cómo se mide "cuánto falta" (sin correr nada)

```sql
-- Estado de la cola por tipo
SELECT source, task_type, status, count(*)
FROM ingest.task GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

-- Cobertura por columna nueva (D.3)
SELECT count(*) FILTER (WHERE broadcast_day IS NOT NULL)::numeric
       / count(*) AS broadcast_day_coverage
FROM anime;
```

- `missing = 0` y `due` pequeño por tipo = catálogo al día.
- `dead_letter` con `last_error` clasificado distingue "falta de verdad" (404)
  de "bloqueado" (429) — los bloqueados **no** cuentan como huecos.
- La cobertura por columna distingue "aún no backfilleado" de "la fuente no lo
  tiene".

---

## 6. Anti-patrones descartados

- **"Scrapear todo y diffea"**: paga la cuota completa siempre; el diff se
  resuelve por política, no por barrido.
- **"Borrar y re-insertar"**: rompe FKs de datos de usuario (listas, progreso).
- **`failed` como hueco**: infla el denominador de faltantes para siempre.
- **Checkpoints en archivos**: el progreso vive en la DB o no es reanudable.
- **Scheduler dentro de la cosa agendada**: si el scheduling depende de la DB
  que se pausa/reinicia, los ticks se pierden en silencio → cron del host.
