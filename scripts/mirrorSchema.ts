/**
 * Genera el **espejo** de los schemas de anidev-v2 dentro del scraper.
 *
 * anidev-v2 es el dueño único del DDL (ROADMAP Track D / change
 * `ingest-queue-postgres`); el scraper solo refleja esas definiciones para
 * escribir en la misma forma. Este script hace la copia de forma reproducible:
 *
 *   bun run schema:mirror            # regenera src/schemas/*.ts
 *   bun run schema:mirror --check    # falla si el espejo quedó desactualizado
 *
 * Así el "drift check" en CI es un comando, no una promesa.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

const ANIDEV_DIR =
  process.env.ANIDEV_SCHEMAS_DIR ??
  join(process.cwd(), '..', 'anidev-v2', 'src', 'lib', 'db', 'schemas')

const OUT_DIR = join(process.cwd(), 'src', 'schemas')

/** archivo de anidev → archivo del scraper (varios pueden fusionarse en uno). */
const TARGETS: Record<string, string> = {
  anime: 'anime.ts',
  'anime-external': 'animeExternal.ts',
  'anime-entity-relations': 'animeRelations.ts',
  'anime-taxonomy-relations': 'animeRelations.ts',
  'anime-taxonomy': 'animeTaxonomy.ts',
  'anime-media': 'media.ts',
  character: 'character.ts',
  'character-relations': 'characterRelations.ts',
  'character-media': 'media.ts',
  staff: 'staff.ts',
  'staff-media': 'media.ts',
  producer: 'producer.ts',
  'producer-media': 'media.ts',
  music: 'music.ts',
  'music-relations': 'musicRelations.ts',
  'music-stream': 'musicStream.ts',
  'music-media': 'media.ts',
  artist: 'artist.ts',
  episode: 'episode.ts',
  'episode-media': 'media.ts',
}

/** import de anidev → import del scraper. */
const IMPORT_MAP: Record<string, string> = {
  anime: './anime.js',
  'anime-external': './animeExternal.js',
  'anime-entity-relations': './animeRelations.js',
  'anime-taxonomy-relations': './animeRelations.js',
  'anime-taxonomy': './animeTaxonomy.js',
  'anime-media': './media.js',
  character: './character.js',
  'character-relations': './characterRelations.js',
  'character-media': './media.js',
  staff: './staff.js',
  'staff-media': './media.js',
  producer: './producer.js',
  'producer-media': './media.js',
  music: './music.js',
  'music-relations': './musicRelations.js',
  'music-stream': './musicStream.js',
  'music-media': './media.js',
  artist: './artist.js',
  episode: './episode.js',
  'episode-media': './media.js',
}

const HEADER = `/**
 * ESPEJO de \`anidev-v2/src/lib/db/schemas/<SRC>\` — anidev-v2 es el dueño del
 * DDL y el scraper solo lo refleja para escribir en la misma forma.
 *
 * No editar a mano: \`bun run schema:mirror\` (drift check: \`bun run schema:mirror --check\`).
 */
`

const rewriteImports = (source: string): string =>
  source.replace(
    /from '@db\/schemas\/([a-z-]+)'/g,
    (_match, name: string) => `from '${IMPORT_MAP[name] ?? `./${name}.js`}'`
  )

const IMPORT_RE = /import\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+'([^']+)'/g

/** Extrae todos los imports (multilínea incluidos) y devuelve el cuerpo limpio. */
const extractImports = (source: string) => {
  const imports = new Map<string, Set<string>>()

  const body = source.replace(
    IMPORT_RE,
    (_match, names: string, mod: string) => {
      const set = imports.get(mod) ?? new Set<string>()
      for (const name of names.split(',')) {
        const clean = name.trim()
        if (clean) set.add(clean)
      }
      imports.set(mod, set)
      return ''
    }
  )

  return { imports, body }
}

const dedupeImportLines = (blocks: string[]): string => {
  const byModule = new Map<string, Set<string>>()
  const bodies: string[] = []

  for (const block of blocks) {
    const { imports, body } = extractImports(block)

    for (const [mod, names] of imports) {
      const set = byModule.get(mod) ?? new Set<string>()
      for (const name of names) set.add(name)
      byModule.set(mod, set)
    }

    bodies.push(
      body
        .split('\n')
        .filter((l) => l.trim() !== '')
        .join('\n')
        .trim()
    )
  }

  // Una sola línea por módulo, con los símbolos unidos y ordenados: fusionar
  // dos archivos de anidev no puede producir bindings duplicados.
  const imports = [...byModule.entries()].map(
    ([mod, names]) => `import { ${[...names].sort().join(', ')} } from '${mod}'`
  )

  return `${imports.join('\n')}\n\n${bodies.filter(Boolean).join('\n\n')}\n`
}

const main = async () => {
  const check = process.argv.includes('--check')
  const byTarget = new Map<string, { name: string; body: string }[]>()
  const sources: string[] = []

  for (const [name, target] of Object.entries(TARGETS)) {
    const raw = await readFile(join(ANIDEV_DIR, `${name}.ts`), 'utf-8')
    sources.push(name)
    const body = rewriteImports(raw)
      .split('\n')
      // se descartan los JSDoc de anidev: el espejo apunta al original
      .filter(
        (line) =>
          !line.trimStart().startsWith('*') &&
          !line.trimStart().startsWith('/**') &&
          line.trim() !== '*/'
      )
      .join('\n')

    const list = byTarget.get(target) ?? []
    list.push({ name, body })
    byTarget.set(target, list)
  }

  await mkdir(OUT_DIR, { recursive: true })
  let stale = 0

  for (const [target, blocks] of byTarget) {
    const origin = blocks.map((b) => b.name).join(', ')
    const content = `${HEADER.replace('<SRC>', origin)}\n${dedupeImportLines(
      blocks.map((b) => b.body)
    )}`
    const path = join(OUT_DIR, target)

    if (check) {
      const current = await readFile(path, 'utf-8').catch(() => '')
      if (current !== content) {
        console.error(`✗ espejo desactualizado: src/schemas/${target}`)
        stale++
      }
      continue
    }

    await writeFile(path, content)
    console.log(`✓ src/schemas/${target}  ←  ${origin}`)
  }

  if (check) {
    console.log(
      stale === 0
        ? `✓ espejo al día (${sources.length} fuentes de anidev)`
        : `✗ ${stale} archivo(s) desactualizado(s): corre bun run schema:mirror`
    )
    process.exit(stale === 0 ? 0 : 1)
  }

  console.log(`\n${basename(OUT_DIR)}/ regenerado desde ${ANIDEV_DIR}`)
}

await main()
