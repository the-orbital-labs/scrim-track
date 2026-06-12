import {
  addActiveSecondsForInterval,
  setLearningSessionActiveState,
  startLearningSession,
} from './activity'
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

const getTime = (value: string): number => {
  const time = new Date(value).getTime()

  return Number.isFinite(time) ? time : 0
}

const getIdleAt = (lastActivityAt: string, idleTimeoutSeconds: number): string =>
  new Date(getTime(lastActivityAt) + idleTimeoutSeconds * 1000).toISOString()

const getCountableActiveSeconds = (
  lastActivityAt: string | null,
  recordedAt: string,
  activeSeconds: number,
  idleTimeoutSeconds: number,
): number => {
  if (!lastActivityAt) {
    return activeSeconds
  }

  const recordedAtTime = getTime(recordedAt)
  const pulseStartedAtTime = recordedAtTime - activeSeconds * 1000
  const idleAtTime = getTime(getIdleAt(lastActivityAt, idleTimeoutSeconds))

  return Math.max(
    0,
    Math.min(activeSeconds, Math.floor((idleAtTime - pulseStartedAtTime) / 1000)),
  )
}

const getCountableEndedAt = (
  recordedAt: string,
  activeSeconds: number,
  countableActiveSeconds: number,
): string => {
  const recordedAtTime = getTime(recordedAt)
  const pulseStartedAtTime = recordedAtTime - activeSeconds * 1000

  return new Date(
    pulseStartedAtTime + countableActiveSeconds * 1000,
  ).toISOString()
}

const isIdleAt = (
  lastActivityAt: string | null,
  recordedAt: string,
  idleTimeoutSeconds: number,
): boolean => {
  if (!lastActivityAt) {
    return false
  }

  return getTime(recordedAt) >= getTime(getIdleAt(lastActivityAt, idleTimeoutSeconds))
}

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
    candidate.activeSeconds === 5 &&
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

      const writes: Promise<unknown>[] = [
        setStorageValue('currentScrimbaPage', {
          sessionId: message.sessionId,
          url: message.url,
          title: message.title,
          startedAt: message.startedAt,
          isActive: message.isActive,
          isIdle: false,
          lastActiveAt: message.isActive ? message.startedAt : null,
          lastInactiveAt: message.isActive ? null : message.startedAt,
          lastActivityAt: message.lastActivityAt,
          lastIdleAt: null,
        }),
      ]

      if (message.isActive) {
        writes.push(
          startLearningSession({
            id: message.sessionId,
            url: message.url,
            title: message.title,
            startedAt: message.startedAt,
            isActive: true,
          }),
        )
      }

      void Promise.all(writes).then(([ok]) => {
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

      void updateStorageValue('currentScrimbaPage', (currentScrimbaPage) => {
        const isCurrentSession =
          currentScrimbaPage?.sessionId === message.sessionId

        if (!message.isActive && !isCurrentSession) {
          return currentScrimbaPage
        }

        return {
          sessionId: message.sessionId,
          url: message.url,
          title: message.title,
          startedAt:
            isCurrentSession && currentScrimbaPage
              ? currentScrimbaPage.startedAt
              : message.changedAt,
          isActive: message.isActive,
          isIdle: isCurrentSession ? currentScrimbaPage.isIdle : false,
          lastActiveAt: message.isActive
            ? message.changedAt
            : (currentScrimbaPage?.lastActiveAt ?? null),
          lastInactiveAt: message.isActive
            ? (isCurrentSession ? currentScrimbaPage.lastInactiveAt : null)
            : message.changedAt,
          lastActivityAt: isCurrentSession
            ? currentScrimbaPage.lastActivityAt
            : message.changedAt,
          lastIdleAt: isCurrentSession ? currentScrimbaPage.lastIdleAt : null,
        }
      }).then((currentScrimbaPage) => {
        const isCurrentSession =
          currentScrimbaPage?.sessionId === message.sessionId
        const sessionUpdate = message.isActive
          ? startLearningSession({
              id: message.sessionId,
              url: message.url,
              title: message.title,
              startedAt: message.changedAt,
              isActive: true,
            }).then(() => setLearningSessionActiveState(message.sessionId, true))
          : setLearningSessionActiveState(message.sessionId, false)

        void sessionUpdate.then(() => {
          sendResponse({
            ok: isCurrentSession,
            isActive: currentScrimbaPage?.isActive ?? false,
            trackingEnabled: true,
          })
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
          isIdle: false,
          lastActiveAt: currentScrimbaPage.isActive
            ? message.activityAt
            : currentScrimbaPage.lastActiveAt,
          lastActivityAt: message.activityAt,
          lastIdleAt: null,
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
          !currentScrimbaPage.isActive ||
          currentScrimbaPage.isIdle
        ) {
          sendResponse({
            ok: false,
            isActive: currentScrimbaPage?.isActive ?? false,
            isIdle: currentScrimbaPage?.isIdle ?? false,
            trackingEnabled: true,
          })
          return
        }

        const countableActiveSeconds = getCountableActiveSeconds(
          currentScrimbaPage.lastActivityAt,
          message.recordedAt,
          message.activeSeconds,
          settings.idleTimeoutSeconds,
        )
        const isNowIdle = isIdleAt(
          currentScrimbaPage.lastActivityAt,
          message.recordedAt,
          settings.idleTimeoutSeconds,
        )

        if (countableActiveSeconds === 0 && isNowIdle) {
          void updateStorageValue('currentScrimbaPage', (currentPage) => {
            if (currentPage?.sessionId !== message.sessionId) {
              return currentPage
            }

            return {
              ...currentPage,
              isIdle: true,
              lastIdleAt: currentPage.lastActivityAt
                ? getIdleAt(currentPage.lastActivityAt, settings.idleTimeoutSeconds)
                : message.recordedAt,
            }
          }).then((currentPage) => {
            sendResponse({
              ok: false,
              isActive: currentPage?.isActive ?? true,
              isIdle: true,
              trackingEnabled: true,
            })
          })
          return
        }

        void addActiveSecondsForInterval({
          activeSeconds: countableActiveSeconds,
          endedAt: getCountableEndedAt(
            message.recordedAt,
            message.activeSeconds,
            countableActiveSeconds,
          ),
          sessionId: message.sessionId,
          url: message.url,
          title: message.title,
        }).then(() => {
          if (isNowIdle) {
            void updateStorageValue('currentScrimbaPage', (currentPage) => {
              if (currentPage?.sessionId !== message.sessionId) {
                return currentPage
              }

              return {
                ...currentPage,
                isIdle: true,
                lastIdleAt: currentPage.lastActivityAt
                  ? getIdleAt(currentPage.lastActivityAt, settings.idleTimeoutSeconds)
                  : message.recordedAt,
              }
            })
          }

          sendResponse({
            ok: true,
            isActive: true,
            isIdle: isNowIdle,
            trackingEnabled: true,
          })
        })
      })
    })

    return true
  }
})
