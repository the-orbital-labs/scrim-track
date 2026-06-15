import { getLocalDateKey } from './activity'
import { getPathProgress } from './pathProgress'
import { getStorageValue } from './storage'
import type { AverageWindowDays } from './storage'

export type PathProjection = {
  averageDailySeconds: number
  finishDate: string | null
  pace: AveragePace
  remainingHours: number
}

export type AveragePace = {
  averageDailySeconds: number
  dayCount: number
  endDate: string
  totalActiveSeconds: number
  windowDays: AverageWindowDays
  windowStartDate: string | null
}

const dayInMilliseconds = 24 * 60 * 60 * 1000

export const formatHoursPerDay = (secondsPerDay: number): string => {
  const hoursPerDay = Math.max(0, secondsPerDay) / 60 / 60

  if (hoursPerDay === 0) {
    return '0h/day'
  }

  if (hoursPerDay < 0.1) {
    return '<0.1h/day'
  }

  return `${Number(hoursPerDay.toFixed(hoursPerDay < 10 ? 1 : 0))}h/day`
}

const parseLocalDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number)

  return new Date(year, month - 1, day)
}

const getInclusiveDayCount = (startDate: string, endDate: string): number =>
  Math.max(
    1,
    Math.floor(
      (parseLocalDateKey(endDate).getTime() -
        parseLocalDateKey(startDate).getTime()) /
        dayInMilliseconds,
    ) + 1,
  )

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

export const getAveragePace = async (
  today: Date = new Date(),
): Promise<AveragePace> => {
  const pathProgress = await getPathProgress()
  const dailyActivities = await getStorageValue('dailyActivities')
  const todayKey = getLocalDateKey(today)
  const activityDates = Object.keys(dailyActivities)
    .filter((date) => date <= todayKey)
    .sort()
  const windowStartKey =
    pathProgress.averageWindowDays === 'all'
      ? activityDates[0] ?? null
      : getWindowStartDate(pathProgress.averageWindowDays, today)
  const totalActiveSeconds = Object.values(dailyActivities)
    .filter((activity) => {
      if (activity.date > todayKey) {
        return false
      }

      if (!windowStartKey) {
        return false
      }

      return activity.date >= windowStartKey
    })
    .reduce((sum, activity) => sum + activity.activeSeconds, 0)
  const dayCount =
    pathProgress.averageWindowDays === 'all'
      ? windowStartKey
        ? getInclusiveDayCount(windowStartKey, todayKey)
        : 0
      : pathProgress.averageWindowDays

  return {
    averageDailySeconds:
      dayCount > 0 ? Math.floor(totalActiveSeconds / dayCount) : 0,
    dayCount,
    endDate: todayKey,
    totalActiveSeconds,
    windowDays: pathProgress.averageWindowDays,
    windowStartDate: windowStartKey,
  }
}

export const getPathProjection = async (
  today: Date = new Date(),
): Promise<PathProjection> => {
  const pathProgress = await getPathProgress()
  const pace = await getAveragePace(today)
  const remainingHours =
    pathProgress.totalEstimatedHours *
    (1 - pathProgress.progressPercentage / 100)

  if (remainingHours <= 0) {
    return {
      averageDailySeconds: 0,
      finishDate: getLocalDateKey(today),
      pace,
      remainingHours: 0,
    }
  }

  const averageDailySeconds = pace.averageDailySeconds

  if (averageDailySeconds <= 0) {
    return {
      averageDailySeconds: 0,
      finishDate: null,
      pace,
      remainingHours,
    }
  }

  const daysRemaining = Math.ceil((remainingHours * 60 * 60) / averageDailySeconds)
  const finishDate = new Date(today.getTime() + daysRemaining * dayInMilliseconds)

  return {
    averageDailySeconds,
    finishDate: getLocalDateKey(finishDate),
    pace,
    remainingHours,
  }
}
