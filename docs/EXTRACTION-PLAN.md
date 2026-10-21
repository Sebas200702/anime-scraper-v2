# Plan de extracción total (2026-10-19/20)

Objetivo: **dejar la base con todo lo que la app necesitará** (anime, manga,
novelas y música) usando el pool de proxies antes de que se cierre, y con el
catálogo lo más completo posible.

## Lo que se encontró (medido, no supuesto)

| Hueco | Medición | Causa |
|---|---|---|
| Personajes por anime | La ficha HTML de MAL corta en **10**; `/v2/people/{id}` da 404 para casi todos | **El id de personaje y el de persona son espacios distintos** (`/character/{id}` ≠ `/people/{id}`) |
| Animes sin reparto | 13.569 de 30.561 | Ni MAL ni AniList publican lista para ellos (entradas viejas, OVAs de una entrega, vídeos musicales) |
| Reparto de manga | 0 | La API v2 de MAL **no** expone el staff de un manga y AniList lo da con nombres parciales ("Yaminabe") o de seudónimo ("Ray Yuuki" vs "Kaneko, Yuuki") |
| CrUCE de nombres | 0 de 33.079 | MAL escribe "apellido, nombre" y AniList "nombre apellido" |
| Dominio manga/novela | 0 filas | Nunca se había extraído |
| Metadatos de canción | 29.020 con título y artista, sin álbum/duración/portada | Solo se guardaban los enlaces |

## Decisiones de diseño que se Taken

### El reparto completo viene de la página de personajes

`/anime/{id}/{slug}/characters` da id, nombre, nativo, rol, favoritos, retrato
**y las voces con su idioma** en una sola petición. La API v2 solo da ids y
rol. Ojo con la URL: `/anime/{id}/characters` se interpreta como el slug
"characters" y MAL redirige a la ficha principal (sin reparto); con cualquier
otro slug (`/anime/{id}/_/characters`) devuelve la lista entera.

### Los personajes que solo existen en AniList van en la misma tabla

AniList cubre los animes sin lista de MAL, pero su id de personaje vive en
otro espacio de ids. Mezclarlos en `character` (indexada por `mal_id`)
colisionaría. Se guardan **en la misma tabla** con el rango `1e9 +` reservado
(los ids de MAL de personaje no pasan de 306.072) y su `anilist_id` real, y se
enlazan con el mismo `anime_character` / `manga_character`.

### El equipo de las obras viene de la página de MAL

Es la única fuente con el **id de persona** de MAL para autores, ilustradores
y editores. Fuente nueva `malMangaPage`: una petición por obra (78-153 KB).

### AniList no se puede enumerar con `Page`

El límite de profundidad de la API es de **5.000 entradas** por consulta, así
que `Page` solo llega a la 100 y no cubre el espacio de ids (218.626). La vía
que sí lo cubre es `id_in`: 50 ids por consulta → 4.374 consultas → 164.125
medios. Con eso se crean **70.858 obras impresas** (57.867 manga, 6.991 novelas,
6.000 one-shots) y se cierra el mapeo anime↔AniList **por `idMal`**.

## Rendimiento: el cuello era el lote, no la red

Con 76 IPs el pase iba a **25 tareas/min**. Tres causas encadenadas:

1. El perfil de backfill **no copiaba el `taskBatchSize`** al config resuelto,
   así que el lote se quedaba en 200 tasks. El manager drena el lote entero
   antes de pedir el siguiente, de modo que el "barrero" (esperar al task más
   lento) se pagaba cada 200 tasks.
2. El **cooldown del proxy era exponencial** (2ⁿ s): con un 8 % de timeouts las
   IPs buenas quedaban fuera minutos, el pool se encogía y las que quedaban
   recibían más tráfico (espiral mortal). Ahora es plano (5 s) y rota el LRU.
3. El **timeout de 30 s** era de sobra (la latencia real por proxy es ~0,5 s,
   p90 1,2 s): 8 s.

Con el lote en 5.000, el cooldown plano y 28 req/min por IP (el límite de
AniList es 30, confirmado en la cabecera `x-ratelimit-limit`): **25 → 615
tareas/min** (y hasta 1.650 con el pool sano).

## El reparto de los animes sin lista de MAL

Ni MAL ni AniList lo tienen (verificado uno a uno: `Monkey Magic`, `Fushigi
na Koala Blinky`, `Princess Memory` → 0 personajes en ambas fuentes). No es un
fallo del scraper: es un techo de las fuentes. Lo que sí se recuperó:
**373 animes** que MAL no listaba y AniList sí, más el reparto completo de las
obras impresas (que solo existe en AniList).

## Qué falta (y no son datos)

- **Páginas de dominio** en la app: `/character/[id]`, `/voice-actor/[id]`,
  `/manga/[id]`.
- **Control parental del manga**: la tabla `manga` no tiene columna de rating,
  así que el fail-closed de anime no aplica a las obras adultas.
- **Búsqueda global**: `/search` es solo de anime.
- **OP/ED de ~20.400 anime**: ni MAL, ni ANN, ni AnimeThemes los tienen; no
  hay más fuente accesible.
- **Vídeo de episodio**: sin fuente legal (muro de Fase 5).
- **Obras impresas sin id de MAL** (70.542 en AniList): el catálogo está
  indexado por id de MAL, así que no tienen dónde guardarse.
