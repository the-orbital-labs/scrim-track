import type { HeatmapDay } from './heatmap'

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const parseLocalDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number)

  return new Date(year, month - 1, day)
}

const formatStudiedTime = (activeSeconds: number): string => {
  if (activeSeconds <= 0) {
    return 'No activity'
  }

  const totalMinutes = Math.floor(activeSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} studied`
  }

  if (minutes === 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} studied`
  }

  return `${hours}h ${minutes}m studied`
}

const getGoalStatus = (day: HeatmapDay): string => {
  if (day.activeSeconds <= 0) {
    return 'Goal not completed'
  }

  return day.goalCompleted ? 'Goal completed' : 'Goal not completed'
}

const getSessionCount = (day: HeatmapDay): string => {
  const count = day.activity.sessions.length

  return `${count} ${count === 1 ? 'session' : 'sessions'}`
}

export const getHeatmapTooltipLines = (day: HeatmapDay): string[] => {
  if (day.isFuture) {
    return [dateFormatter.format(parseLocalDateKey(day.date)), 'Future day']
  }

  return [
    dateFormatter.format(parseLocalDateKey(day.date)),
    formatStudiedTime(day.activeSeconds),
    getGoalStatus(day),
    getSessionCount(day),
  ]
}

export const getHeatmapTooltipText = (day: HeatmapDay): string =>
  getHeatmapTooltipLines(day).join('\n')
