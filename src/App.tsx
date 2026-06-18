import { useEffect, useState } from 'react'
import './App.css'
import { getActivityForDate, getLocalDateKey } from './activity'
import { formatActiveTime, getGoalProgress, secondsToMinutes } from './goalProgress'
import { getDashboardHeatmapGrid } from './heatmap'
import type { HeatmapGrid, HeatmapWeek } from './heatmap'
import { getHeatmapTooltipLines, getHeatmapTooltipText } from './heatmapTooltip'
import {
  getPathProgress,
  isValidAverageWindowDays,
  isValidPathName,
  isValidProgressPercentage,
  isValidTotalEstimatedHours,
  parseAverageWindowDays,
  saveAverageWindowDays,
  savePathName,
  saveProgressPercentage,
  saveTotalEstimatedHours,
} from './pathProgress'
import {
  formatHoursPerDay,
  formatPathHours,
  getFinishEstimateText,
  getPathProjection,
} from './projection'
import type { PathProjection } from './projection'
import { getUserSettings, saveDailyGoal } from './settings'
import { getStorageValue } from './storage'
import type {
  AverageWindowDays,
  DailyActivity,
  PathProgress,
  StreakStatus,
  UserSettings,
} from './storage'
import { getStreakDisplayState } from './streakDisplay'
import {
  getAllTimeStats,
  getCurrentMonthTimeStats,
  getCurrentWeekTimeStats,
} from './timeStats'
import type { AllTimeStats, MonthlyTimeStats, WeeklyTimeStats } from './timeStats'
import { getCurrentMonthSummary } from './monthlySummary'
import type { MonthlySummary } from './monthlySummary'
import { getCurrentWeekSummary } from './weeklySummary'
import type { WeeklySummary } from './weeklySummary'

const dailyGoalPresetMinutes = [15, 30, 45, 60] as const
const heatmapPeriodOptions = ['year', 'month', 'week'] as const
const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short' })
const dateRangeFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  weekday: 'long',
  year: 'numeric',
})

type HeatmapPeriod = (typeof heatmapPeriodOptions)[number]

const heatmapPeriodLabels: Record<HeatmapPeriod, string> = {
  year: 'Last 365 days',
  month: 'This month',
  week: 'This week',
}

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

const getWeekStart = (date: Date): Date => {
  const weekStart = new Date(date)

  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())

  return weekStart
}

type SummaryStatCardProps = {
  detail: string
  isEmpty?: boolean
  label: string
  value: string
}

