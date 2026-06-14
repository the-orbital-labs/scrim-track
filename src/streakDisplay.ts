import type { GoalProgress } from './goalProgress'
import type { StreakStatus } from './storage'

export type StreakDisplayState = {
  currentLabel: string
  longestLabel: string
  message: string
  tone: 'complete' | 'pending' | 'empty'
}

const pluralizeDay = (days: number): string => (days === 1 ? 'day' : 'days')

const formatRemainingMinutes = (seconds: number): string => {
  const minutes = Math.max(1, Math.ceil(seconds / 60))

  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

export const getStreakDisplayState = (
  streakStatus: StreakStatus | null,
  goalProgress: GoalProgress,
): StreakDisplayState => {
  const currentStreak = streakStatus?.currentStreak ?? 0
  const longestStreak = streakStatus?.longestStreak ?? 0
  const currentLabel = `${currentStreak}-${pluralizeDay(currentStreak)} streak`
  const longestLabel = `${longestStreak}-${pluralizeDay(longestStreak)} best`

  if (goalProgress.isComplete) {
    return {
      currentLabel,
      longestLabel,
      message: 'Goal complete - streak protected',
      tone: 'complete',
    }
  }

  if (goalProgress.goalSeconds === 0) {
    return {
      currentLabel,
      longestLabel,
      message: 'Set a daily goal to start a streak',
      tone: 'empty',
    }
  }

  return {
    currentLabel,
    longestLabel,
    message:
      currentStreak > 0
        ? `${formatRemainingMinutes(goalProgress.remainingSeconds)} left to keep your streak`
        : `${formatRemainingMinutes(goalProgress.remainingSeconds)} left to start a streak`,
    tone: 'pending',
  }
}
