declare const chrome: {
  runtime: {
    getManifest: () => { version: string }
    getURL: (path: string) => string
    lastError?: { message?: string }
    onInstalled: {
      addListener: (callback: () => void) => void
    }
    onStartup: {
      addListener: (callback: () => void) => void
    }
    onMessage: {
      addListener: (
        callback: (
          message: unknown,
          sender: unknown,
          sendResponse: (response?: unknown) => void,
        ) => void | boolean,
      ) => void
    }
    sendMessage: (
      message: unknown,
      responseCallback?: (response?: unknown) => void,
    ) => void
  }
  storage: {
    local: {
      get: (
        keys: string | string[] | Record<string, unknown> | null,
        callback: (items: Record<string, unknown>) => void,
      ) => void
      set: (items: Record<string, unknown>, callback?: () => void) => void
    }
  }
  tabs: {
    create: (createProperties: { active?: boolean; url: string }) => void
  }
}
