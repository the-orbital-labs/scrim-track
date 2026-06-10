const scrimbaOrigins = new Set(['https://scrimba.com', 'https://v2.scrimba.com'])

if (scrimbaOrigins.has(window.location.origin)) {
  document.documentElement.dataset.scrimbaLearningTracker = 'active'

  chrome.runtime.sendMessage(
    {
      type: 'scrimba:content-ready',
      url: window.location.href,
      detectedAt: new Date().toISOString(),
    },
    () => {
      void chrome.runtime.lastError
    },
  )

  console.info('Scrimba Learning Tracker content script ready')
}