function SummaryStatCard({
  detail,
  isEmpty = false,
  label,
  value,
}: SummaryStatCardProps) {
  return (
    <article className={`summary-stat-card ${isEmpty ? 'is-empty' : ''}`}>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <span className="summary-card-detail">{detail}</span>
    </article>
  )
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
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null)
  const [pathProgress, setPathProgress] = useState<PathProgress | null>(null)
  const [finishDateText, setFinishDateText] = useState('Study on Scrimba to estimate')
  const [finishDateLabel, setFinishDateLabel] = useState('Not estimated yet')
  const [averagePaceSeconds, setAveragePaceSeconds] = useState(0)
  const [completedHours, setCompletedHours] = useState(0)
  const [remainingHours, setRemainingHours] = useState(0)
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState('30')
  const [dailyGoalError, setDailyGoalError] = useState<string | null>(null)
  const [heatmapPeriod, setHeatmapPeriod] = useState<HeatmapPeriod>('year')
  const [pathName, setPathName] = useState('')
  const [totalEstimatedHours, setTotalEstimatedHours] = useState('1')
  const [progressPercentage, setProgressPercentage] = useState('0')
  const [pathError, setPathError] = useState<string | null>(null)

  const refreshTodayActivity = () => {
    void Promise.all([
      getActivityForDate(new Date()),
      getStorageValue('streakStatus'),
      getDashboardHeatmapGrid(),
      getCurrentWeekTimeStats(),
      getCurrentMonthTimeStats(),
      getAllTimeStats(),
      getCurrentWeekSummary(),
      getCurrentMonthSummary(),
      getPathProjection(),
    ]).then(
      ([
        activity,
        streak,
        heatmap,
        weekStats,
        monthStats,
        allStats,
        summary,
        monthSummary,
        projection,
      ]) => {
        setTodayActivity(activity)
        setStreakStatus(streak)
        setHeatmapGrid(heatmap)
        setWeeklyTimeStats(weekStats)
        setMonthlyTimeStats(monthStats)
        setAllTimeStats(allStats)
        setWeeklySummary(summary)
        setMonthlySummary(monthSummary)
        syncProjection(projection)
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
      getCurrentMonthSummary(),
      getPathProgress(),
      getPathProjection(),
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
        loadedMonthlySummary,
        loadedPathProgress,
        projection,
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
        setMonthlySummary(loadedMonthlySummary)
        setPathProgress(loadedPathProgress)
        syncProjection(projection)
        setPathName(loadedPathProgress.pathName)
        setTotalEstimatedHours(String(loadedPathProgress.totalEstimatedHours))
        setProgressPercentage(String(loadedPathProgress.progressPercentage))
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

  const refreshProjection = () => {
    void getPathProjection().then((projection) => {
      syncProjection(projection)
    })
  }

  const syncProjection = (projection: PathProjection) => {
    setFinishDateText(getFinishEstimateText(projection, 'full'))
    setFinishDateLabel(projection.finishDateLabel ?? 'Not estimated yet')
    setAveragePaceSeconds(projection.averageDailySeconds)
    setCompletedHours(projection.completedHours)
    setRemainingHours(projection.remainingHours)
  }

  const syncPathProgress = (nextPathProgress: PathProgress) => {
    setPathProgress(nextPathProgress)
    setPathName(nextPathProgress.pathName)
    setTotalEstimatedHours(String(nextPathProgress.totalEstimatedHours))
    setProgressPercentage(String(nextPathProgress.progressPercentage))
    setPathError(null)
    refreshProjection()
  }

  const savePathNameValue = () => {
    if (!isValidPathName(pathName)) {
      setPathError('Enter a path name.')
      setPathName(pathProgress?.pathName ?? '')
      return
    }

    void savePathName(pathName).then(syncPathProgress)
  }

  const saveTotalEstimatedHoursValue = () => {
    const hours = Number(totalEstimatedHours)

    if (!isValidTotalEstimatedHours(hours)) {
      setPathError('Total estimate must be greater than 0 hours.')
      setTotalEstimatedHours(String(pathProgress?.totalEstimatedHours ?? 1))
      return
    }

    void saveTotalEstimatedHours(hours).then(syncPathProgress)
  }

  const saveProgressPercentageValue = () => {
    const percentage = Number(progressPercentage)

    if (!isValidProgressPercentage(percentage)) {
      setPathError('Progress must be between 0 and 100%.')
      setProgressPercentage(String(pathProgress?.progressPercentage ?? 0))
      return
    }

    void saveProgressPercentage(percentage).then(syncPathProgress)
  }

  const saveAverageWindowValue = (averageWindowDays: AverageWindowDays) => {
    if (!isValidAverageWindowDays(averageWindowDays)) {
      setPathError('Choose a valid average window.')
      return
    }

    void saveAverageWindowDays(averageWindowDays).then(syncPathProgress)
  }

  const goalProgress = getGoalProgress(todayActivity, settings)
  const todayActiveSeconds = goalProgress.activeSeconds
  const weeklyActiveSeconds = weeklyTimeStats?.activeSeconds ?? 0
  const monthlyActiveSeconds = monthlyTimeStats?.activeSeconds ?? 0
  const allTimeActiveSeconds = allTimeStats?.activeSeconds ?? 0
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
  const monthlySummaryLines =
    monthlySummary?.summaryText ?? ['Monthly summary is loading.']
  const pathStatusText = pathProgress?.pathName
    ? `${pathProgress.pathName} - ${pathProgress.progressPercentage}% complete`
    : 'No path set'
  const pathNameDisplay = pathProgress?.pathName || 'No path set'
  const paceWindowLabel =
    pathProgress?.averageWindowDays === 'all'
      ? 'All-time average'
      : `${pathProgress?.averageWindowDays ?? 7}-day average`
  const pathCompletionPercentage = pathProgress?.progressPercentage ?? 0
  const averagePaceText = formatHoursPerDay(averagePaceSeconds)
  const completedHoursText = formatPathHours(completedHours)
  const remainingHoursText =
    remainingHours <= 0 ? 'Path complete' : formatPathHours(remainingHours)
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
  const heatmapDays =
    heatmapGrid?.weeks
      .flatMap((week) => week.days)
      .filter((day) => !day.isOutsideRange && !day.isFuture) ?? []
  const today = new Date()
  const selectedHeatmapStartDate =
    heatmapPeriod === 'week'
      ? getWeekStart(today)
      : heatmapPeriod === 'month'
        ? new Date(today.getFullYear(), today.getMonth(), 1)
        : parseLocalDateKey(heatmapGrid?.startDate ?? getLocalDateKey(today))
  const selectedHeatmapStartKey = getLocalDateKey(selectedHeatmapStartDate)
  const selectedHeatmapEndKey = heatmapGrid?.endDate ?? getLocalDateKey(today)
  const selectedHeatmapDays = heatmapDays.filter(
    (day) => day.date >= selectedHeatmapStartKey && day.date <= selectedHeatmapEndKey,
  )
  const selectedHeatmapActiveDays = selectedHeatmapDays.filter(
    (day) => day.activeSeconds > 0,
  ).length
  const selectedHeatmapActiveSeconds = selectedHeatmapDays.reduce(
    (total, day) => total + day.activeSeconds,
    0,
  )
  const selectedHeatmapGoalDays = selectedHeatmapDays.filter(
    (day) => day.goalCompleted,
  ).length
  const heatmapDateRangeText = heatmapGrid
    ? `${dateRangeFormatter.format(parseLocalDateKey(heatmapGrid.startDate))} to ${dateRangeFormatter.format(parseLocalDateKey(heatmapGrid.endDate))}`
    : 'Loading activity range'
  const trackingStatusText =
    settings?.trackingEnabled === false ? 'Tracking paused' : 'Tracking on'
  const trackingStatusClass =
    settings?.trackingEnabled === false ? 'is-paused' : 'is-active'
  const currentDateText = fullDateFormatter.format(new Date())
  const currentStreak = streakStatus?.currentStreak ?? 0
  const currentStreakLabel = `${currentStreak} ${currentStreak === 1 ? 'day' : 'days'}`
  const todaySummaryDetail =
    todayActiveSeconds > 0
      ? goalProgress.isComplete
        ? 'Goal complete today'
        : 'Active Scrimba time'
      : 'No activity yet'
  const weeklySummaryDetail =
    weeklyActiveSeconds > 0 ? weeklyAverageText : 'No activity this week'
  const monthlySummaryDetail =
    monthlyActiveSeconds > 0 ? monthlyActiveDaysText : 'No activity this month'
  const streakSummaryDetail =
    currentStreak > 0 ? streakDisplay.message : 'No streak yet'
  const allTimeSummaryDetail =
    allTimeActiveSeconds > 0 ? allTimeActiveDaysText : 'No tracked time yet'

  return (
    <main className="app-shell dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Local-first Chrome extension</p>
          <h1>Scrimba Learning Tracker</h1>
          <p className="dashboard-date">{currentDateText}</p>
        </div>
        <div className="dashboard-header-actions">
          <span className={`status-pill ${trackingStatusClass}`}>
            {trackingStatusText}
          </span>
          <a className="settings-link" href="#dashboard-settings">
            Settings
          </a>
        </div>
      </header>

      <section className="summary-grid" aria-label="Key learning stats">
        <SummaryStatCard
          detail={todaySummaryDetail}
          isEmpty={todayActiveSeconds === 0}
          label="Today"
          value={formatActiveTime(todayActiveSeconds)}
        />
        <SummaryStatCard
          detail={weeklySummaryDetail}
          isEmpty={weeklyActiveSeconds === 0}
          label="This week"
          value={formatActiveTime(weeklyActiveSeconds)}
        />
        <SummaryStatCard
          detail={monthlySummaryDetail}
          isEmpty={monthlyActiveSeconds === 0}
          label="This month"
          value={formatActiveTime(monthlyActiveSeconds)}
        />
        <SummaryStatCard
          detail={streakSummaryDetail}
          isEmpty={currentStreak === 0}
          label="Current streak"
          value={currentStreakLabel}
        />
        <SummaryStatCard
          detail={allTimeSummaryDetail}
          isEmpty={allTimeActiveSeconds === 0}
          label="All-time"
          value={formatActiveTime(allTimeActiveSeconds)}
        />
      </section>

      <section
        className="panel heatmap-hero-panel"
        aria-labelledby="dashboard-heatmap-title"
      >
        <div className="heatmap-hero-header">
          <div>
            <p className="eyebrow">Activity calendar</p>
            <h2 id="dashboard-heatmap-title">Year in Scrimba</h2>
            <p className="heatmap-range-label">{heatmapDateRangeText}</p>
          </div>

          <div
            className="heatmap-period-control"
            role="group"
            aria-label="Heatmap summary period"
          >
            {heatmapPeriodOptions.map((period) => (
              <button
                key={period}
                type="button"
                className={heatmapPeriod === period ? 'is-selected' : undefined}
                onClick={() => setHeatmapPeriod(period)}
              >
                {period}
              </button>
            ))}
          </div>
        </div>

        <div className="heatmap-summary-grid" aria-label="Selected period totals">
          <span>
            Period
            <strong>{heatmapPeriodLabels[heatmapPeriod]}</strong>
          </span>
          <span>
            Active days
            <strong>{selectedHeatmapActiveDays}</strong>
          </span>
          <span>
            Total time
            <strong>{formatActiveTime(selectedHeatmapActiveSeconds)}</strong>
          </span>
          <span>
            Goals hit
            <strong>{selectedHeatmapGoalDays}</strong>
          </span>
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
                  {week.days.map((day) => {
                    const isSelectedPeriodDay =
                      !day.isOutsideRange &&
                      day.date >= selectedHeatmapStartKey &&
                      day.date <= selectedHeatmapEndKey

                    return (
                      <span
                        key={day.date}
                        tabIndex={0}
                        className={[
                          'dashboard-heatmap-cell',
                          'heatmap-tooltip-trigger',
                          `heatmap-level-${day.intensity}`,
                          day.isToday ? 'is-today' : '',
                          day.isFuture || day.isOutsideRange ? 'is-muted' : '',
                          isSelectedPeriodDay ? 'is-selected-period' : '',
                          !isSelectedPeriodDay && heatmapPeriod !== 'year'
                            ? 'is-outside-selected-period'
                            : '',
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
                    )
                  })}
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

      <section className="panel pace-panel" aria-labelledby="pace-title">
        <div className="pace-header">
          <div>
            <p className="eyebrow">Path projection</p>
            <h2 id="pace-title">Learning Pace</h2>
          </div>
          <a className="secondary-button" href="#path-setup">
            Edit path
          </a>
        </div>

        <div className="pace-path-card">
          <span>Current path</span>
          <strong>{pathNameDisplay}</strong>
          <div className="pace-progress-row">
            <span>{pathCompletionPercentage}% complete</span>
            <span>{completedHoursText} logged</span>
          </div>
          <div className="progress-track" aria-hidden="true">
            <span style={{ width: `${pathCompletionPercentage}%` }} />
          </div>
        </div>

        <div className="pace-stat-grid" aria-label="Path pace summary">
          <span>
            Average pace
            <strong>{averagePaceText}</strong>
            <small>{paceWindowLabel}</small>
          </span>
          <span>
            Remaining
            <strong>{remainingHoursText}</strong>
            <small>estimated path time</small>
          </span>
          <span>
            Finish date
            <strong>{finishDateLabel}</strong>
            <small>{finishDateText}</small>
          </span>
        </div>
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

      <section className="panel weekly-summary-panel" aria-label="Monthly summary">
        <div className="panel-heading-row">
          <h2>Monthly Summary</h2>
          <span>{monthlySummary?.activeDays ?? 0} active days</span>
        </div>
        <ul className="weekly-summary-list">
          {monthlySummaryLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="weekly-summary-stats">
          <span>
            Daily average
            <strong>{formatActiveTime(monthlySummary?.dailyAverageSeconds ?? 0)}</strong>
          </span>
          <span>
            Best week
            <strong>{formatActiveTime(monthlySummary?.bestWeek?.activeSeconds ?? 0)}</strong>
            <small>{monthlySummary?.bestWeek?.label ?? 'No activity yet'}</small>
          </span>
          <span>
            Longest streak
            <strong>{monthlySummary?.longestStreak ?? 0}d</strong>
          </span>
        </div>
      </section>

      <section className="panel path-setup-panel" id="path-setup" aria-label="Path setup">
        <div className="panel-heading-row">
          <h2>Path Setup</h2>
          <span>{pathStatusText}</span>
        </div>

        <div className="path-setup-grid">
          <label>
            <span>Path name</span>
            <input
              type="text"
              value={pathName}
              onBlur={savePathNameValue}
              onChange={(event) => setPathName(event.target.value)}
            />
          </label>

          <label>
            <span>Total estimate</span>
            <div className="input-row dashboard-input-row">
              <input
                min="0.1"
                step="0.5"
                type="number"
                value={totalEstimatedHours}
                onBlur={saveTotalEstimatedHoursValue}
                onChange={(event) => setTotalEstimatedHours(event.target.value)}
              />
              <span>hr</span>
            </div>
          </label>

          <label>
            <span>Progress</span>
            <div className="input-row dashboard-input-row">
              <input
                max="100"
                min="0"
                step="1"
                type="number"
                value={progressPercentage}
                onBlur={saveProgressPercentageValue}
                onChange={(event) => setProgressPercentage(event.target.value)}
              />
              <span>%</span>
            </div>
          </label>

          <label>
            <span>Average window</span>
            <select
              value={pathProgress?.averageWindowDays ?? 7}
              onChange={(event) => {
                saveAverageWindowValue(parseAverageWindowDays(event.target.value))
              }}
            >
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="all">All time</option>
            </select>
          </label>
        </div>

        <div className="path-setup-stats">
          <span>
            Remaining
            <strong>{remainingHoursText}</strong>
          </span>
          <span>
            Completed
            <strong>{completedHoursText}</strong>
          </span>
          <span>
            Average pace
            <strong>{averagePaceText}</strong>
          </span>
          <span className="path-projection-message">
            Projection
            <strong>{finishDateText}</strong>
          </span>
        </div>
        {pathError ? <span className="error-text">{pathError}</span> : null}
      </section>

      <section className="panel" id="dashboard-settings">
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

    </main>
  )
}

export default App
