import { getActivityForDateRange, getLocalDateKey } from './activity'
import { getStorageValue } from './storage'

export type WeeklyTimeStats = {
  activeSeconds: number
  averageSecondsPerDay: number
  dayCount: number
  endDate: string
  startDate: string
}

export type MonthlyTimeStats = {
  activeDays: number
  activeSeconds: number
  dayCount: number
  endDate: string
  startDate: string
}

export type AllTimeStats = {
  activeDays: number
  activeSeconds: number
  dayCount: number
}

export const getWeekStart = (date: Date = new Date()): Date => {
  const weekStart = new Date(date)

  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())

  return weekStart
}

export const getMonthStart = (date: Date = new Date()): Date =>
  new Date(date.getFullYear(), date.getMonth(), 1)

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

export const getAllTimeStats = async (): Promise<AllTimeStats> => {
  const activities = Object.values(await getStorageValue('dailyActivities'))
  const activeSeconds = activities.reduce(
    (total, activity) => total + activity.activeSeconds,
    0,
  )

  return {
    activeDays: activities.filter((activity) => activity.activeSeconds > 0).length,
    activeSeconds,
    dayCount: activities.length,
  }
}

export const getCurrentMonthTimeStats = async (
  today: Date = new Date(),
): Promise<MonthlyTimeStats> => {
  const monthStart = getMonthStart(today)
  const activities = await getActivityForDateRange(monthStart, today)
  const activeSeconds = activities.reduce(
    (total, activity) => total + activity.activeSeconds,
    0,
  )

  return {
    activeDays: activities.filter((activity) => activity.activeSeconds > 0).length,
    activeSeconds,
    dayCount: activities.length,
    startDate: getLocalDateKey(monthStart),
    endDate: getLocalDateKey(today),
  }
}
