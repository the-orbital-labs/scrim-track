export const scrimbaUrlPatterns = [
  'https://scrimba.com/*',
  'https://v2.scrimba.com/*',
] as const

const scrimbaHosts = new Set(['scrimba.com', 'v2.scrimba.com'])

export const isScrimbaUrl = (value: string): boolean => {
  try {
    const url = new URL(value)

    return url.protocol === 'https:' && scrimbaHosts.has(url.hostname)
  } catch {
    return false
  }
}
