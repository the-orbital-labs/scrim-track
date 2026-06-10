import { getStorageValue, setStorageValue, updateStorageValue } from './storage'
import type { UserSettings } from './storage'

const toNonNegativeSeconds = (value: number): number =>
  Math.max(0, Math.floor(value))

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

export const saveDailyGoal = (dailyGoalSeconds: number): Promise<UserSettings> =>
  updateStorageValue('userSettings', (settings) => ({
    ...settings,
    dailyGoalSeconds: toNonNegativeSeconds(dailyGoalSeconds),
  }))

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
