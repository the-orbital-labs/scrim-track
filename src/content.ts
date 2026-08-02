const scrimbaHosts = new Set(['scrimba.com', 'v2.scrimba.com'])

type CurrentScrimbaPage = {
  sessionId: string
  url: string
  title: string | null
  startedAt: string
  isActive: boolean
  isIdle: boolean
  lastActiveAt: string | null
  lastInactiveAt: string | null
  lastActivityAt: string | null
  lastIdleAt: string | null
} | null

type DailyActivity = {
  date: string
  activeSeconds: number
  goalSeconds: number
  goalCompleted: boolean
  sessions: unknown[]
}

type UserSettings = {
  dailyGoalSeconds: number
  idleTimeoutSeconds: number
  trackingEnabled: boolean
  timezone: string
}

const defaultUserSettings: UserSettings = {
  dailyGoalSeconds: 30 * 60,
  idleTimeoutSeconds: 2 * 60,
  trackingEnabled: true,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
}

const getLocalDateKey = (value: Date = new Date()): string =>
  [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')

const getStorageValue = <Value>(
  key: string,
  fallbackValue: Value,
): Promise<Value> =>
  new Promise((resolve) => {
    try {
      chrome.storage.local.get(key, (items) => {
        if (chrome.runtime.lastError) {
          resolve(fallbackValue)
          return
        }

        resolve((items[key] as Value | undefined) ?? fallbackValue)
      })
    } catch {
      resolve(fallbackValue)
    }
  })

const setStorageValue = <Value>(key: string, value: Value): Promise<boolean> =>
  new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [key]: value }, () => {
        resolve(!chrome.runtime.lastError)
      })
    } catch {
      resolve(false)
    }
  })

const getUserSettings = async (): Promise<UserSettings> => ({
  ...defaultUserSettings,
  ...(await getStorageValue<Partial<UserSettings>>('userSettings', {})),
})

const getCurrentScrimbaPage = (): Promise<CurrentScrimbaPage> =>
  getStorageValue<CurrentScrimbaPage>('currentScrimbaPage', null)

const getTodayActivity = async (
  settings: UserSettings,
): Promise<DailyActivity> => {
  const today = getLocalDateKey()
  const activities = await getStorageValue<Record<string, DailyActivity>>(
    'dailyActivities',
    {},
  )

  return activities[today] ?? {
    date: today,
    activeSeconds: 0,
    goalSeconds: settings.dailyGoalSeconds,
    goalCompleted: false,
    sessions: [],
  }
}

const saveTrackingEnabled = async (
  trackingEnabled: boolean,
): Promise<UserSettings> => {
  const settings = await getUserSettings()
  const nextSettings = {
    ...settings,
    trackingEnabled,
  }

  await setStorageValue('userSettings', nextSettings)

  return nextSettings
}

const secondsToMinutes = (seconds: number): number =>
  Math.floor(Math.max(0, seconds) / 60)

