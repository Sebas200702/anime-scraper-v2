import { fetchAnimeFull } from '../services/mal.js'
import { processAnime } from '../processors/mal.js'
import type { ScrapingTask } from '../types/index.js'

// --- Test Configuration ---
const ANIME_ID_TO_TEST = 57658 // Fullmetal Alchemist: Brotherhood

const testMalScraper = async () => {
  console.log(
    `🚀 Starting test for MyAnimeList anime ID: ${ANIME_ID_TO_TEST}...`
  )

  // 1. Create a mock task, similar to what the main system would do.
  const mockTask: ScrapingTask = {
    id: 1,
    source: 'mal',
    taskType: 'anime_full_hydration',
    entityId: String(ANIME_ID_TO_TEST),
    status: 'pending',
    priority: 1,
    payload: { animeId: ANIME_ID_TO_TEST },
    createdAt: new Date(),
    updatedAt: new Date(),
    scheduledAt: new Date(),
    attempts: 0,
    maxAttempts: 3,
    leasedUntil: null,
    lastScrapedAt: null,
    refreshAfter: null,
    lastError: null,
    skipReason: null,
  }

  try {
    // 2. Fetch the raw HTML from MyAnimeList.
    // We pass a null agent because for a single test, we don't need proxy management.
    console.log('Fetching raw HTML...')
    const rawHtml = (await fetchAnimeFull(mockTask)) as string

    if (
      rawHtml.includes('Too Many Requests') ||
      rawHtml.includes('Access Denied')
    ) {
      console.error('Error: Rate limited or blocked by MyAnimeList.')
      return
    }

    console.log('HTML fetched successfully. Processing data...')

    // 3. Process the HTML to extract structured data.
    const processedData = processAnime(rawHtml, mockTask)

    // 4. Display the final result in the console.
    console.log('\n✅ Scraping and processing finished!\n')
    console.log('--- RESULT ---')
    console.dir(processedData, { depth: null })
    console.log('--------------')
  } catch (error) {
    console.error('\n❌ An error occurred during the test:')
    console.error(error)
  }
}

// Run the test
testMalScraper()
