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

type UserActivityEventType =
  | 'mousemove'
  | 'click'
  | 'keydown'
  | 'scroll'
  | 'touch'

if (isScrimbaUrl(window.location.href)) {
  const sessionId = createSessionId()
  const startedAt = new Date().toISOString()
  const listenerController = new AbortController()
  let lastActiveAt = Date.now()
  let lastActivityAt = Date.now()
  let lastActivityMessageAt = 0
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

  const sendUserActivity = (eventType: UserActivityEventType) => {
    const now = Date.now()

    lastActivityAt = now

    if (
      (eventType === 'mousemove' || eventType === 'scroll') &&
      now - lastActivityMessageAt < 2_000
    ) {
      return
    }

    lastActivityMessageAt = now

    chrome.runtime.sendMessage(
      {
        type: 'scrimba:user-activity',
        sessionId,
        url: window.location.href,
        title: getPageTitle(),
        eventType,
        activityAt: new Date(now).toISOString(),
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
      lastActivityAt: new Date(lastActivityAt).toISOString(),
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

  const cleanup = () => {
    pauseTracking()
    window.clearInterval(activityPulseIntervalId)
    listenerController.abort()
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

  const listenerOptions = { signal: listenerController.signal }
  const passiveListenerOptions = {
    passive: true,
    signal: listenerController.signal,
  }
  const activityPulseIntervalId = window.setInterval(sendActivityPulse, 15_000)

  window.addEventListener('pagehide', cleanup, listenerOptions)
  window.addEventListener('focus', syncTrackingState, listenerOptions)
  window.addEventListener('blur', () => {
    window.setTimeout(syncTrackingState, 0)
  }, listenerOptions)
  document.addEventListener('visibilitychange', syncTrackingState, listenerOptions)
  document.addEventListener(
    'mousemove',
    () => sendUserActivity('mousemove'),
    passiveListenerOptions,
  )
  document.addEventListener('click', () => sendUserActivity('click'), listenerOptions)
  document.addEventListener(
    'keydown',
    () => sendUserActivity('keydown'),
    listenerOptions,
  )
  document.addEventListener(
    'scroll',
    () => sendUserActivity('scroll'),
    passiveListenerOptions,
  )
  document.addEventListener(
    'touchstart',
    () => sendUserActivity('touch'),
    passiveListenerOptions,
  )
}
