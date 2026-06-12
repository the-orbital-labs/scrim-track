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

type RuntimeResponse = {
  isIdle?: boolean
  ok?: boolean
  trackingEnabled?: boolean
}

const isRuntimeResponse = (response: unknown): response is RuntimeResponse =>
  typeof response === 'object' && response !== null

if (
  isScrimbaUrl(window.location.href) &&
  document.documentElement.dataset.scrimbaLearningTracker !== 'active'
) {
  const listenerController = new AbortController()
  let currentSessionId: string | null = null
  let lastActivityAt = Date.now()
  let lastActivityMessageAt = 0
  let lastAccountedAt = 0
  let trackingTickIntervalId: number | null = null
  let isTrackingActive = false
  let isTrackingIdle = false

  document.documentElement.dataset.scrimbaLearningTracker = 'active'

  const isPageActive = () =>
    document.visibilityState === 'visible' && document.hasFocus()

  const getUnsentActiveSeconds = (recordedAt: number): number => {
    if (lastAccountedAt === 0) {
      return 0
    }

    return Math.max(0, Math.floor((recordedAt - lastAccountedAt) / 1000))
  }

  const stopTrackingTick = () => {
    if (trackingTickIntervalId === null) {
      return
    }

    window.clearInterval(trackingTickIntervalId)
    trackingTickIntervalId = null
  }

  const markSessionStopped = (sessionId: string) => {
    if (currentSessionId !== sessionId) {
      return
    }

    isTrackingActive = false
    isTrackingIdle = true
    currentSessionId = null
    lastAccountedAt = 0
    stopTrackingTick()
  }

  const handleTickResponse = (sessionId: string, response: unknown) => {
    if (!isRuntimeResponse(response)) {
      return
    }

    if (response.trackingEnabled === false || response.isIdle === true) {
      markSessionStopped(sessionId)
    }
  }

  const sendTrackingTick = () => {
    if (!currentSessionId || !isTrackingActive || isTrackingIdle) {
      stopTrackingTick()
      return
    }

    const recordedAt = Date.now()
    const activeSeconds = getUnsentActiveSeconds(recordedAt)

    if (activeSeconds === 0) {
      return
    }

    const sessionId = currentSessionId
    lastAccountedAt = recordedAt

    chrome.runtime.sendMessage(
      {
        type: 'scrimba:activity-pulse',
        sessionId,
        url: window.location.href,
        title: getPageTitle(),
        activeSeconds,
        recordedAt: new Date(recordedAt).toISOString(),
      },
      (response) => handleTickResponse(sessionId, response),
    )
  }

  const startTrackingTick = () => {
    if (!isTrackingActive || isTrackingIdle || trackingTickIntervalId !== null) {
      return
    }

    trackingTickIntervalId = window.setInterval(sendTrackingTick, 5_000)
  }

  const startActiveSession = () => {
    if (currentSessionId || !isPageActive()) {
      return
    }

    const now = Date.now()
    const sessionId = createSessionId()

    currentSessionId = sessionId
    lastActivityAt = now
    lastAccountedAt = now
    isTrackingActive = true
    isTrackingIdle = false

    chrome.runtime.sendMessage(
      {
        type: 'scrimba:tracking-started',
        sessionId,
        url: window.location.href,
        title: getPageTitle(),
        startedAt: new Date(now).toISOString(),
        isActive: true,
        lastActivityAt: new Date(lastActivityAt).toISOString(),
      },
      (response) => {
        void chrome.runtime.lastError

        if (
          currentSessionId !== sessionId ||
          !isRuntimeResponse(response) ||
          !response.ok
        ) {
          markSessionStopped(sessionId)
          return
        }

        startTrackingTick()
      },
    )
  }

  const stopActiveSession = () => {
    if (!currentSessionId) {
      return
    }

    const stoppedAt = Date.now()
    const sessionId = currentSessionId
    const activeSeconds =
      isTrackingActive && !isTrackingIdle ? getUnsentActiveSeconds(stoppedAt) : 0

    currentSessionId = null
    isTrackingActive = false
    isTrackingIdle = false
    lastAccountedAt = 0
    stopTrackingTick()

    chrome.runtime.sendMessage(
      {
        type: 'scrimba:tracking-stopped',
        sessionId,
        url: window.location.href,
        title: getPageTitle(),
        activeSeconds,
        stoppedAt: new Date(stoppedAt).toISOString(),
      },
      () => {
        void chrome.runtime.lastError
      },
    )
  }

  const sendUserActivity = (eventType: UserActivityEventType) => {
    const now = Date.now()

    if (!currentSessionId) {
      startActiveSession()
      return
    }

    lastActivityAt = now
    isTrackingIdle = false

    if (
      (eventType === 'mousemove' || eventType === 'scroll') &&
      now - lastActivityMessageAt < 2_000
    ) {
      return
    }

    const sessionId = currentSessionId
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
      (response) => {
        void chrome.runtime.lastError

        if (
          currentSessionId === sessionId &&
          isRuntimeResponse(response) &&
          response.ok &&
          isPageActive()
        ) {
          startTrackingTick()
        }
      },
    )
  }

  console.info('Scrimba Learning Tracker content script ready')

  const cleanup = () => {
    stopActiveSession()
    listenerController.abort()
  }

  const syncTrackingState = () => {
    if (isPageActive()) {
      startActiveSession()
      return
    }

    stopActiveSession()
  }

  const listenerOptions = { signal: listenerController.signal }
  const passiveListenerOptions = {
    passive: true,
    signal: listenerController.signal,
  }

  startActiveSession()

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
