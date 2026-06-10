const startupSnapshot = () => ({
  lastStartedAt: new Date().toISOString(),
  version: chrome.runtime.getManifest().version,
})

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
  if (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'scrimba:content-ready'
  ) {
    sendResponse({ ok: true })
  }
})
