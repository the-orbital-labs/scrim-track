import { getStorageValue, setStorageValue, updateStorageValue } from './storage'
import type { UserSettings } from './storage'
import { calculateStreakStatus } from './streak'

const maxDailyGoalSeconds = 24 * 60 * 60

const toNonNegativeSeconds = (value: number): number =>
  Math.max(0, Math.floor(value))

const getLocalDateKey = (value: Date = new Date()): string =>
  [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')

const normalizeDailyGoalSeconds = (value: number): number => {
  const seconds = Math.floor(value)

  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > maxDailyGoalSeconds) {
    throw new Error('Daily goal must be between 1 minute and 24 hours.')
  }

  return seconds
}

const normalizeTimezone = (timezone: string): string => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone })

    return timezone
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  }
}

export const getUserSettings = (): Promise<UserSettings> =>
  getStorageValue('userSettings')

export const saveDailyGoal = async (
  dailyGoalSeconds: number,
): Promise<UserSettings> => {
  const normalizedDailyGoalSeconds = normalizeDailyGoalSeconds(dailyGoalSeconds)
  const settings = await updateStorageValue('userSettings', (currentSettings) => ({
    ...currentSettings,
    dailyGoalSeconds: normalizedDailyGoalSeconds,
  }))
  const today = getLocalDateKey()

  const activities = await updateStorageValue('dailyActivities', (currentActivities) => {
    const activity = currentActivities[today] ?? {
      date: today,
      activeSeconds: 0,
      goalSeconds: normalizedDailyGoalSeconds,
      goalCompleted: false,
      sessions: [],
    }

    return {
      ...currentActivities,
      [today]: {
        ...activity,
        goalSeconds: normalizedDailyGoalSeconds,
        goalCompleted: activity.activeSeconds >= normalizedDailyGoalSeconds,
      },
    }
  })
  await setStorageValue('streakStatus', calculateStreakStatus(activities, today))

  return settings
}

export const saveIdleTimeout = (
  idleTimeoutSeconds: number,
): Promise<UserSettings> =>
  updateStorageValue('userSettings', (settings) => ({
    ...settings,
    idleTimeoutSeconds: toNonNegativeSeconds(idleTimeoutSeconds),
  }))

export const saveTrackingEnabled = (
  trackingEnabled: boolean,
): Promise<UserSettings> =>
  updateStorageValue('userSettings', (settings) => ({
    ...settings,
    trackingEnabled,
  }))

export const saveTimezone = (timezone: string): Promise<UserSettings> =>
  updateStorageValue('userSettings', (settings) => ({
    ...settings,
    timezone: normalizeTimezone(timezone),
  }))

export const ensureUserSettings = async (): Promise<UserSettings> => {
  const settings = await getUserSettings()

  await setStorageValue('userSettings', settings)

  return settings
}
