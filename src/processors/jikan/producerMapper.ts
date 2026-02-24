import type { ProducerProcessorResult } from '../../types/index.js'
import type { Producer } from '../../types/jikanApi.js'
import { extractSingleMedia } from '../../shared/mediaExtractor.js'

export const mapProducer = (producer: Producer): ProducerProcessorResult => {
  return {
    producer: {
      malId: producer.mal_id,
      about: producer.about,
      established: producer.established,
      count: producer.count,
    },
    producerMedia: extractSingleMedia(
      producer.images,
      producer.mal_id,
      'producer',
      'logo'
    ),
    titles: (producer.titles || []).map((t) => ({
      producerId: producer.mal_id,
      type: t.type,
      title: t.title,
    })),
  }
}
