import { describe, expect, test } from 'bun:test'
import { mapProducer } from '../src/processors/jikan/producerMapper.js'
import { mapStaff } from '../src/processors/jikan/staffMapper.js'

/**
 * Los logos de productor/estudio y los retratos del listado de Jikan se
 * extraen en el mapper. El repositorio los había estado descartando: esta
 * prueba fija el contrato para que no vuelva a pasar.
 */
const images = {
  jpg: {
    image_url: 'https://cdn.example/logo.jpg',
    small_image_url: null,
    large_image_url: null,
  },
  webp: {
    image_url: 'https://cdn.example/logo.webp',
    small_image_url: null,
    large_image_url: null,
  },
}

describe('media de Jikan (producer/staff)', () => {
  test('mapProducer extrae el logo (webp preferido)', () => {
    const result = mapProducer({
      mal_id: 14,
      url: 'https://myanimelist.net/anime/producer/14',
      titles: [],
      images,
      favorites: 0,
      established: '1998',
      about: 'Bones',
      count: 100,
    } as any)

    expect(result.producerMedia).toEqual([
      {
        entityId: 14,
        entityType: 'producer',
        mediaType: 'logo',
        src: 'https://cdn.example/logo.webp',
        size: 'default',
      },
    ])
  })

  test('mapProducer sin imágenes no inventa media', () => {
    const result = mapProducer({
      mal_id: 1,
      images: { jpg: { image_url: null }, webp: { image_url: null } },
      titles: [],
    } as any)
    expect(result.producerMedia).toEqual([])
  })

  test('mapStaff extrae el retrato del listado', () => {
    const result = mapStaff({
      mal_id: 1,
      name: 'Seki, Tomokazu',
      given_name: 'Tomokazu',
      family_name: 'Seki',
      birthday: '1972-09-08',
      about: null,
      alternate_names: [],
      images,
    } as any)

    expect(result.staffMedia).toEqual([
      {
        entityId: 1,
        entityType: 'staff',
        mediaType: 'poster',
        src: 'https://cdn.example/logo.webp',
        size: 'default',
      },
    ])
  })
})
