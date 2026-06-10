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
  const startedAt = new Date().toISOString()
  let lastActiveAt = Date.now()
  let isTrackingActive =
    document.visibilityState === 'visible' && document.hasFocus()

  document.documentElement.dataset.scrimbaLearningTracker = 'active'

  const sendTrackingState = (isActive: boolean) => {
    chrome.runtime.sendMessage(
      {
        type: 'scrimba:tracking-state-changed',
        sessionId,
        url: window.location.href,
        title: getPageTitle(),
        isActive,
        changedAt: new Date().toISOString(),
      },
      () => {
        void chrome.runtime.lastError
      },
    )
  }

  chrome.runtime.sendMessage(
    {
      type: 'scrimba:tracking-started',
      sessionId,
      url: window.location.href,
      title: getPageTitle(),
      startedAt,
      isActive: isTrackingActive,
    },
    () => {
      void chrome.runtime.lastError
    },
  )

  console.info('Scrimba Learning Tracker content script ready')

  const sendActivityPulse = () => {
    if (!isTrackingActive) {
      return
    }

    const now = Date.now()
    const activeSeconds = Math.max(0, Math.floor((now - lastActiveAt) / 1000))

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

  const isPageActive = () =>
    document.visibilityState === 'visible' && document.hasFocus()

  const pauseTracking = () => {
    if (!isTrackingActive) {
      return
    }

    sendActivityPulse()
    isTrackingActive = false
    sendTrackingState(false)
  }

  const resumeTracking = () => {
    if (isTrackingActive || !isPageActive()) {
      return
    }

    isTrackingActive = true
    lastActiveAt = Date.now()
    sendTrackingState(true)
  }

  const syncTrackingState = () => {
    if (isPageActive()) {
      resumeTracking()
      return
    }

    pauseTracking()
  }

  window.setInterval(sendActivityPulse, 15_000)
  window.addEventListener('pagehide', pauseTracking)
  window.addEventListener('focus', syncTrackingState)
  window.addEventListener('blur', () => {
    window.setTimeout(syncTrackingState, 0)
  })
  document.addEventListener('visibilitychange', syncTrackingState)
}
