export const createRateLimiter = (
  secondsLimit: number,
  minuteLimit: number
) => {
  let secondWindow: number[] = []
  let minuteWindow: number[] = []

  return async function rateLimit() {
    const now = Date.now()

    // limpiar ventanas
    secondWindow = secondWindow.filter((t) => now - t < 1000)
    minuteWindow = minuteWindow.filter((t) => now - t < 60000)

    let wait = 0

    if (secondWindow.length >= secondsLimit && secondWindow[0] !== undefined) {
      wait = Math.max(wait, 1000 - (now - secondWindow[0]))
    }

    if (minuteWindow.length >= minuteLimit && minuteWindow[0] !== undefined) {
      wait = Math.max(wait, 60000 - (now - minuteWindow[0]))
    }

    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait))
    }

    const ts = Date.now()
    secondWindow.push(ts)
    minuteWindow.push(ts)
  }
}
