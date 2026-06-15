import { useEffect, useState } from 'react'
import './App.css'
import { getActivityForDate } from './activity'
import { formatActiveTime, getGoalProgress, secondsToMinutes } from './goalProgress'
import { getDashboardHeatmapGrid } from './heatmap'
import type { HeatmapGrid, HeatmapWeek } from './heatmap'
import { getHeatmapTooltipLines, getHeatmapTooltipText } from './heatmapTooltip'
import { getUserSettings, saveDailyGoal } from './settings'
import { getStorageValue } from './storage'
import type { DailyActivity, StreakStatus, UserSettings } from './storage'
import { getStreakDisplayState } from './streakDisplay'
import {
  getAllTimeStats,
  getCurrentMonthTimeStats,
  getCurrentWeekTimeStats,
} from './timeStats'
import type { AllTimeStats, MonthlyTimeStats, WeeklyTimeStats } from './timeStats'
import { getCurrentWeekSummary } from './weeklySummary'
import type { WeeklySummary } from './weeklySummary'

const dailyGoalPresetMinutes = [15, 30, 45, 60] as const
const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short' })

const isValidDailyGoalMinutes = (value: number): boolean =>
  Number.isInteger(value) && value > 0 && value <= 24 * 60

const parseLocalDateKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number)

  return new Date(year, month - 1, day)
}

const getMonthLabel = (week: HeatmapWeek): string => {
  const firstMonthDay = week.days.find((day) => {
    const date = parseLocalDateKey(day.date)

    return !day.isOutsideRange && date.getDate() <= 7
  })

  return firstMonthDay ? monthFormatter.format(parseLocalDateKey(firstMonthDay.date)) : ''
}

