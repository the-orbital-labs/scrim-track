import { getUserSettings } from './settings'
import { getStorageValue, setStorageValue, updateStorageValue } from './storage'
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

type AddActiveSecondsIntervalInput = {
  activeSeconds: number
  endedAt: string
  sessionId?: string
  url?: string
  title?: string | null
}

type ActivitySegment = {
  activeSeconds: number
  date: string
  endedAt: string
  startedAt: string
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

const getNextLocalDateStart = (value: Date): Date =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate() + 1)

const splitIntervalByLocalDate = (
  startedAt: string,
  endedAt: string,
): ActivitySegment[] => {
  const segments: ActivitySegment[] = []
  let cursor = new Date(startedAt)
  const end = new Date(endedAt)

  while (cursor < end) {
    const nextDateStart = getNextLocalDateStart(cursor)
    const segmentEnd = nextDateStart < end ? nextDateStart : end
    const activeSeconds = Math.floor(
      (segmentEnd.getTime() - cursor.getTime()) / 1000,
    )

    if (activeSeconds > 0) {
      segments.push({
        activeSeconds,
        date: getLocalDateKey(cursor),
        startedAt: cursor.toISOString(),
        endedAt: segmentEnd.toISOString(),
      })
    }

    cursor = segmentEnd
  }

  return segments
}

export const createDailyActivity = (
  date: string,
  goalSeconds = 0,
): DailyActivity => ({
  date,
  activeSeconds: 0,
  goalSeconds,
  goalCompleted: false,
  sessions: [],
})

const getOrCreateActivity = (
  activities: Record<string, DailyActivity>,
  date: string,
  goalSeconds = 0,
): DailyActivity => activities[date] ?? createDailyActivity(date, goalSeconds)

const normalizeActiveSeconds = (activeSeconds: number): number =>
  Math.max(0, Math.floor(activeSeconds))

const withGoalCompletion = (activity: DailyActivity): DailyActivity => ({
  ...activity,
  goalCompleted:
    activity.goalSeconds > 0 && activity.activeSeconds >= activity.goalSeconds,
})

const withUpdatedSession = (
  activity: DailyActivity,
  segment: ActivitySegment,
  sessionId?: string,
  url?: string,
  title?: string | null,
): DailyActivity => {
  if (!sessionId) {
    return activity
  }

  const existingSession = activity.sessions.find(({ id }) => id === sessionId)

  if (!existingSession) {
    return {
      ...activity,
      sessions: [
        ...activity.sessions,
        {
          id: sessionId,
          url: url ?? '',
          title: title ?? null,
          startedAt: segment.startedAt,
          isActive: true,
          endedAt: segment.endedAt,
          activeSeconds: segment.activeSeconds,
        },
      ],
    }
  }

  return {
    ...activity,
    sessions: activity.sessions.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            url: url ?? session.url,
            title: title ?? session.title,
            isActive: true,
            endedAt: segment.endedAt,
            activeSeconds: session.activeSeconds + segment.activeSeconds,
          }
        : session,
    ),
  }
}

const calculateStreakStatus = (
  activities: Record<string, DailyActivity>,
  today: string,
) => {
  const activeDates = new Set(
    Object.values(activities)
      .filter((activity) => activity.activeSeconds > 0)
      .map((activity) => activity.date),
  )
  const sortedDates = [...activeDates].sort()
  let longestStreak = 0
  let rollingStreak = 0
  let previousDate: Date | null = null

  for (const dateKey of sortedDates) {
    const currentDate = parseLocalDateKey(dateKey)
    const previousTime = previousDate?.getTime()
    const expectedPreviousTime = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate() - 1,
    ).getTime()

    rollingStreak =
      previousTime === expectedPreviousTime ? rollingStreak + 1 : 1
    longestStreak = Math.max(longestStreak, rollingStreak)
    previousDate = currentDate
  }

  let currentStreak = 0

  for (
    let cursor = parseLocalDateKey(today);
    activeDates.has(getLocalDateKey(cursor));
    cursor.setDate(cursor.getDate() - 1)
  ) {
    currentStreak += 1
  }

  return {
    currentStreak,
    longestStreak,
    lastCalculatedAt: new Date().toISOString(),
  }
}

export const recalculateStreakStatus = async (
  today: string | Date = new Date(),
) => {
  const todayKey = typeof today === 'string' ? today : getLocalDateKey(today)
  const activities = await getStorageValue('dailyActivities')
  const streakStatus = calculateStreakStatus(activities, todayKey)

  await setStorageValue('streakStatus', streakStatus)

  return streakStatus
}

