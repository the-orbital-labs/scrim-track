export type ExtensionStatus = {
  installedAt: string | null
  lastStartedAt: string | null
  version: string | null
}

export type CurrentScrimbaPage = {
  url: string
  title: string | null
  startedAt: string
} | null

export type StorageSchema = {
  extensionStatus: ExtensionStatus
  currentScrimbaPage: CurrentScrimbaPage
}

export type StorageKey = keyof StorageSchema

const defaultStorageValues: StorageSchema = {
  extensionStatus: {
    installedAt: null,
    lastStartedAt: null,
    version: null,
  },
  currentScrimbaPage: null,
}

const cloneStorageValue = <Value>(value: Value): Value => {
  if (value === null || typeof value !== 'object') {
    return value
  }

  return JSON.parse(JSON.stringify(value)) as Value
}

const getDefaultStorageValue = <Key extends StorageKey>(
  key: Key,
): StorageSchema[Key] => cloneStorageValue(defaultStorageValues[key])

const logStorageError = (operation: string): boolean => {
  const error = chrome.runtime.lastError

  if (!error) {
    return false
  }

  console.warn(`Storage ${operation} failed: ${error.message ?? 'Unknown error'}`)

  return true
}

export const getStorageValue = <Key extends StorageKey>(
  key: Key,
): Promise<StorageSchema[Key]> =>
  new Promise((resolve) => {
    try {
      chrome.storage.local.get(key, (items) => {
        if (logStorageError(`read for ${key}`)) {
          resolve(getDefaultStorageValue(key))
          return
        }

        const value = items[key] as StorageSchema[Key] | undefined

        resolve(value === undefined ? getDefaultStorageValue(key) : value)
      })
    } catch (error) {
      console.warn(`Storage read for ${key} failed:`, error)
      resolve(getDefaultStorageValue(key))
    }
  })

export const setStorageValue = <Key extends StorageKey>(
  key: Key,
  value: StorageSchema[Key],
): Promise<boolean> =>
  new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [key]: value }, () => {
        resolve(!logStorageError(`write for ${key}`))
      })
    } catch (error) {
      console.warn(`Storage write for ${key} failed:`, error)
      resolve(false)
    }
  })

export const updateStorageValue = async <Key extends StorageKey>(
  key: Key,
  update: (currentValue: StorageSchema[Key]) => StorageSchema[Key],
): Promise<StorageSchema[Key]> => {
  const currentValue = await getStorageValue(key)
  const nextValue = update(currentValue)

  await setStorageValue(key, nextValue)

  return nextValue
}
