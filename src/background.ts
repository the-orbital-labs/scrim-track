import { addActiveSecondsToToday, startLearningSession } from './activity'
import { ensurePathProgress } from './pathProgress'
import { isScrimbaUrl } from './scrimbaUrl'
import { ensureUserSettings, getUserSettings } from './settings'
import { setStorageValue, updateStorageValue } from './storage'

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
}

type ActivityPulseMessage = {
  type: 'scrimba:activity-pulse'
  sessionId: string
  url: string
  title: string | null
  activeSeconds: number
  recordedAt: string
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
    typeof candidate.startedAt === 'string'
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
          url: message.url,
          title: message.title,
          startedAt: message.startedAt,
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

  if (isActivityPulseMessage(message)) {
    void getUserSettings().then((settings) => {
      if (!settings.trackingEnabled) {
        sendResponse({ ok: false, trackingEnabled: false })
        return
      }

      void addActiveSecondsToToday({
        activeSeconds: message.activeSeconds,
        recordedAt: message.recordedAt,
        sessionId: message.sessionId,
        url: message.url,
        title: message.title,
      }).then(() => {
        sendResponse({ ok: true, trackingEnabled: true })
      })
    })

    return true
  }
})
