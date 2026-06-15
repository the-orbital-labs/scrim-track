import { getLocalDateKey } from './activity'
import { getPathProgress } from './pathProgress'
import { getStorageValue } from './storage'
import type { AverageWindowDays } from './storage'

export type PathProjection = {
  averageDailySeconds: number
  completedHours: number
  daysRemaining: number | null
  finishDate: string | null
  finishDateLabel: string | null
  pace: AveragePace
  projectionFullMessage: string
  projectionMessage: string
  projectionShortMessage: string
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

export type PathHourEstimate = {
  completedHours: number
  remainingHours: number
}

const dayInMilliseconds = 24 * 60 * 60 * 1000
const finishDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

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

export const formatPathHours = (hours: number): string => {
  const normalizedHours = Math.max(0, hours)

  if (normalizedHours === 0) {
    return '0h'
  }

  if (normalizedHours < 0.1) {
    return '<0.1h'
  }

  return `${Number(normalizedHours.toFixed(normalizedHours < 10 ? 1 : 0))}h`
}

export const formatFinishDate = (dateKey: string): string =>
  finishDateFormatter.format(parseLocalDateKey(dateKey))

export const getFinishEstimateText = (
  projection: PathProjection,
  variant: 'full' | 'short' = 'short',
): string =>
  variant === 'full'
    ? projection.projectionFullMessage
    : projection.projectionShortMessage

const formatDayCount = (days: number): string =>
  `${days} ${days === 1 ? 'day' : 'days'}`

const isSameMonth = (first: Date, second: Date): boolean =>
  first.getFullYear() === second.getFullYear() &&
  first.getMonth() === second.getMonth()

const getProjectionMessages = (
  today: Date,
  daysRemaining: number | null,
  finishDateLabel: string | null,
  finishDateValue: Date | null,
) => {
  if (daysRemaining === 0) {
    return {
      full: 'Path complete. Nice work.',
      legacy: 'Path complete',
      short: 'Path complete',
    }
  }

  if (daysRemaining === null || !finishDateLabel || !finishDateValue) {
    return {
      full: 'Study today to generate your finish estimate.',
      legacy: 'Study on Scrimba to estimate',
      short: 'Study today to estimate',
    }
  }

  const full =
    isSameMonth(today, finishDateValue)
      ? `You're on pace to finish this month. Estimated finish date: ${finishDateLabel}.`
      : `At your current pace, you may finish in ${formatDayCount(daysRemaining)}. Estimated finish date: ${finishDateLabel}.`

  return {
    full,
    legacy: `Estimated finish ${finishDateLabel}`,
    short: `Finish in ${formatDayCount(daysRemaining)}`,
  }
}

export const calculatePathHourEstimate = (
  totalEstimatedHours: number,
  progressPercentage: number,
): PathHourEstimate => {
  const totalHours = Math.max(0, totalEstimatedHours)
  const progress = Math.min(100, Math.max(0, progressPercentage))
  const completedHours = Math.min(totalHours, totalHours * (progress / 100))
  const remainingHours = Math.max(0, totalHours - completedHours)

  return {
    completedHours,
    remainingHours,
  }
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
  const { completedHours, remainingHours } = calculatePathHourEstimate(
    pathProgress.totalEstimatedHours,
    pathProgress.progressPercentage,
  )

  if (remainingHours <= 0) {
    const finishDate = getLocalDateKey(today)
    const projectionMessages = getProjectionMessages(
      today,
      0,
      formatFinishDate(finishDate),
      today,
    )

    return {
      averageDailySeconds: 0,
      completedHours,
      daysRemaining: 0,
      finishDate,
      finishDateLabel: formatFinishDate(finishDate),
      pace,
      projectionFullMessage: projectionMessages.full,
      projectionMessage: projectionMessages.legacy,
      projectionShortMessage: projectionMessages.short,
      remainingHours: 0,
    }
  }

  const averageDailySeconds = pace.averageDailySeconds

  if (averageDailySeconds <= 0) {
    const projectionMessages = getProjectionMessages(today, null, null, null)

    return {
      averageDailySeconds: 0,
      completedHours,
      daysRemaining: null,
      finishDate: null,
      finishDateLabel: null,
      pace,
      projectionFullMessage: projectionMessages.full,
      projectionMessage: projectionMessages.legacy,
      projectionShortMessage: projectionMessages.short,
      remainingHours,
    }
  }

  const daysRemaining = Math.ceil((remainingHours * 60 * 60) / averageDailySeconds)
  const finishDate = new Date(today.getTime() + daysRemaining * dayInMilliseconds)
  const finishDateKey = getLocalDateKey(finishDate)
  const finishDateLabel = formatFinishDate(finishDateKey)
  const projectionMessages = getProjectionMessages(
    today,
    daysRemaining,
    finishDateLabel,
    finishDate,
  )

  return {
    averageDailySeconds,
    completedHours,
    daysRemaining,
    finishDate: finishDateKey,
    finishDateLabel,
    pace,
    projectionFullMessage: projectionMessages.full,
    projectionMessage: projectionMessages.legacy,
    projectionShortMessage: projectionMessages.short,
    remainingHours,
  }
}
