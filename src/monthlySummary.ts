import { getActivityForDateRange, getLocalDateKey } from './activity'
import { formatActiveTime } from './goalProgress'
import type { DailyActivity } from './storage'
import { getMonthStart, getWeekStart } from './timeStats'

export type MonthlySummary = {
  activeDays: number
  activeSeconds: number
  bestDay: {
    activeSeconds: number
    date: string
    label: string
  } | null
  bestWeek: {
    activeSeconds: number
    endDate: string
    label: string
    startDate: string
  } | null
  dailyAverageSeconds: number
  longestStreak: number
  summaryText: string[]
}

type WeekBucket = {
  activeSeconds: number
  endDate: string
  startDate: string
}

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})

const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
})

const parseLocalDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number)

  return new Date(year, month - 1, day)
}

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`

const getActiveSecondsTotal = (activities: DailyActivity[]): number =>
  activities.reduce((total, activity) => total + activity.activeSeconds, 0)

const getBestDay = (activities: DailyActivity[]): DailyActivity | null =>
  activities.reduce<DailyActivity | null>((best, activity) => {
    if (activity.activeSeconds === 0) {
      return best
    }

    if (!best || activity.activeSeconds > best.activeSeconds) {
      return activity
    }

    return best
  }, null)

const getBestWeek = (activities: DailyActivity[]): WeekBucket | null => {
  const weekBuckets = activities.reduce<Record<string, WeekBucket>>(
    (buckets, activity) => {
      const date = parseLocalDateKey(activity.date)
      const weekKey = getLocalDateKey(getWeekStart(date))
      const bucket = buckets[weekKey] ?? {
        activeSeconds: 0,
        startDate: activity.date,
        endDate: activity.date,
      }

      return {
        ...buckets,
        [weekKey]: {
          activeSeconds: bucket.activeSeconds + activity.activeSeconds,
          startDate: activity.date < bucket.startDate ? activity.date : bucket.startDate,
          endDate: activity.date > bucket.endDate ? activity.date : bucket.endDate,
        },
      }
    },
    {},
  )

  return Object.values(weekBuckets).reduce<WeekBucket | null>((best, week) => {
    if (week.activeSeconds === 0) {
      return best
    }

    if (!best || week.activeSeconds > best.activeSeconds) {
      return week
    }

    return best
  }, null)
}

const getLongestCompletedStreak = (activities: DailyActivity[]): number => {
  let currentStreak = 0
  let longestStreak = 0

  for (const activity of activities) {
    if (activity.goalCompleted) {
      currentStreak += 1
      longestStreak = Math.max(longestStreak, currentStreak)
      continue
    }

    currentStreak = 0
  }

  return longestStreak
}

const getWeekLabel = (week: WeekBucket): string => {
  const start = dayFormatter.format(parseLocalDateKey(week.startDate))
  const end = dayFormatter.format(parseLocalDateKey(week.endDate))

  return start === end ? start : `${start}-${end}`
}

export const getCurrentMonthSummary = async (
  today: Date = new Date(),
): Promise<MonthlySummary> => {
  const monthStart = getMonthStart(today)
  const activities = await getActivityForDateRange(monthStart, today)
  const activeSeconds = getActiveSecondsTotal(activities)
  const activeDays = activities.filter((activity) => activity.activeSeconds > 0).length
  const dailyAverageSeconds =
    activities.length > 0 ? Math.floor(activeSeconds / activities.length) : 0
  const bestActivityDay = getBestDay(activities)
  const bestActivityWeek = getBestWeek(activities)
  const bestDay = bestActivityDay
    ? {
        activeSeconds: bestActivityDay.activeSeconds,
        date: bestActivityDay.date,
        label: weekdayFormatter.format(parseLocalDateKey(bestActivityDay.date)),
      }
    : null
  const bestWeek = bestActivityWeek
    ? {
        ...bestActivityWeek,
        label: getWeekLabel(bestActivityWeek),
      }
    : null
  const longestStreak = getLongestCompletedStreak(activities)
  const summaryText =
    activeSeconds > 0
      ? [
          `You studied ${formatActiveTime(activeSeconds)} this month across ${pluralize(activeDays, 'active day')}.`,
          bestWeek
            ? `Your best week was ${bestWeek.label} with ${formatActiveTime(bestWeek.activeSeconds)}.`
            : 'No best week yet this month.',
          bestDay
            ? `Your best day was ${bestDay.label} with ${formatActiveTime(bestDay.activeSeconds)}.`
            : 'No best day yet this month.',
          `Your longest goal streak this month is ${pluralize(longestStreak, 'day')}.`,
        ]
      : [
          'No Scrimba study time recorded this month yet.',
          'Best week and best day will appear after your next session.',
          `Your longest goal streak this month is ${pluralize(longestStreak, 'day')}.`,
        ]

  return {
    activeDays,
    activeSeconds,
    bestDay,
    bestWeek,
    dailyAverageSeconds,
    longestStreak,
    summaryText,
  }
}
