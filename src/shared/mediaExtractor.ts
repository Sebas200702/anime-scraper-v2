import type { NewMedia } from '../types/index.js'

interface ImageSet {
  webp?: { image_url?: string; large_image_url?: string; small_image_url?: string }
  jpg?: { image_url?: string; large_image_url?: string; small_image_url?: string }
}

/**
 * Extracts media entries from a webp/jpg image set.
 * Eliminates repeated webp-vs-jpg branching across processors.
 */
export function extractMediaFromImages(
  images: ImageSet,
  entityId: number,
  entityType: string,
  mediaType: string
): NewMedia[] {
  const source = images.webp || images.jpg
  if (!source) return []

  const entries: NewMedia[] = []

  if (source.large_image_url) {
    entries.push({
      entityId,
      entityType,
      mediaType,
      src: source.large_image_url,
      size: 'large',
    })
  }

  if (source.image_url) {
    entries.push({
      entityId,
      entityType,
      mediaType,
      src: source.image_url,
      size: 'default',
    })
  }

  if (source.small_image_url) {
    entries.push({
      entityId,
      entityType,
      mediaType,
      src: source.small_image_url,
      size: 'small',
    })
  }

  return entries
}

/**
 * Extracts a single media entry from a webp/jpg image set.
 * Used for entities that only have one image (character, producer, staff).
 */
export function extractSingleMedia(
  images: ImageSet,
  entityId: number,
  entityType: string,
  mediaType: string
): NewMedia[] {
  const source = images.webp || images.jpg
  if (!source?.image_url) return []

  return [
    {
      entityId,
      entityType,
      mediaType,
      src: source.image_url,
      size: 'default',
    },
  ]
}
