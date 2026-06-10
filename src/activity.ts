import { getStorageValue, updateStorageValue } from './storage'
import type { DailyActivity, LearningSession } from './storage'

type StartLearningSessionInput = Omit<
  LearningSession,
  'activeSeconds' | 'endedAt'
>

type AddActiveSecondsInput = {
  activeSeconds: number
  recordedAt?: string
  sessionId?: string
  url?: string
  title?: string | null
}

const padDatePart = (value: number): string => String(value).padStart(2, '0')

export const getLocalDateKey = (value: Date | string = new Date()): string => {
  const date = typeof value === 'string' ? new Date(value) : value

  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-')
}

const parseLocalDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number)

  return new Date(year, month - 1, day)
}

export const createDailyActivity = (date: string): DailyActivity => ({
  date,
  activeSeconds: 0,
  goalSeconds: 0,
  goalCompleted: false,
  sessions: [],
})

const getOrCreateActivity = (
  activities: Record<string, DailyActivity>,
  date: string,
): DailyActivity => activities[date] ?? createDailyActivity(date)

const normalizeActiveSeconds = (activeSeconds: number): number =>
  Math.max(0, Math.floor(activeSeconds))

const withGoalCompletion = (activity: DailyActivity): DailyActivity => ({
  ...activity,
  goalCompleted:
    activity.goalSeconds > 0 && activity.activeSeconds >= activity.goalSeconds,
})

export const ensureTodayActivity = async (): Promise<DailyActivity> => {
  const today = getLocalDateKey()
  const activities = await updateStorageValue('dailyActivities', (current) => ({
    ...current,
    [today]: getOrCreateActivity(current, today),
  }))

  return activities[today]
}

export const startLearningSession = async (
  session: StartLearningSessionInput,
): Promise<DailyActivity> => {
  const date = getLocalDateKey(session.startedAt)
  const activities = await updateStorageValue('dailyActivities', (current) => {
    const activity = getOrCreateActivity(current, date)

    if (activity.sessions.some(({ id }) => id === session.id)) {
      return current
    }

    return {
      ...current,
      [date]: {
        ...activity,
        sessions: [
          ...activity.sessions,
          {
            ...session,
            endedAt: null,
            activeSeconds: 0,
          },
        ],
      },
    }
  })

  return activities[date]
}

export const addActiveSecondsToToday = async ({
  activeSeconds,
  recordedAt = new Date().toISOString(),
  sessionId,
  url,
  title,
}: AddActiveSecondsInput): Promise<DailyActivity> => {
  const seconds = normalizeActiveSeconds(activeSeconds)
  const date = getLocalDateKey(recordedAt)
  const activities = await updateStorageValue('dailyActivities', (current) => {
    const activity = getOrCreateActivity(current, date)
    const nextActivity = withGoalCompletion({
      ...activity,
      activeSeconds: activity.activeSeconds + seconds,
      sessions: sessionId
        ? activity.sessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  url: url ?? session.url,
                  title: title ?? session.title,
                  endedAt: recordedAt,
                  activeSeconds: session.activeSeconds + seconds,
                }
              : session,
          )
        : activity.sessions,
    })

    return {
      ...current,
      [date]: nextActivity,
    }
  })

  return activities[date]
}

export const getActivityForDate = async (
  date: string | Date,
): Promise<DailyActivity> => {
  const dateKey = typeof date === 'string' ? date : getLocalDateKey(date)
  const activities = await getStorageValue('dailyActivities')

  return getOrCreateActivity(activities, dateKey)
}

export const getActivityForDateRange = async (
  startDate: string | Date,
  endDate: string | Date,
): Promise<DailyActivity[]> => {
  const startKey =
    typeof startDate === 'string' ? startDate : getLocalDateKey(startDate)
  const endKey = typeof endDate === 'string' ? endDate : getLocalDateKey(endDate)
  const start = parseLocalDateKey(startKey)
  const end = parseLocalDateKey(endKey)
  const activities = await getStorageValue('dailyActivities')
  const results: DailyActivity[] = []

  for (
    const cursor = new Date(start);
    cursor <= end;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const dateKey = getLocalDateKey(cursor)

    results.push(getOrCreateActivity(activities, dateKey))
  }

  return results
}

export const updateGoalCompletionStatus = async (
  date: string | Date = new Date(),
): Promise<DailyActivity> => {
  const dateKey = typeof date === 'string' ? date : getLocalDateKey(date)
  const activities = await updateStorageValue('dailyActivities', (current) => {
    const activity = getOrCreateActivity(current, dateKey)

    return {
      ...current,
      [dateKey]: withGoalCompletion(activity),
    }
  })

  return activities[dateKey]
}