function App() {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [todayActivity, setTodayActivity] = useState<DailyActivity | null>(null)
  const [streakStatus, setStreakStatus] = useState<StreakStatus | null>(null)
  const [heatmapGrid, setHeatmapGrid] = useState<HeatmapGrid | null>(null)
  const [weeklyTimeStats, setWeeklyTimeStats] = useState<WeeklyTimeStats | null>(null)
  const [monthlyTimeStats, setMonthlyTimeStats] = useState<MonthlyTimeStats | null>(null)
  const [allTimeStats, setAllTimeStats] = useState<AllTimeStats | null>(null)
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null)
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState('30')
  const [dailyGoalError, setDailyGoalError] = useState<string | null>(null)

  const refreshTodayActivity = () => {
    void Promise.all([
      getActivityForDate(new Date()),
      getStorageValue('streakStatus'),
      getDashboardHeatmapGrid(),
      getCurrentWeekTimeStats(),
      getCurrentMonthTimeStats(),
      getAllTimeStats(),
      getCurrentWeekSummary(),
    ]).then(
      ([
        activity,
        streak,
        heatmap,
        weekStats,
        monthStats,
        allStats,
        summary,
      ]) => {
        setTodayActivity(activity)
        setStreakStatus(streak)
        setHeatmapGrid(heatmap)
        setWeeklyTimeStats(weekStats)
        setMonthlyTimeStats(monthStats)
        setAllTimeStats(allStats)
        setWeeklySummary(summary)
      },
    )
  }

  useEffect(() => {
    let isMounted = true
    const refreshIntervalId = window.setInterval(refreshTodayActivity, 5_000)

    void Promise.all([
      getUserSettings(),
      getActivityForDate(new Date()),
      getStorageValue('streakStatus'),
      getDashboardHeatmapGrid(),
      getCurrentWeekTimeStats(),
      getCurrentMonthTimeStats(),
      getAllTimeStats(),
      getCurrentWeekSummary(),
    ]).then(
      ([
        loadedSettings,
        loadedTodayActivity,
        loadedStreakStatus,
        loadedHeatmapGrid,
        loadedWeeklyTimeStats,
        loadedMonthlyTimeStats,
        loadedAllTimeStats,
        loadedWeeklySummary,
      ]) => {
        if (!isMounted) {
          return
        }

        setSettings(loadedSettings)
        setTodayActivity(loadedTodayActivity)
        setStreakStatus(loadedStreakStatus)
        setHeatmapGrid(loadedHeatmapGrid)
        setWeeklyTimeStats(loadedWeeklyTimeStats)
        setMonthlyTimeStats(loadedMonthlyTimeStats)
        setAllTimeStats(loadedAllTimeStats)
        setWeeklySummary(loadedWeeklySummary)
        setDailyGoalMinutes(
          String(secondsToMinutes(loadedSettings.dailyGoalSeconds)),
        )
      },
    )

    return () => {
      isMounted = false
      window.clearInterval(refreshIntervalId)
    }
  }, [])

  const saveGoalMinutes = (minutes: number) => {
    if (!isValidDailyGoalMinutes(minutes)) {
      setDailyGoalError('Enter 1-1440 minutes.')
      setDailyGoalMinutes(
        settings ? String(secondsToMinutes(settings.dailyGoalSeconds)) : '30',
      )
      return
    }

    setDailyGoalError(null)
    setDailyGoalMinutes(String(minutes))
    void saveDailyGoal(minutes * 60).then((nextSettings) => {
      setSettings(nextSettings)
      refreshTodayActivity()
    }).catch(() => {
      setDailyGoalError('Enter 1-1440 minutes.')
    })
  }

  const saveCustomGoal = () => {
    saveGoalMinutes(Number(dailyGoalMinutes))
  }

  const goalProgress = getGoalProgress(todayActivity, settings)
  const progressText =
    goalProgress.goalSeconds > 0
      ? `${formatActiveTime(goalProgress.activeSeconds)} / ${formatActiveTime(goalProgress.goalSeconds)}`
      : 'Not set'
  const weeklyAverageText = `${formatActiveTime(
    weeklyTimeStats?.averageSecondsPerDay ?? 0,
  )} avg/day`
  const monthlyActiveDaysText = `${monthlyTimeStats?.activeDays ?? 0} active days`
  const allTimeActiveDaysText = `${allTimeStats?.activeDays ?? 0} active days`
  const weeklySummaryLines =
    weeklySummary?.summaryText ?? ['Weekly summary is loading.']
  const weeklyComparisonDifference = Math.abs(
    weeklySummary?.comparisonSeconds ?? 0,
  )
  const weeklyComparisonLabel =
    weeklySummary?.comparisonTrend === 'increase'
      ? 'Improved'
      : weeklySummary?.comparisonTrend === 'decrease'
        ? 'Declined'
        : 'No change'
  const streakDisplay = getStreakDisplayState(streakStatus, goalProgress)
  const activeHeatmapDays =
    heatmapGrid?.weeks
      .flatMap((week) => week.days)
      .filter((day) => !day.isOutsideRange && day.activeSeconds > 0).length ?? 0

  return (
    <main className="app-shell dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Local-first Chrome extension</p>
          <h1>Scrimba Learning Tracker</h1>
        </div>
        <span className="status-pill">Base setup ready</span>
      </header>

      <section className="summary-grid" aria-label="Tracker setup status">
        <article>
          <span className="metric-label">Today</span>
          <strong>{formatActiveTime(todayActivity?.activeSeconds ?? 0)}</strong>
          <span>Active Scrimba time</span>
        </article>
        <article>
          <span className="metric-label">This week</span>
          <strong>{formatActiveTime(weeklyTimeStats?.activeSeconds ?? 0)}</strong>
          <span>{weeklyAverageText}</span>
        </article>
        <article>
          <span className="metric-label">This month</span>
          <strong>{formatActiveTime(monthlyTimeStats?.activeSeconds ?? 0)}</strong>
          <span>{monthlyActiveDaysText}</span>
        </article>
        <article>
          <span className="metric-label">All time</span>
          <strong>{formatActiveTime(allTimeStats?.activeSeconds ?? 0)}</strong>
          <span>{allTimeActiveDaysText}</span>
        </article>
        <article>
          <span className="metric-label">Streak</span>
          <strong>{streakDisplay.currentLabel}</strong>
          <span>{streakDisplay.longestLabel}</span>
        </article>
        <article>
          <span className="metric-label">Goal</span>
          <strong>{progressText}</strong>
          <span>{goalProgress.isComplete ? 'Completed today' : 'Daily learning target'}</span>
        </article>
      </section>

      <section className="panel weekly-summary-panel" aria-label="Weekly summary">
        <div className="panel-heading-row">
          <h2>Weekly Summary</h2>
          <span>{weeklySummary?.activeDays ?? 0} active days</span>
        </div>
        <ul className="weekly-summary-list">
          {weeklySummaryLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="weekly-summary-stats">
          <span>
            Daily average
            <strong>{formatActiveTime(weeklySummary?.dailyAverageSeconds ?? 0)}</strong>
          </span>
          <span>
            Last week
            <strong>{formatActiveTime(weeklySummary?.previousWeekActiveSeconds ?? 0)}</strong>
          </span>
          <span
            className={`weekly-comparison weekly-comparison-${weeklySummary?.comparisonTrend ?? 'no-change'}`}
          >
            Change
            <strong>{formatActiveTime(weeklyComparisonDifference)}</strong>
            <small>{weeklyComparisonLabel}</small>
          </span>
        </div>
      </section>

      <section className="panel">
        <h2>Daily Goal</h2>
        <div className={`streak-state streak-state-${streakDisplay.tone}`}>
          <strong>{streakDisplay.currentLabel}</strong>
          <span>{streakDisplay.longestLabel}</span>
          <p>{streakDisplay.message}</p>
        </div>
        <div className="goal-progress" aria-label="Today goal progress">
          <div className="goal-progress-header">
            <span>Today</span>
            <strong>{progressText}</strong>
          </div>
          <div className="progress-track" aria-hidden="true">
            <span style={{ width: `${goalProgress.visualPercentage}%` }} />
          </div>
          <p className="projection-line">
            {goalProgress.isComplete
              ? 'Goal complete'
              : `${formatActiveTime(goalProgress.remainingSeconds)} remaining`}
          </p>
        </div>
        <div className="dashboard-goal-row">
          <div className="goal-control" role="group" aria-label="Daily goal presets">
            <div className="segmented-control">
              {dailyGoalPresetMinutes.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className={
                    Number(dailyGoalMinutes) === minutes ? 'is-selected' : undefined
                  }
                  onClick={() => saveGoalMinutes(minutes)}
                >
                  {minutes}
                </button>
              ))}
            </div>
            <div className="input-row dashboard-input-row">
              <input
                max="1440"
                min="1"
                step="1"
                type="number"
                value={dailyGoalMinutes}
                onBlur={saveCustomGoal}
                onChange={(event) => setDailyGoalMinutes(event.target.value)}
              />
              <span>min</span>
            </div>
          </div>
          {dailyGoalError ? <span className="error-text">{dailyGoalError}</span> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading-row">
          <h2>Activity Calendar</h2>
          <span>{activeHeatmapDays} active days</span>
        </div>

        <div className="dashboard-heatmap" aria-label="365-day activity heatmap">
          <div className="dashboard-months" aria-hidden="true">
            {heatmapGrid?.weeks.map((week) => (
              <span key={week.startDate}>{getMonthLabel(week)}</span>
            ))}
          </div>

          <div className="dashboard-heatmap-body">
            <div className="dashboard-weekdays" aria-hidden="true">
              {weekdayLabels.map((label, index) => (
                <span key={label}>{index % 2 === 1 ? label : ''}</span>
              ))}
            </div>

            <div
              className="dashboard-heatmap-grid"
              role="img"
              aria-label="Daily Scrimba activity for the last 365 days"
            >
              {heatmapGrid?.weeks.map((week) => (
                <div className="dashboard-heatmap-week" key={week.startDate}>
                  {week.days.map((day) => (
                    <span
                      key={day.date}
                      tabIndex={0}
                      className={[
                        'dashboard-heatmap-cell',
                        'heatmap-tooltip-trigger',
                        `heatmap-level-${day.intensity}`,
                        day.isToday ? 'is-today' : '',
                        day.isFuture || day.isOutsideRange ? 'is-muted' : '',
                      ].filter(Boolean).join(' ')}
                      title={getHeatmapTooltipText(day)}
                      aria-label={getHeatmapTooltipText(day)}
                    >
                      <span className="heatmap-tooltip" role="tooltip">
                        {getHeatmapTooltipLines(day).map((line) => (
                          <span key={line}>{line}</span>
                        ))}
                      </span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="heatmap-legend" aria-label="Heatmap intensity legend">
            <span>Less</span>
            {[0, 1, 2, 3, 4, 5].map((level) => (
              <span
                key={level}
                className={`dashboard-heatmap-cell heatmap-level-${level}`}
                title={
                  [
                    '0 min',
                    '1-14 min',
                    '15-29 min',
                    '30-59 min',
                    '60-119 min',
                    '120+ min',
                  ][level]
                }
              />
            ))}
            <span>More</span>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
