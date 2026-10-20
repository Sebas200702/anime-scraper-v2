# Plan de extracción total (2026-10-19)

Objetivo: **dejar la base de datos con todo lo que la app necesitará** antes de
que la app cresca, usando el pool de proxies mientras siga vivo. La app v2
tiene hoy dos dominios (`anime`, `music`) y su roadmap pide fichas de
personajes, seiyuus, artistas, schedule y **manga/novelas**; el catálogo
tenía huecos que solo se ven al medir.

## Lo que se encontró (medido, no supuesto)

| Hueco | Medición | Causa |
|---|---|---|
| Personajes por anime | 115.455 en 16.638 animes; **nunca más de 10** por anime | La ficha HTML de MAL ("Characters and Voice Actors") solo lista los 10 primeros |
| Animes sin reparto | **13.927** de 30.565 | Los que no tienen personaje en la sección principal |
| Animes sin `anilist_id` | 9.409 | El cruce por año+título no era exacto; el cruce por `idMal` sí |
| Dominio manga/novela | **0** filas | Nunca se había extraído |
| Metadatos de canción | 29.020 canciones con título+artista y **sin** álbum, duración, fecha ni portada | Solo se habían guardado los enlaces |

## Fuentes comprobadas (a través de las 100 proxies)

| Fuente | Estado | Aporta |
|---|---|---|
| **MAL API v2** `/v2/anime/{id}` | ✅ | ficha completa (sigue en pie) |
| MAL API v2 `/v2/manga/{id}` | ✅ | sinopsis, capítulos, serialización, editorial, relaciones, portada |
| MAL API v2 `/v2/anime/{id}/characters` | ✅ | **reparto completo** paginado (100/página) |
| MAL API v2 `/v2/people/{id}` | ✅ | nombre, biografía, alias, retrato (staff **y** personajes) |
| MAL API v2 `/v2/manga` (lista) | ❌ 400 | la enumeración va por AniList |
| **AniList** GraphQL | ✅ (30 req/min **por IP**) | reparto completo con voz, créditos, relaciones, enlaces, tags |
| AniList `Page` más allá de 5.000 | ❌ (límite de profundidad) | se recorre el espacio de ids con `id_in` |
| **Spotify** oEmbed | ✅ sin credenciales | título exacto + carátura |
| **iTunes** lookup | ✅ sin credenciales | álbum, duración, fecha, carátura |
| VGMdb | ❌ 403 (Cloudflare) | — |
| Deezer | ❌ 403 | — |
| AniDB / Anime-Planet / AnimeSongs | ❌ (TLS, sin respuesta, aparcado) | — |

## Lo que se extrajo

### 1. Catálogo completo de AniList (`bun run anilist:enumerate`)

El `Page` de AniList tiene un límite de **5.000 entradas** por consulta, así que
`Page` solo llega a la 100 y no cubre el espacio de ids (218.626). La vía que
sí lo cubre es `id_in`: 50 ids por consulta → 4.374 consultas.

- **21.152 anime enlazados por `idMal`** (exacto, no por título).
- **70.958 obras impresas** creadas: 57.867 manga, 6.991 novelas, 6.000
  one-shots, con sinónimos, géneros, fechas, país y origen.

### 2. Ficha completa de las obras impresas (`malManga`)

`/v2/manga/{id}` sobre las 70.958 obras: sinopsis, background, capítulos,
volúmenes, serialización (revista), editorial con rol, relaciones tipadas,
enlaces externos y portada. También crea los géneros/temas/demográficas de MAL
que ningún anime había usado (la tabla `genre` tenía 34 de ~48).

### 3. Reparto completo (`malCharacters` + `malPerson`)

- `malCharacters`: una petición por anime → el **reparto entero** con el rol
  (`Main`/`Supporting`).
- `malPerson`: una petición por persona → el nombre (que solo se tenía para
  los 10 primeros), la biografía, los alias y el **retrato** (la API devuelve
  la miniatura; la grande se deduce de la URL).

### 4. Pase profundo de AniList (`anilistMedia`)

Por medio (anime y manga): reparto completo **con sus voces**, créditos de
staff con rol y nota, relaciones y enlaces externos. El cruce con MAL es por
**nombre normalizado** (AniList no publica el id de MAL de sus personajes) y
aporta el rol fino (`MAIN`/`SUPPORTING`/`BACKGROUND`) y la voz.

### 5. Metadatos de las canciones (`musicMeta`)

Spotify (oEmbed) + iTunes (lookup), sin credenciales: título exacto, álbum,
duración, fecha de publicación y portada.

## Orden de ejecución

```
malManga      (independiente)
malCharacters → malPerson → anilistMedia   (el reparto necesita los nombres)
musicMeta     (independiente)
```

## Lo que queda fuera (y por qué)

- **OP/ED de los ~20.400 anime sin tema**: ni MAL, ni ANN, ni AnimeThemes los
  tienen. No hay más fuente accesible; el techo musical está cerca.
- **Vídeo de episodio**: sin fuente legal (muro de Fase 5 del roadmap).
- **Manga sin id de MAL** (70.542 en AniList): el catálogo está indexado por
  id de MAL, así que quedan fuera hasta que se decida la clave.
