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
  const sessionId = createSessionId()
  const startedAt = new Date().toISOString()
  const listenerController = new AbortController()
  let lastActivityAt = Date.now()
  let lastActivityMessageAt = 0
  let trackingTickIntervalId: number | null = null
  let isTrackingIdle = false
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

  const stopTrackingTick = () => {
    if (trackingTickIntervalId === null) {
      return
    }

    window.clearInterval(trackingTickIntervalId)
    trackingTickIntervalId = null
  }

  const handleTickResponse = (response: unknown) => {
    if (!isRuntimeResponse(response)) {
      return
    }

    if (response.trackingEnabled === false || response.isIdle === true) {
      isTrackingIdle = response.isIdle === true
      stopTrackingTick()
    }
  }

  const sendTrackingTick = () => {
    if (!isTrackingActive || isTrackingIdle) {
      stopTrackingTick()
      return
    }

    chrome.runtime.sendMessage(
      {
        type: 'scrimba:activity-pulse',
        sessionId,
        url: window.location.href,
        title: getPageTitle(),
        activeSeconds: 5,
        recordedAt: new Date().toISOString(),
      },
      handleTickResponse,
    )
  }

  const startTrackingTick = () => {
    if (!isTrackingActive || isTrackingIdle || trackingTickIntervalId !== null) {
      return
    }

    trackingTickIntervalId = window.setInterval(sendTrackingTick, 5_000)
  }

  const sendUserActivity = (eventType: UserActivityEventType) => {
    const now = Date.now()

    lastActivityAt = now
    isTrackingIdle = false

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
      (response) => {
        void chrome.runtime.lastError

        if (isRuntimeResponse(response) && response.ok && isPageActive()) {
          startTrackingTick()
        }
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
    (response) => {
      void chrome.runtime.lastError

      if (isRuntimeResponse(response) && response.ok) {
        startTrackingTick()
      }
    },
  )

  console.info('Scrimba Learning Tracker content script ready')

  const isPageActive = () =>
    document.visibilityState === 'visible' && document.hasFocus()

  const pauseTracking = () => {
    if (!isTrackingActive) {
      return
    }

    isTrackingActive = false
    stopTrackingTick()
    sendTrackingState(false)
  }

  const cleanup = () => {
    pauseTracking()
    stopTrackingTick()
    listenerController.abort()
  }

  const resumeTracking = () => {
    if (isTrackingActive || !isPageActive()) {
      return
    }

    isTrackingActive = true
    sendTrackingState(true)
    startTrackingTick()
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