const formatActiveTime = (seconds: number): string => {
  const normalizedSeconds = Math.max(0, Math.floor(seconds))
  const minutes = secondsToMinutes(normalizedSeconds)

  if (normalizedSeconds > 0 && minutes === 0) {
    return '<1m'
  }

  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`
}

const getGoalProgress = (
  todayActivity: DailyActivity,
  settings: UserSettings,
) => {
  const activeSeconds = todayActivity.activeSeconds
  const goalSeconds = todayActivity.goalSeconds || settings.dailyGoalSeconds
  const isComplete =
    todayActivity.goalCompleted || (goalSeconds > 0 && activeSeconds >= goalSeconds)
  const percentage =
    goalSeconds > 0 ? Math.floor((activeSeconds / goalSeconds) * 100) : 0

  return {
    activeSeconds,
    goalSeconds,
    isComplete,
    remainingSeconds: Math.max(0, goalSeconds - activeSeconds),
    percentage,
    visualPercentage: Math.min(100, percentage),
  }
}

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
const dashboardTabId = 'scrimtrack-dashboard-tab'
const embeddedDashboardHostId = 'scrimtrack-embedded-dashboard'

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
  let dashboardIntegrationObserver: MutationObserver | null = null
  let dashboardIntegrationFrameId: number | null = null
  let dashboardBoundsFrameId: number | null = null
  let dashboardTabBar: HTMLElement | null = null
  let isEmbeddedDashboardOpen = false

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

  const normalizeElementText = (element: Element): string =>
    (element.textContent ?? '').replace(/\s+/g, ' ').trim()

  const getIssuesTab = (): HTMLElement | null => {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>('a, button, [role="tab"]'),
    ).filter((candidate) => {
      if (
        candidate.id === dashboardTabId ||
        candidate.closest(`#${widgetHostId}, #${embeddedDashboardHostId}`)
      ) {
        return false
      }

      const label = normalizeElementText(candidate)
      const bounds = candidate.getBoundingClientRect()

      return (
        /^Issues(?:\s*\d+)?$/i.test(label) &&
        bounds.width > 0 &&
        bounds.width < 240 &&
        bounds.height > 0 &&
        bounds.height < 80
      )
    })

    return candidates.sort((first, second) => {
      const score = (candidate: HTMLElement) => {
        const surroundingText = normalizeElementText(
          candidate.parentElement ?? candidate,
        )

        return (
          (candidate.getAttribute('role') === 'tab' ? 10 : 0) +
          (/Recent/i.test(surroundingText) ? 3 : 0) +
          (/Completed/i.test(surroundingText) ? 3 : 0) +
          (/Discover|Started/i.test(surroundingText) ? 2 : 0)
        )
      }

      return score(second) - score(first)
    })[0] ?? null
  }

  const getTabBar = (tab: HTMLElement): HTMLElement => {
    const minimumWideWidth = Math.min(640, window.innerWidth * 0.5)
    let candidate = tab.parentElement
    let widestCompactParent = candidate ?? tab

    for (let depth = 0; candidate && depth < 5; depth += 1) {
      const bounds = candidate.getBoundingClientRect()
      const widestBounds = widestCompactParent.getBoundingClientRect()

      if (bounds.height <= 100 && bounds.width > widestBounds.width) {
        widestCompactParent = candidate
      }

      if (bounds.height <= 100 && bounds.width >= minimumWideWidth) {
        return candidate
      }

      candidate = candidate.parentElement
    }

    return widestCompactParent
  }

  const getEmbeddedDashboardHost = (): HTMLElement | null =>
    document.getElementById(embeddedDashboardHostId)

  const updateDashboardTabState = () => {
    const tab = document.getElementById(dashboardTabId)

    if (!(tab instanceof HTMLElement)) {
      return
    }

    tab.setAttribute('aria-selected', String(isEmbeddedDashboardOpen))
    tab.toggleAttribute('aria-current', isEmbeddedDashboardOpen)

    if (isEmbeddedDashboardOpen) {
      tab.style.setProperty('border-bottom', '2px solid #2563eb', 'important')
      tab.style.setProperty('color', '#1d4ed8', 'important')
      tab.style.setProperty('font-weight', '600', 'important')
      return
    }

    tab.style.removeProperty('border-bottom')
    tab.style.removeProperty('color')
    tab.style.removeProperty('font-weight')
  }

  const updateEmbeddedDashboardBounds = () => {
    dashboardBoundsFrameId = null

    const host = getEmbeddedDashboardHost()
    const tab = document.getElementById(dashboardTabId)

    if (!host || !(tab instanceof HTMLElement)) {
      return
    }

    dashboardTabBar = getTabBar(tab)
    const bounds = dashboardTabBar.getBoundingClientRect()
    const top = Math.max(0, Math.min(window.innerHeight - 160, bounds.bottom))
    const left = Math.max(0, bounds.left)
    const right = Math.min(window.innerWidth, bounds.right)

    host.style.setProperty('top', `${Math.round(top)}px`, 'important')
    host.style.setProperty('left', `${Math.round(left)}px`, 'important')
    host.style.setProperty(
      'width',
      `${Math.max(320, Math.round(right - left))}px`,
      'important',
    )
    host.style.setProperty(
      'height',
      `${Math.max(160, Math.round(window.innerHeight - top))}px`,
      'important',
    )
  }

  const scheduleEmbeddedDashboardBoundsUpdate = () => {
    if (!isEmbeddedDashboardOpen || dashboardBoundsFrameId !== null) {
      return
    }

    dashboardBoundsFrameId = window.requestAnimationFrame(
      updateEmbeddedDashboardBounds,
    )
  }

  const hideEmbeddedDashboard = () => {
    isEmbeddedDashboardOpen = false
    getEmbeddedDashboardHost()?.remove()
    updateDashboardTabState()
  }

  const showEmbeddedDashboard = () => {
    isEmbeddedDashboardOpen = true

    if (!getEmbeddedDashboardHost()) {
      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      const style = document.createElement('style')
      const frame = document.createElement('iframe')

      host.id = embeddedDashboardHostId
      host.setAttribute('aria-label', 'ScrimTrack dashboard')
      style.textContent = `
        :host {
          all: initial !important;
          position: fixed !important;
          display: block !important;
          z-index: 2147483000 !important;
          overflow: hidden !important;
          border-top: 1px solid rgba(22, 33, 52, 0.16) !important;
          background: #f7f8fb !important;
          box-shadow: 0 -6px 18px rgba(12, 18, 31, 0.06) !important;
          color-scheme: light dark;
        }

        iframe {
          display: block;
          width: 100%;
          height: 100%;
          border: 0;
          background: #f7f8fb;
        }
      `
      frame.src = chrome.runtime.getURL('dashboard.html?embedded=1')
      frame.title = 'ScrimTrack dashboard'
      frame.setAttribute('allow', 'clipboard-write')

      shadow.append(style, frame)
      document.documentElement.append(host)
    }

    updateDashboardTabState()
    scheduleEmbeddedDashboardBoundsUpdate()
  }

  const createDashboardTab = (issuesTab: HTMLElement): HTMLElement => {
    const tab = issuesTab.cloneNode(false) as HTMLElement

    Array.from(tab.attributes).forEach((attribute) => {
      if (attribute.name !== 'class' && attribute.name !== 'role') {
        tab.removeAttribute(attribute.name)
      }
    })

    tab.id = dashboardTabId
    tab.textContent = 'ScrimTrack'
    tab.setAttribute('aria-label', 'Open ScrimTrack dashboard')
    tab.setAttribute('aria-selected', 'false')
    tab.setAttribute('data-scrimtrack-dashboard-tab', '')

    if (tab instanceof HTMLAnchorElement) {
      tab.href = '#scrimtrack-dashboard'
    } else if (tab instanceof HTMLButtonElement) {
      tab.type = 'button'
    } else {
      tab.setAttribute('role', 'tab')
      tab.tabIndex = 0
    }

    tab.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      showEmbeddedDashboard()
    }, { signal: listenerController.signal })
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      showEmbeddedDashboard()
    }, { signal: listenerController.signal })

    return tab
  }

  const ensureDashboardIntegration = () => {
    dashboardIntegrationFrameId = null

    const issuesTab = getIssuesTab()

    if (!issuesTab) {
      if (isEmbeddedDashboardOpen) {
        hideEmbeddedDashboard()
      }
      return
    }

    let dashboardTab = document.getElementById(dashboardTabId)

    if (!(dashboardTab instanceof HTMLElement)) {
      dashboardTab = createDashboardTab(issuesTab)
    }

    if (issuesTab.nextElementSibling !== dashboardTab) {
      issuesTab.insertAdjacentElement('afterend', dashboardTab)
    }

    dashboardTabBar = getTabBar(dashboardTab)
    updateDashboardTabState()
    scheduleEmbeddedDashboardBoundsUpdate()
  }

  const scheduleDashboardIntegration = () => {
    if (dashboardIntegrationFrameId !== null) {
      return
    }

    dashboardIntegrationFrameId = window.requestAnimationFrame(
      ensureDashboardIntegration,
    )
  }

  const startDashboardIntegration = () => {
    scheduleDashboardIntegration()
    dashboardIntegrationObserver = new MutationObserver(
      scheduleDashboardIntegration,
    )
    dashboardIntegrationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    })
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

    void getUserSettings().then((settings) => Promise.all([
      Promise.resolve(settings),
      getTodayActivity(settings),
      getCurrentScrimbaPage(),
    ])).then(([settings, todayActivity, currentScrimbaPage]) => {
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
    dashboardIntegrationObserver?.disconnect()

    if (dashboardIntegrationFrameId !== null) {
      window.cancelAnimationFrame(dashboardIntegrationFrameId)
    }

    if (dashboardBoundsFrameId !== null) {
      window.cancelAnimationFrame(dashboardBoundsFrameId)
    }

    listenerController.abort()
    getEmbeddedDashboardHost()?.remove()
    document.getElementById(dashboardTabId)?.remove()
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

  const closeDashboardForScrimbaNavigation = (event: MouseEvent) => {
    if (!isEmbeddedDashboardOpen || !(event.target instanceof Element)) {
      return
    }

    const navigationControl = event.target.closest<HTMLElement>(
      'a[href], button, [role="tab"]',
    )

    if (
      !navigationControl ||
      navigationControl.id === dashboardTabId ||
      navigationControl.closest(`#${widgetHostId}, #${embeddedDashboardHostId}`)
    ) {
      return
    }

    if (
      navigationControl instanceof HTMLAnchorElement ||
      dashboardTabBar?.contains(navigationControl)
    ) {
      hideEmbeddedDashboard()
    }
  }

  startActiveSession()
  refreshWidget()
  startDashboardIntegration()
  widgetRefreshIntervalId = window.setInterval(refreshWidget, 5_000)

  window.addEventListener('pagehide', cleanup, listenerOptions)
  window.addEventListener('focus', syncTrackingState, listenerOptions)
  window.addEventListener('resize', scheduleEmbeddedDashboardBoundsUpdate, listenerOptions)
  window.addEventListener('blur', () => {
    window.setTimeout(syncTrackingState, 0)
  }, listenerOptions)
  document.addEventListener(
    'click',
    closeDashboardForScrimbaNavigation,
    { capture: true, signal: listenerController.signal },
  )
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
    () => {
      sendUserActivity('scroll')
      scheduleEmbeddedDashboardBoundsUpdate()
    },
    passiveListenerOptions,
  )
  document.addEventListener(
    'touchstart',
    () => sendUserActivity('touch'),
    passiveListenerOptions,
  )
}
