import { isScrimbaUrl } from './scrimbaUrl'

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
  chrome.storage.local.set({
    extensionStatus: {
      installedAt: new Date().toISOString(),
      ...startupSnapshot(),
    },
  })

  console.info('Scrimba Learning Tracker installed')
})

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({
    extensionStatus: startupSnapshot(),
  })

  console.info('Scrimba Learning Tracker service worker started')
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isTrackingStartedMessage(message)) {
    chrome.storage.local.set(
      {
        currentScrimbaPage: {
          url: message.url,
          title: message.title,
          startedAt: message.startedAt,
        },
      },
      () => {
        sendResponse({ ok: true })
      },
    )

    return true
  }
})
