import { getActivityForDateRange, getLocalDateKey } from './activity'

export type WeeklyTimeStats = {
  activeSeconds: number
  averageSecondsPerDay: number
  dayCount: number
  endDate: string
  startDate: string
}

export const getWeekStart = (date: Date = new Date()): Date => {
  const weekStart = new Date(date)

  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())

  return weekStart
}

export const getCurrentWeekTimeStats = async (
  today: Date = new Date(),
): Promise<WeeklyTimeStats> => {
  const weekStart = getWeekStart(today)
  const activities = await getActivityForDateRange(weekStart, today)
  const activeSeconds = activities.reduce(
    (total, activity) => total + activity.activeSeconds,
    0,
  )
  const dayCount = activities.length

  return {
    activeSeconds,
    averageSecondsPerDay:
      dayCount > 0 ? Math.floor(activeSeconds / dayCount) : 0,
    dayCount,
    startDate: getLocalDateKey(weekStart),
    endDate: getLocalDateKey(today),
  }
}
