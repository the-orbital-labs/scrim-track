import { addActiveSecondsToToday, startLearningSession } from './activity'
import { ensurePathProgress } from './pathProgress'
import { isScrimbaUrl } from './scrimbaUrl'
import { ensureUserSettings, getUserSettings } from './settings'
import { getStorageValue, setStorageValue, updateStorageValue } from './storage'

const startupSnapshot = () => ({
  lastStartedAt: new Date().toISOString(),
  version: chrome.runtime.getManifest().version,
})

type TrackingStartedMessage = {
  type: 'scrimba:tracking-started'
  sessionId: string
  url: string
  title: string | null
  startedAt: string
  isActive: boolean
  lastActivityAt: string
}

type ActivityPulseMessage = {
  type: 'scrimba:activity-pulse'
  sessionId: string
  url: string
  title: string | null
  activeSeconds: number
  recordedAt: string
}

type TrackingStateChangedMessage = {
  type: 'scrimba:tracking-state-changed'
  sessionId: string
  url: string
  title: string | null
  isActive: boolean
  changedAt: string
}

type UserActivityEventType =
  | 'mousemove'
  | 'click'
  | 'keydown'
  | 'scroll'
  | 'touch'

type UserActivityMessage = {
  type: 'scrimba:user-activity'
  sessionId: string
  url: string
  title: string | null
  eventType: UserActivityEventType
  activityAt: string
}

const userActivityEventTypes = new Set<UserActivityEventType>([
  'mousemove',
  'click',
  'keydown',
  'scroll',
  'touch',
])

const isTrackingStartedMessage = (
  message: unknown,
): message is TrackingStartedMessage => {
  if (typeof message !== 'object' || message === null || !('type' in message)) {
    return false
  }

  const candidate = message as Record<string, unknown>

  return (
    candidate.type === 'scrimba:tracking-started' &&
    typeof candidate.sessionId === 'string' &&
    typeof candidate.url === 'string' &&
    isScrimbaUrl(candidate.url) &&
    (typeof candidate.title === 'string' || candidate.title === null) &&
    typeof candidate.startedAt === 'string' &&
    typeof candidate.isActive === 'boolean' &&
    typeof candidate.lastActivityAt === 'string'
  )
}

const isActivityPulseMessage = (
  message: unknown,
): message is ActivityPulseMessage => {
  if (typeof message !== 'object' || message === null || !('type' in message)) {
    return false
  }

  const candidate = message as Record<string, unknown>

  return (
    candidate.type === 'scrimba:activity-pulse' &&
    typeof candidate.sessionId === 'string' &&
    typeof candidate.url === 'string' &&
    isScrimbaUrl(candidate.url) &&
    (typeof candidate.title === 'string' || candidate.title === null) &&
    typeof candidate.activeSeconds === 'number' &&
    Number.isFinite(candidate.activeSeconds) &&
    candidate.activeSeconds > 0 &&
    typeof candidate.recordedAt === 'string'
  )
}

const isTrackingStateChangedMessage = (
  message: unknown,
): message is TrackingStateChangedMessage => {
  if (typeof message !== 'object' || message === null || !('type' in message)) {
    return false
  }

  const candidate = message as Record<string, unknown>

  return (
    candidate.type === 'scrimba:tracking-state-changed' &&
    typeof candidate.sessionId === 'string' &&
    typeof candidate.url === 'string' &&
    isScrimbaUrl(candidate.url) &&
    (typeof candidate.title === 'string' || candidate.title === null) &&
    typeof candidate.isActive === 'boolean' &&
    typeof candidate.changedAt === 'string'
  )
}

const isUserActivityMessage = (message: unknown): message is UserActivityMessage => {
  if (typeof message !== 'object' || message === null || !('type' in message)) {
    return false
  }

  const candidate = message as Record<string, unknown>

  return (
    candidate.type === 'scrimba:user-activity' &&
    typeof candidate.sessionId === 'string' &&
    typeof candidate.url === 'string' &&
    isScrimbaUrl(candidate.url) &&
    (typeof candidate.title === 'string' || candidate.title === null) &&
    userActivityEventTypes.has(candidate.eventType as UserActivityEventType) &&
    typeof candidate.activityAt === 'string'
  )
}

