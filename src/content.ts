const scrimbaHosts = new Set(['scrimba.com', 'v2.scrimba.com'])

const isScrimbaUrl = (value: string): boolean => {
  try {
    const url = new URL(value)

    return url.protocol === 'https:' && scrimbaHosts.has(url.hostname)
  } catch {
    return false
  }
}

if (isScrimbaUrl(window.location.href)) {
  const title = document.title.trim()

  document.documentElement.dataset.scrimbaLearningTracker = 'active'

  chrome.runtime.sendMessage(
    {
      type: 'scrimba:tracking-started',
      url: window.location.href,
      title: title || null,
      startedAt: new Date().toISOString(),
    },
    () => {
      void chrome.runtime.lastError
    },
  )

  console.info('Scrimba Learning Tracker content script ready')
}
