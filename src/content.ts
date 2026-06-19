import { getActivityForDate } from './activity'
import { formatActiveTime, getGoalProgress } from './goalProgress'
import { getUserSettings, saveTrackingEnabled } from './settings'
import { getStorageValue } from './storage'

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

const sessionResumeGraceMs = 60_000

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

const widgetHostId = 'scrimtrack-page-widget'

if (
  isScrimbaUrl(window.location.href) &&
  document.documentElement.dataset.scrimbaLearningTracker !== 'active'
) {
  const listenerController = new AbortController()
  let currentSessionId: string | null = null
  let currentSessionStartedAt: string | null = null
  let pausedSession:
    | {
        id: string
        startedAt: string
        stoppedAt: number
      }
    | null = null
  let lastActivityAt = Date.now()
  let lastActivityMessageAt = 0
  let lastAccountedAt = 0
  let trackingTickIntervalId: number | null = null
  let widgetRefreshIntervalId: number | null = null
  let isTrackingActive = false
  let isTrackingIdle = false
  let isWidgetRefreshing = false

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

  const stopWidgetRefresh = () => {
    if (widgetRefreshIntervalId === null) {
      return
    }

    window.clearInterval(widgetRefreshIntervalId)
    widgetRefreshIntervalId = null
  }

  const markSessionStopped = (sessionId: string) => {
    if (currentSessionId !== sessionId) {
      return
    }

    isTrackingActive = false
    isTrackingIdle = true
    currentSessionId = null
    currentSessionStartedAt = null
    pausedSession = null
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
    const reusableSession =
      pausedSession && now - pausedSession.stoppedAt <= sessionResumeGraceMs
        ? pausedSession
        : null
    const startedAt = reusableSession?.startedAt ?? new Date(now).toISOString()
    const sessionId = reusableSession?.id ?? createSessionId()

    currentSessionId = sessionId
    currentSessionStartedAt = startedAt
    pausedSession = null
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
        startedAt,
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

  const stopActiveSession = (rememberForGrace = true): Promise<void> => {
    if (!currentSessionId) {
      return Promise.resolve()
    }

    const stoppedAt = Date.now()
    const sessionId = currentSessionId
    const startedAt = currentSessionStartedAt
    const activeSeconds =
      isTrackingActive && !isTrackingIdle ? getUnsentActiveSeconds(stoppedAt) : 0

    currentSessionId = null
    currentSessionStartedAt = null
    isTrackingActive = false
    isTrackingIdle = false
    lastAccountedAt = 0
    stopTrackingTick()

    pausedSession =
      rememberForGrace && startedAt
        ? {
            id: sessionId,
            startedAt,
            stoppedAt,
          }
        : null

    return new Promise((resolve) => {
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
          resolve()
        },
      )
    })
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

  const openDashboard = () => {
    try {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage()
        return
      }

      window.open(chrome.runtime.getURL('dashboard.html'), '_blank', 'noopener')
    } catch {
      window.open(chrome.runtime.getURL('dashboard.html'), '_blank', 'noopener')
    }
  }

  const createWidget = () => {
    if (document.getElementById(widgetHostId)) {
      return null
    }

    const host = document.createElement('div')
    host.id = widgetHostId
    const shadow = host.attachShadow({ mode: 'open' })

    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          position: fixed;
          right: max(16px, env(safe-area-inset-right));
          bottom: max(16px, env(safe-area-inset-bottom));
          z-index: 2147483647;
          color-scheme: light;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        *, *::before, *::after {
          box-sizing: border-box;
        }

        .widget {
          display: grid;
          gap: 10px;
          width: min(312px, calc(100vw - 32px));
          border: 1px solid rgba(22, 33, 52, 0.16);
          border-radius: 8px;
          padding: 12px;
          background: #ffffff;
          box-shadow: 0 18px 42px rgba(12, 18, 31, 0.22);
          color: #101828;
          font: inherit;
        }

        .widget.is-collapsed {
          width: auto;
          min-width: 188px;
          padding: 8px;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .brand {
          display: inline-flex;
          align-items: center;
          min-width: 0;
          gap: 8px;
          font-weight: 800;
        }

        .mark {
          display: inline-grid;
          flex: 0 0 auto;
          width: 24px;
          height: 24px;
          place-items: center;
          border-radius: 6px;
          background: #111827;
          color: #ffffff;
          font-size: 11px;
          font-weight: 900;
        }

        .status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          color: #344054;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #16a34a;
        }

        .dot.is-paused {
          background: #b42318;
        }

        .dot.is-idle {
          background: #f59e0b;
        }

        .icon-button {
          display: inline-grid;
          flex: 0 0 auto;
          width: 28px;
          height: 28px;
          place-items: center;
          border: 1px solid rgba(22, 33, 52, 0.16);
          border-radius: 6px;
          background: #f8fafc;
          color: #101828;
          font: inherit;
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
        }

        .icon-button:hover {
          border-color: #7c3aed;
          color: #6d28d9;
        }

        .icon-button:focus-visible,
        .button:focus-visible {
          outline: 3px solid rgba(124, 58, 237, 0.28);
          outline-offset: 2px;
        }

        .collapsed-line {
          display: none;
          align-items: center;
          gap: 8px;
        }

        .widget.is-collapsed .header,
        .widget.is-collapsed .body,
        .widget.is-collapsed .actions {
          display: none;
        }

        .widget.is-collapsed .collapsed-line {
          display: flex;
        }

        .body {
          display: grid;
          gap: 10px;
        }

        .metrics {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .metric {
          display: grid;
          gap: 4px;
          min-width: 0;
          border: 1px solid rgba(22, 33, 52, 0.12);
          border-radius: 7px;
          padding: 9px;
          background: #f8fafc;
          color: #667085;
          font-size: 12px;
          font-weight: 800;
        }

        .metric strong {
          overflow-wrap: anywhere;
          color: #101828;
          font-size: 20px;
          line-height: 1;
        }

        .progress {
          display: grid;
          gap: 6px;
          color: #667085;
          font-size: 12px;
          font-weight: 800;
        }

        .progress-label {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
        }

        .progress-label strong {
          color: #101828;
        }

        .track {
          overflow: hidden;
          height: 7px;
          border-radius: 999px;
          background: #e4e7ec;
        }

        .track span {
          display: block;
          width: 0%;
          height: 100%;
          border-radius: inherit;
          background: #16a34a;
          transition: width 180ms ease;
        }

        .actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .button {
          min-height: 34px;
          border: 1px solid rgba(22, 33, 52, 0.16);
          border-radius: 7px;
          padding: 7px 10px;
          background: #ffffff;
          color: #101828;
          font: inherit;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
        }

        .button.primary {
          border-color: #7c3aed;
          background: #7c3aed;
          color: #ffffff;
        }

        .button:hover {
          border-color: #7c3aed;
          color: #6d28d9;
        }

        .button.primary:hover {
          color: #ffffff;
          background: #6d28d9;
        }
      </style>

      <aside class="widget" aria-label="ScrimTrack page widget">
        <div class="collapsed-line">
          <span class="mark" aria-hidden="true">ST</span>
          <span class="status">
            <span class="dot" data-status-dot></span>
            <span data-collapsed-status>Tracking</span>
          </span>
          <button class="icon-button" type="button" title="Expand" aria-label="Expand" data-expand>+</button>
        </div>

        <div class="header">
          <span class="brand">
            <span class="mark" aria-hidden="true">ST</span>
            ScrimTrack
          </span>
          <button class="icon-button" type="button" title="Collapse" aria-label="Collapse" data-collapse>-</button>
        </div>

        <div class="body">
          <span class="status">
            <span class="dot" data-status-dot></span>
            <span data-status-text>Tracking</span>
          </span>

          <div class="metrics">
            <span class="metric">
              Today
              <strong data-today>0m</strong>
            </span>
            <span class="metric">
              Goal
              <strong data-goal>30m</strong>
            </span>
          </div>

          <div class="progress">
            <div class="progress-label">
              <span data-progress-label>0m remaining</span>
              <strong data-progress-percent>0%</strong>
            </div>
            <div class="track" aria-hidden="true">
              <span data-progress-bar></span>
            </div>
          </div>
        </div>

        <div class="actions">
          <button class="button primary" type="button" data-open-dashboard>Dashboard</button>
          <button class="button" type="button" data-toggle-tracking>Pause</button>
        </div>
      </aside>
    `

    document.documentElement.append(host)

    return {
      host,
      shadow,
      widget: shadow.querySelector<HTMLElement>('.widget'),
      statusDots: shadow.querySelectorAll<HTMLElement>('[data-status-dot]'),
      statusText: shadow.querySelector<HTMLElement>('[data-status-text]'),
      collapsedStatus: shadow.querySelector<HTMLElement>('[data-collapsed-status]'),
      today: shadow.querySelector<HTMLElement>('[data-today]'),
      goal: shadow.querySelector<HTMLElement>('[data-goal]'),
      progressLabel: shadow.querySelector<HTMLElement>('[data-progress-label]'),
      progressPercent: shadow.querySelector<HTMLElement>('[data-progress-percent]'),
      progressBar: shadow.querySelector<HTMLElement>('[data-progress-bar]'),
      toggleTracking: shadow.querySelector<HTMLButtonElement>('[data-toggle-tracking]'),
      openDashboard: shadow.querySelector<HTMLButtonElement>('[data-open-dashboard]'),
      collapse: shadow.querySelector<HTMLButtonElement>('[data-collapse]'),
      expand: shadow.querySelector<HTMLButtonElement>('[data-expand]'),
    }
  }

  const widget = createWidget()

  const setWidgetCollapsed = (collapsed: boolean) => {
    widget?.widget?.classList.toggle('is-collapsed', collapsed)
  }

  const refreshWidget = () => {
    if (!widget || isWidgetRefreshing) {
      return
    }

    isWidgetRefreshing = true

    void Promise.all([
      getUserSettings(),
      getActivityForDate(new Date()),
      getStorageValue('currentScrimbaPage'),
    ]).then(([settings, todayActivity, currentScrimbaPage]) => {
      const progress = getGoalProgress(todayActivity, settings)
      const trackingPaused = !settings.trackingEnabled
      const isCurrentPageSession =
        currentScrimbaPage?.url === window.location.href &&
        currentScrimbaPage.isActive
      const statusText = trackingPaused
        ? 'Paused'
        : isTrackingIdle || currentScrimbaPage?.isIdle
          ? 'Idle'
          : isCurrentPageSession || isTrackingActive
            ? 'Tracking'
            : 'Ready'
      const goalText =
        progress.goalSeconds > 0 ? formatActiveTime(progress.goalSeconds) : 'Not set'
      const remainingText =
        progress.goalSeconds > 0
          ? progress.isComplete
            ? 'Goal complete'
            : `${formatActiveTime(progress.remainingSeconds)} remaining`
          : 'Set a goal'

      widget.statusText!.textContent = statusText
      widget.collapsedStatus!.textContent = statusText
      widget.today!.textContent = formatActiveTime(progress.activeSeconds)
      widget.goal!.textContent = goalText
      widget.progressLabel!.textContent = remainingText
      widget.progressPercent!.textContent = `${progress.percentage}%`
      widget.progressBar!.style.width = `${progress.visualPercentage}%`
      widget.toggleTracking!.textContent = trackingPaused ? 'Resume' : 'Pause'

      widget.statusDots.forEach((dot) => {
        dot.classList.toggle('is-paused', trackingPaused)
        dot.classList.toggle('is-idle', !trackingPaused && statusText === 'Idle')
      })
    }).finally(() => {
      isWidgetRefreshing = false
    })
  }

  widget?.openDashboard?.addEventListener('click', openDashboard, {
    signal: listenerController.signal,
  })
  widget?.collapse?.addEventListener('click', () => setWidgetCollapsed(true), {
    signal: listenerController.signal,
  })
  widget?.expand?.addEventListener('click', () => setWidgetCollapsed(false), {
    signal: listenerController.signal,
  })
  widget?.toggleTracking?.addEventListener('click', () => {
    void getUserSettings().then((settings) => {
      const nextTrackingEnabled = !settings.trackingEnabled

      if (!nextTrackingEnabled) {
        void stopActiveSession(false)
          .then(() => saveTrackingEnabled(false))
          .then(refreshWidget)
        return
      }

      void saveTrackingEnabled(true).then(() => {
        startActiveSession()
        refreshWidget()
      })
    })
  }, { signal: listenerController.signal })

  console.info('Scrimba Learning Tracker content script ready')

  const cleanup = () => {
    void stopActiveSession(false)
    stopWidgetRefresh()
    listenerController.abort()
    widget?.host.remove()
  }

  const syncTrackingState = () => {
    if (isPageActive()) {
      startActiveSession()
      return
    }

    void stopActiveSession()
  }

  const listenerOptions = { signal: listenerController.signal }
  const passiveListenerOptions = {
    passive: true,
    signal: listenerController.signal,
  }

  startActiveSession()
  refreshWidget()
  widgetRefreshIntervalId = window.setInterval(refreshWidget, 5_000)

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
