import type { DailyActivity, UserSettings } from './storage'

export type GoalProgress = {
  activeSeconds: number
  goalSeconds: number
  isComplete: boolean
  remainingSeconds: number
  percentage: number
  visualPercentage: number
}

export const secondsToMinutes = (seconds: number): number =>
  Math.floor(Math.max(0, seconds) / 60)

export const formatActiveTime = (seconds: number): string => {
  const normalizedSeconds = Math.max(0, Math.floor(seconds))
  const minutes = secondsToMinutes(normalizedSeconds)

  if (normalizedSeconds > 0 && minutes === 0) {
    return '<1m'
  }

  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`
}

export const formatMinutes = formatActiveTime

export const getGoalProgress = (
  todayActivity: DailyActivity | null,
  settings: UserSettings | null,
): GoalProgress => {
  const activeSeconds = todayActivity?.activeSeconds ?? 0
  const goalSeconds = todayActivity?.goalSeconds ?? settings?.dailyGoalSeconds ?? 0
  const isComplete =
    todayActivity?.goalCompleted === true ||
    (goalSeconds > 0 && activeSeconds >= goalSeconds)
  const percentage =
    goalSeconds > 0 ? Math.floor((activeSeconds / goalSeconds) * 100) : 0

  return {
    activeSeconds,
    goalSeconds,
    isComplete,
    remainingSeconds: Math.max(0, goalSeconds - activeSeconds),
    percentage,
    visualPercentage: Math.min(100, percentage),
  }
}
