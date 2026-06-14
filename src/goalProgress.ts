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
  Math.floor(seconds / 60)

export const formatMinutes = (seconds: number): string =>
  `${secondsToMinutes(seconds)}m`

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