chrome.runtime.onInstalled.addListener(() => {
  void Promise.all([
    updateStorageValue('extensionStatus', (extensionStatus) => ({
      ...extensionStatus,
      installedAt: new Date().toISOString(),
      ...startupSnapshot(),
    })),
    ensureUserSettings(),
    ensurePathProgress(),
  ])

  console.info('Scrimba Learning Tracker installed')
})

chrome.runtime.onStartup.addListener(() => {
  void updateStorageValue('extensionStatus', (extensionStatus) => ({
    ...extensionStatus,
    ...startupSnapshot(),
  }))

  console.info('Scrimba Learning Tracker service worker started')
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isTrackingStartedMessage(message)) {
    void getUserSettings().then((settings) => {
      if (!settings.trackingEnabled) {
        sendResponse({ ok: false, trackingEnabled: false })
        return
      }

      void Promise.all([
        setStorageValue('currentScrimbaPage', {
          sessionId: message.sessionId,
          url: message.url,
          title: message.title,
          startedAt: message.startedAt,
          isActive: message.isActive,
          lastActiveAt: message.isActive ? message.startedAt : null,
          lastInactiveAt: message.isActive ? null : message.startedAt,
          lastActivityAt: message.lastActivityAt,
        }),
        startLearningSession({
          id: message.sessionId,
          url: message.url,
          title: message.title,
          startedAt: message.startedAt,
        }),
      ]).then(([ok]) => {
        sendResponse({ ok, trackingEnabled: true })
      })
    })

    return true
  }

  if (isTrackingStateChangedMessage(message)) {
    void getUserSettings().then((settings) => {
      if (!settings.trackingEnabled) {
        sendResponse({ ok: false, trackingEnabled: false })
        return
      }

      void updateStorageValue('currentScrimbaPage', (currentScrimbaPage) => ({
        sessionId: message.sessionId,
        url: message.url,
        title: message.title,
        startedAt: currentScrimbaPage?.startedAt ?? message.changedAt,
        isActive: message.isActive,
        lastActiveAt: message.isActive
          ? message.changedAt
          : (currentScrimbaPage?.lastActiveAt ?? null),
        lastInactiveAt: message.isActive
          ? (currentScrimbaPage?.lastInactiveAt ?? null)
          : message.changedAt,
        lastActivityAt: currentScrimbaPage?.lastActivityAt ?? null,
      })).then(() => {
        sendResponse({
          ok: true,
          isActive: message.isActive,
          trackingEnabled: true,
        })
      })
    })

    return true
  }

  if (isUserActivityMessage(message)) {
    void getUserSettings().then((settings) => {
      if (!settings.trackingEnabled) {
        sendResponse({ ok: false, trackingEnabled: false })
        return
      }

      void updateStorageValue('currentScrimbaPage', (currentScrimbaPage) => {
        if (currentScrimbaPage?.sessionId !== message.sessionId) {
          return currentScrimbaPage
        }

        return {
          ...currentScrimbaPage,
          url: message.url,
          title: message.title,
          lastActivityAt: message.activityAt,
        }
      }).then((currentScrimbaPage) => {
        sendResponse({
          ok: currentScrimbaPage?.sessionId === message.sessionId,
          eventType: message.eventType,
          lastActivityAt: currentScrimbaPage?.lastActivityAt ?? null,
          trackingEnabled: true,
        })
      })
    })

    return true
  }

  if (isActivityPulseMessage(message)) {
    void getUserSettings().then((settings) => {
      if (!settings.trackingEnabled) {
        sendResponse({ ok: false, trackingEnabled: false })
        return
      }

      void getStorageValue('currentScrimbaPage').then((currentScrimbaPage) => {
        if (
          currentScrimbaPage?.sessionId !== message.sessionId ||
          !currentScrimbaPage.isActive
        ) {
          sendResponse({
            ok: false,
            isActive: currentScrimbaPage?.isActive ?? false,
            trackingEnabled: true,
          })
          return
        }

        void addActiveSecondsToToday({
          activeSeconds: message.activeSeconds,
          recordedAt: message.recordedAt,
          sessionId: message.sessionId,
          url: message.url,
          title: message.title,
        }).then(() => {
          sendResponse({ ok: true, isActive: true, trackingEnabled: true })
        })
      })
    })

    return true
  }
})
