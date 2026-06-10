import { getLocalDateKey } from './activity'
import { getPathProgress } from './pathProgress'
import { getStorageValue } from './storage'
import type { AverageWindowDays } from './storage'

export type PathProjection = {
  averageDailySeconds: number
  finishDate: string | null
  remainingHours: number
}

const dayInMilliseconds = 24 * 60 * 60 * 1000

const getWindowStartDate = (
  windowDays: AverageWindowDays,
  today: Date,
): string | null => {
  if (windowDays === 'all') {
    return null
  }

  return getLocalDateKey(
    new Date(today.getTime() - (windowDays - 1) * dayInMilliseconds),
  )
}

export const getPathProjection = async (
  today: Date = new Date(),
): Promise<PathProjection> => {
  const pathProgress = await getPathProgress()
  const dailyActivities = await getStorageValue('dailyActivities')
  const remainingHours =
    pathProgress.totalEstimatedHours *
    (1 - pathProgress.progressPercentage / 100)

  if (remainingHours <= 0) {
    return {
      averageDailySeconds: 0,
      finishDate: getLocalDateKey(today),
      remainingHours: 0,
    }
  }

  const todayKey = getLocalDateKey(today)
  const windowStartKey = getWindowStartDate(pathProgress.averageWindowDays, today)
  const activeDays = Object.values(dailyActivities).filter((activity) => {
    if (activity.date > todayKey) {
      return false
    }

    if (!windowStartKey) {
      return true
    }

    return activity.date >= windowStartKey
  })
  const totalActiveSeconds = activeDays.reduce(
    (sum, activity) => sum + activity.activeSeconds,
    0,
  )
  const divisor =
    pathProgress.averageWindowDays === 'all'
      ? Math.max(1, activeDays.length)
      : pathProgress.averageWindowDays
  const averageDailySeconds = totalActiveSeconds / divisor

  if (averageDailySeconds <= 0) {
    return {
      averageDailySeconds: 0,
      finishDate: null,
      remainingHours,
    }
  }

  const daysRemaining = Math.ceil((remainingHours * 60 * 60) / averageDailySeconds)
  const finishDate = new Date(today.getTime() + daysRemaining * dayInMilliseconds)

  return {
    averageDailySeconds,
    finishDate: getLocalDateKey(finishDate),
    remainingHours,
  }
}