export const ensureTodayActivity = async (): Promise<DailyActivity> => {
  const today = getLocalDateKey()
  const { dailyGoalSeconds } = await getUserSettings()
  const activities = await updateStorageValue('dailyActivities', (current) => ({
    ...current,
    [today]: getOrCreateActivity(current, today, dailyGoalSeconds),
  }))

  return activities[today]
}

export const startLearningSession = async (
  session: StartLearningSessionInput,
): Promise<DailyActivity> => {
  const date = getLocalDateKey(session.startedAt)
  const { dailyGoalSeconds } = await getUserSettings()
  const activities = await updateStorageValue('dailyActivities', (current) => {
    const activity = getOrCreateActivity(current, date, dailyGoalSeconds)

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
  const streakStatus = calculateStreakStatus(activities, date)

  await setStorageValue('streakStatus', streakStatus)

  return activities[date]
}

export const setLearningSessionActiveState = async (
  sessionId: string,
  isActive: boolean,
): Promise<boolean> => {
  let didUpdate = false

  await updateStorageValue('dailyActivities', (current) => {
    let nextActivities = current

    for (const [date, activity] of Object.entries(current)) {
      if (!activity.sessions.some(({ id }) => id === sessionId)) {
        continue
      }

      didUpdate = true
      nextActivities = {
        ...nextActivities,
        [date]: {
          ...activity,
          sessions: activity.sessions.map((session) =>
            session.id === sessionId ? { ...session, isActive } : session,
          ),
        },
      }
    }

    return nextActivities
  })

  return didUpdate
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
  const { dailyGoalSeconds } = await getUserSettings()
  const activities = await updateStorageValue('dailyActivities', (current) => {
    const activity = getOrCreateActivity(current, date, dailyGoalSeconds)
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

export const addActiveSecondsForInterval = async ({
  activeSeconds,
  endedAt,
  sessionId,
  url,
  title,
}: AddActiveSecondsIntervalInput): Promise<DailyActivity[]> => {
  const seconds = normalizeActiveSeconds(activeSeconds)

  if (seconds === 0) {
    return []
  }

  const endedAtTime = new Date(endedAt).getTime()
  const startedAt = new Date(endedAtTime - seconds * 1000).toISOString()
  const segments = splitIntervalByLocalDate(startedAt, endedAt)
  const { dailyGoalSeconds } = await getUserSettings()
  const activities = await updateStorageValue('dailyActivities', (current) => {
    let nextActivities = { ...current }

    for (const segment of segments) {
      const activity = getOrCreateActivity(
        nextActivities,
        segment.date,
        dailyGoalSeconds,
      )
      const nextActivity = withGoalCompletion(
        withUpdatedSession(
          {
            ...activity,
            activeSeconds: activity.activeSeconds + segment.activeSeconds,
          },
          segment,
          sessionId,
          url,
          title,
        ),
      )

      nextActivities = {
        ...nextActivities,
        [segment.date]: nextActivity,
      }
    }

    return nextActivities
  })
  const lastSegment = segments.at(-1)

  if (lastSegment) {
    await setStorageValue(
      'streakStatus',
      calculateStreakStatus(activities, lastSegment.date),
    )
  }

  return segments.map((segment) => activities[segment.date])
}

export const getActivityForDate = async (
  date: string | Date,
): Promise<DailyActivity> => {
  const dateKey = typeof date === 'string' ? date : getLocalDateKey(date)
  const { dailyGoalSeconds } = await getUserSettings()
  const activities = await getStorageValue('dailyActivities')

  return getOrCreateActivity(activities, dateKey, dailyGoalSeconds)
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
  const { dailyGoalSeconds } = await getUserSettings()
  const activities = await getStorageValue('dailyActivities')
  const results: DailyActivity[] = []

  for (
    const cursor = new Date(start);
    cursor <= end;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const dateKey = getLocalDateKey(cursor)

    results.push(getOrCreateActivity(activities, dateKey, dailyGoalSeconds))
  }

  return results
}

export const updateGoalCompletionStatus = async (
  date: string | Date = new Date(),
): Promise<DailyActivity> => {
  const dateKey = typeof date === 'string' ? date : getLocalDateKey(date)
  const { dailyGoalSeconds } = await getUserSettings()
  const activities = await updateStorageValue('dailyActivities', (current) => {
    const activity = getOrCreateActivity(current, dateKey, dailyGoalSeconds)

    return {
      ...current,
      [dateKey]: withGoalCompletion(activity),
    }
  })

  return activities[dateKey]
}
