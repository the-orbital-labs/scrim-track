export type ExtensionStatus = {
  installedAt: string | null
  lastStartedAt: string | null
  version: string | null
}

export type CurrentScrimbaPage = {
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

export type LearningSession = {
  id: string
  url: string
  title: string | null
  startedAt: string
  isActive: boolean
  endedAt: string | null
  activeSeconds: number
}

export type DailyActivity = {
  date: string
  activeSeconds: number
  goalSeconds: number
  goalCompleted: boolean
  sessions: LearningSession[]
}

export type StreakStatus = {
  currentStreak: number
  longestStreak: number
  lastCalculatedAt: string | null
}

export type UserSettings = {
  dailyGoalSeconds: number
  idleTimeoutSeconds: number
  trackingEnabled: boolean
  timezone: string
}

export type AverageWindowDays = 7 | 14 | 30 | 'all'

export type PathProgress = {
  pathName: string
  totalEstimatedHours: number
  progressPercentage: number
  averageWindowDays: AverageWindowDays
}

export type StorageSchema = {
  extensionStatus: ExtensionStatus
  currentScrimbaPage: CurrentScrimbaPage
  dailyActivities: Record<string, DailyActivity>
  streakStatus: StreakStatus
  userSettings: UserSettings
  pathProgress: PathProgress
}

export type StorageKey = keyof StorageSchema

const defaultStorageValues: StorageSchema = {
  extensionStatus: {
    installedAt: null,
    lastStartedAt: null,
    version: null,
  },
  currentScrimbaPage: null,
  dailyActivities: {},
  streakStatus: {
    currentStreak: 0,
    longestStreak: 0,
    lastCalculatedAt: null,
  },
  userSettings: {
    dailyGoalSeconds: 30 * 60,
    idleTimeoutSeconds: 2 * 60,
    trackingEnabled: true,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  },
  pathProgress: {
    pathName: '',
    totalEstimatedHours: 1,
    progressPercentage: 0,
    averageWindowDays: 7,
  },
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

const withDefaultStorageValue = <Key extends StorageKey>(
  key: Key,
  value: StorageSchema[Key] | undefined,
): StorageSchema[Key] => {
  const defaultValue = getDefaultStorageValue(key)

  if (value === undefined) {
    return defaultValue
  }

  if (
    value !== null &&
    defaultValue !== null &&
    typeof value === 'object' &&
    typeof defaultValue === 'object' &&
    !Array.isArray(value) &&
    !Array.isArray(defaultValue)
  ) {
    return {
      ...defaultValue,
      ...value,
    }
  }

  return value
}

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

        resolve(withDefaultStorageValue(key, value))
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
