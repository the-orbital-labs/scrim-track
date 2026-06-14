import { createDailyActivity, getLocalDateKey } from './activity'
import { getUserSettings } from './settings'
import { getStorageValue } from './storage'
import type { DailyActivity } from './storage'

export type HeatmapIntensityLevel = 0 | 1 | 2 | 3 | 4 | 5

export type HeatmapDay = {
  date: string
  activity: DailyActivity
  activeMinutes: number
  activeSeconds: number
  goalCompleted: boolean
  intensity: HeatmapIntensityLevel
  isFuture: boolean
  isOutsideRange: boolean
  isToday: boolean
}

export type HeatmapWeek = {
  startDate: string
  days: HeatmapDay[]
}

export type HeatmapGrid = {
  startDate: string
  endDate: string
  weeks: HeatmapWeek[]
}

type HeatmapGridOptions = {
  days: number
  endDate?: Date | string
  goalSeconds?: number
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6
}

const popupHeatmapWeeks = 12
const dashboardHeatmapDays = 365

const parseLocalDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number)

  return new Date(year, month - 1, day)
}

const toLocalDate = (value: Date | string): Date =>
  typeof value === 'string' ? parseLocalDateKey(value) : value

const addLocalDays = (value: Date, days: number): Date =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate() + days)

const startOfLocalWeek = (
  value: Date,
  weekStartsOn: NonNullable<HeatmapGridOptions['weekStartsOn']>,
): Date => {
  const dayOffset = (value.getDay() - weekStartsOn + 7) % 7

  return addLocalDays(value, -dayOffset)
}

const endOfLocalWeek = (
  value: Date,
  weekStartsOn: NonNullable<HeatmapGridOptions['weekStartsOn']>,
): Date => addLocalDays(startOfLocalWeek(value, weekStartsOn), 6)

const isSameLocalDate = (left: Date, right: Date): boolean =>
  getLocalDateKey(left) === getLocalDateKey(right)

export const getHeatmapIntensity = (
  activeSeconds: number,
): HeatmapIntensityLevel => {
  const activeMinutes = Math.floor(Math.max(0, activeSeconds) / 60)

  if (activeMinutes === 0) {
    return 0
  }

  if (activeMinutes < 15) {
    return 1
  }

  if (activeMinutes < 30) {
    return 2
  }

  if (activeMinutes < 60) {
    return 3
  }

  if (activeMinutes < 120) {
    return 4
  }

  return 5
}

export const generateHeatmapGrid = (
  activities: Record<string, DailyActivity>,
  {
    days,
    endDate = new Date(),
    goalSeconds = 0,
    weekStartsOn = 0,
  }: HeatmapGridOptions,
): HeatmapGrid => {
  const today = new Date()
  const rangeEnd = toLocalDate(endDate)
  const rangeStart = addLocalDays(rangeEnd, -(Math.max(1, days) - 1))
  const gridStart = startOfLocalWeek(rangeStart, weekStartsOn)
  const gridEnd = endOfLocalWeek(rangeEnd, weekStartsOn)
  const weeks: HeatmapWeek[] = []

  for (let weekStart = gridStart; weekStart <= gridEnd; weekStart = addLocalDays(weekStart, 7)) {
    const weekDays: HeatmapDay[] = []

    for (let offset = 0; offset < 7; offset += 1) {
      const date = addLocalDays(weekStart, offset)
      const dateKey = getLocalDateKey(date)
      const activity = activities[dateKey] ?? createDailyActivity(dateKey, goalSeconds)
      const activeMinutes = Math.floor(activity.activeSeconds / 60)

      weekDays.push({
        date: dateKey,
        activity,
        activeMinutes,
        activeSeconds: activity.activeSeconds,
        goalCompleted: activity.goalCompleted,
        intensity: getHeatmapIntensity(activity.activeSeconds),
        isFuture: date > today && !isSameLocalDate(date, today),
        isOutsideRange: date < rangeStart || date > rangeEnd,
        isToday: isSameLocalDate(date, today),
      })
    }

    weeks.push({
      startDate: getLocalDateKey(weekStart),
      days: weekDays,
    })
  }

  return {
    startDate: getLocalDateKey(rangeStart),
    endDate: getLocalDateKey(rangeEnd),
    weeks,
  }
}

export const getPopupHeatmapGrid = async (): Promise<HeatmapGrid> => {
  const [activities, settings] = await Promise.all([
    getStorageValue('dailyActivities'),
    getUserSettings(),
  ])

  return generateHeatmapGrid(activities, {
    days: popupHeatmapWeeks * 7,
    endDate: endOfLocalWeek(new Date(), 0),
    goalSeconds: settings.dailyGoalSeconds,
  })
}

export const getDashboardHeatmapGrid = async (): Promise<HeatmapGrid> => {
  const [activities, settings] = await Promise.all([
    getStorageValue('dailyActivities'),
    getUserSettings(),
  ])

  return generateHeatmapGrid(activities, {
    days: dashboardHeatmapDays,
    goalSeconds: settings.dailyGoalSeconds,
  })
}
