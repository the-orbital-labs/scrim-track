import { getActivityForDateRange } from './activity'
import { formatActiveTime } from './goalProgress'
import type { DailyActivity } from './storage'
import { getWeekStart } from './timeStats'

export type WeeklySummary = {
  activeDays: number
  activeSeconds: number
  bestDay: {
    activeSeconds: number
    date: string
    label: string
  } | null
  comparisonSeconds: number
  comparisonText: string
  comparisonTrend: 'decrease' | 'increase' | 'no-change'
  dailyAverageSeconds: number
  previousWeekActiveSeconds: number
  summaryText: string[]
}

const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
})

const addDays = (date: Date, days: number): Date => {
  const nextDate = new Date(date)

  nextDate.setDate(nextDate.getDate() + days)

  return nextDate
}

const parseLocalDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number)

  return new Date(year, month - 1, day)
}

const getActiveSecondsTotal = (activities: DailyActivity[]): number =>
  activities.reduce((total, activity) => total + activity.activeSeconds, 0)

const getBestDay = (activities: DailyActivity[]): DailyActivity | null => {
  const bestDay = activities.reduce<DailyActivity | null>((best, activity) => {
    if (activity.activeSeconds === 0) {
      return best
    }

    if (!best || activity.activeSeconds > best.activeSeconds) {
      return activity
    }

    return best
  }, null)

  return bestDay
}

const getComparisonText = (
  activeSeconds: number,
  previousWeekActiveSeconds: number,
): string => {
  const difference = activeSeconds - previousWeekActiveSeconds

  if (activeSeconds === 0 && previousWeekActiveSeconds === 0) {
    return 'No comparison yet - your next study session will start the trend.'
  }

  if (previousWeekActiveSeconds === 0) {
    return `Last week was quiet. You studied ${formatActiveTime(activeSeconds)} this week.`
  }

  if (difference > 0) {
    return `You studied ${formatActiveTime(difference)} more than last week.`
  }

  if (difference < 0) {
    return `You studied ${formatActiveTime(Math.abs(difference))} less than last week.`
  }

  return 'You matched last week.'
}

const getComparisonTrend = (
  activeSeconds: number,
  previousWeekActiveSeconds: number,
): WeeklySummary['comparisonTrend'] => {
  if (activeSeconds > previousWeekActiveSeconds) {
    return 'increase'
  }

  if (activeSeconds < previousWeekActiveSeconds) {
    return 'decrease'
  }

  return 'no-change'
}

export const getCurrentWeekSummary = async (
  today: Date = new Date(),
): Promise<WeeklySummary> => {
  const weekStart = getWeekStart(today)
  const previousWeekStart = addDays(weekStart, -7)
  const previousWeekEnd = addDays(weekStart, -1)
  const [currentWeekActivities, previousWeekActivities] = await Promise.all([
    getActivityForDateRange(weekStart, today),
    getActivityForDateRange(previousWeekStart, previousWeekEnd),
  ])
  const activeSeconds = getActiveSecondsTotal(currentWeekActivities)
  const previousWeekActiveSeconds = getActiveSecondsTotal(previousWeekActivities)
  const activeDays = currentWeekActivities.filter(
    (activity) => activity.activeSeconds > 0,
  ).length
  const dailyAverageSeconds =
    currentWeekActivities.length > 0
      ? Math.floor(activeSeconds / currentWeekActivities.length)
      : 0
  const bestActivityDay = getBestDay(currentWeekActivities)
  const bestDay = bestActivityDay
    ? {
        activeSeconds: bestActivityDay.activeSeconds,
        date: bestActivityDay.date,
        label: weekdayFormatter.format(parseLocalDateKey(bestActivityDay.date)),
      }
    : null
  const comparisonText = getComparisonText(activeSeconds, previousWeekActiveSeconds)
  const comparisonTrend = getComparisonTrend(activeSeconds, previousWeekActiveSeconds)
  const summaryText =
    activeSeconds > 0
      ? [
          `You studied ${formatActiveTime(activeSeconds)} this week.`,
          bestDay
            ? `Your best day was ${bestDay.label} with ${formatActiveTime(bestDay.activeSeconds)}.`
            : 'No best day yet this week.',
          comparisonText,
        ]
      : [
          'No Scrimba study time recorded this week yet.',
          'Start a Scrimba session and this recap will fill in automatically.',
          comparisonText,
        ]

  return {
    activeDays,
    activeSeconds,
    bestDay,
    comparisonSeconds: activeSeconds - previousWeekActiveSeconds,
    comparisonText,
    comparisonTrend,
    dailyAverageSeconds,
    previousWeekActiveSeconds,
    summaryText,
  }
}
