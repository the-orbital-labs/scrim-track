const scrimbaHosts = new Set(['scrimba.com', 'v2.scrimba.com'])

const isScrimbaUrl = (value: string): boolean => {
  try {
    const url = new URL(value)

    return url.protocol === 'https:' && scrimbaHosts.has(url.hostname)
  } catch {
    return false
  }
}

const createSessionId = (): string =>
  `scrimba-${Date.now()}-${Math.random().toString(36).slice(2)}`

const getPageTitle = (): string | null => {
  const title = document.title.trim()

  return title || null
}

if (isScrimbaUrl(window.location.href)) {
  const sessionId = createSessionId()
  let lastActiveAt = Date.now()

  document.documentElement.dataset.scrimbaLearningTracker = 'active'

  chrome.runtime.sendMessage(
    {
      type: 'scrimba:tracking-started',
      sessionId,
      url: window.location.href,
      title: getPageTitle(),
      startedAt: new Date().toISOString(),
    },
    () => {
      void chrome.runtime.lastError
    },
  )

  console.info('Scrimba Learning Tracker content script ready')

  const sendActivityPulse = () => {
    const now = Date.now()
    const activeSeconds =
      document.visibilityState === 'visible'
        ? Math.max(0, Math.floor((now - lastActiveAt) / 1000))
        : 0

    lastActiveAt = now

    if (activeSeconds === 0) {
      return
    }

    chrome.runtime.sendMessage(
      {
        type: 'scrimba:activity-pulse',
        sessionId,
        url: window.location.href,
        title: getPageTitle(),
        activeSeconds,
        recordedAt: new Date().toISOString(),
      },
      () => {
        void chrome.runtime.lastError
      },
    )
  }

  window.setInterval(sendActivityPulse, 15_000)
  window.addEventListener('pagehide', sendActivityPulse)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      sendActivityPulse()
      return
    }

    lastActiveAt = Date.now()
  })
}
