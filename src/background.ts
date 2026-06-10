import { isScrimbaUrl } from './scrimbaUrl'
import { setStorageValue, updateStorageValue } from './storage'

const startupSnapshot = () => ({
  lastStartedAt: new Date().toISOString(),
  version: chrome.runtime.getManifest().version,
})

type TrackingStartedMessage = {
  type: 'scrimba:tracking-started'
  url: string
  title: string | null
  startedAt: string
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
    typeof candidate.url === 'string' &&
    isScrimbaUrl(candidate.url) &&
    (typeof candidate.title === 'string' || candidate.title === null) &&
    typeof candidate.startedAt === 'string'
  )
}

chrome.runtime.onInstalled.addListener(() => {
  void updateStorageValue('extensionStatus', (extensionStatus) => ({
    ...extensionStatus,
    installedAt: new Date().toISOString(),
    ...startupSnapshot(),
  }))

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
    void setStorageValue('currentScrimbaPage', {
      url: message.url,
      title: message.title,
      startedAt: message.startedAt,
    }).then((ok) => {
      sendResponse({ ok })
    })

    return true
  }
})
