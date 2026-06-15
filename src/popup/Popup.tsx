import { useEffect, useState } from 'react'
import '../App.css'
import { getActivityForDate } from '../activity'
import { formatActiveTime, getGoalProgress, secondsToMinutes } from '../goalProgress'
import { getPopupHeatmapGrid } from '../heatmap'
import type { HeatmapGrid } from '../heatmap'
import { getHeatmapTooltipLines, getHeatmapTooltipText } from '../heatmapTooltip'
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
} from '../pathProgress'
import {
  formatHoursPerDay,
  formatPathHours,
  getFinishEstimateText,
  getPathProjection,
} from '../projection'
import type { PathProjection } from '../projection'
import {
  getUserSettings,
  saveDailyGoal,
  saveIdleTimeout,
  saveTimezone,
  saveTrackingEnabled,
} from '../settings'
import { getStorageValue } from '../storage'
import type {
  AverageWindowDays,
  DailyActivity,
  PathProgress,
  StreakStatus,
  UserSettings,
} from '../storage'
import { getStreakDisplayState } from '../streakDisplay'
import { getCurrentWeekTimeStats } from '../timeStats'
import type { WeeklyTimeStats } from '../timeStats'

const dailyGoalPresetMinutes = [15, 30, 45, 60] as const

const openDashboard = () => {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') })
    return
  }

  window.location.href = '/dashboard.html'
}

const isValidDailyGoalMinutes = (value: number): boolean =>
  Number.isInteger(value) && value > 0 && value <= 24 * 60

function Popup() {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [todayActivity, setTodayActivity] = useState<DailyActivity | null>(null)
  const [streakStatus, setStreakStatus] = useState<StreakStatus | null>(null)
  const [heatmapGrid, setHeatmapGrid] = useState<HeatmapGrid | null>(null)
  const [weeklyTimeStats, setWeeklyTimeStats] = useState<WeeklyTimeStats | null>(null)
  const [pathProgress, setPathProgress] = useState<PathProgress | null>(null)
  const [finishDateText, setFinishDateText] = useState('Study on Scrimba to estimate')
  const [averagePaceSeconds, setAveragePaceSeconds] = useState(0)
  const [completedHours, setCompletedHours] = useState(0)
  const [remainingHours, setRemainingHours] = useState(0)
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState('30')
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState('2')
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  )
  const [pathName, setPathName] = useState('')
  const [totalEstimatedHours, setTotalEstimatedHours] = useState('1')
  const [progressPercentage, setProgressPercentage] = useState('0')
  const [dailyGoalError, setDailyGoalError] = useState<string | null>(null)
  const [pathError, setPathError] = useState<string | null>(null)

  const refreshProjection = () => {
    void getPathProjection().then((projection) => {
      syncProjection(projection)
    })
  }

  const syncProjection = (projection: PathProjection) => {
    setFinishDateText(getFinishEstimateText(projection))
    setAveragePaceSeconds(projection.averageDailySeconds)
    setCompletedHours(projection.completedHours)
    setRemainingHours(projection.remainingHours)
  }

  const refreshTodayActivity = () => {
    void Promise.all([
      getActivityForDate(new Date()),
      getStorageValue('streakStatus'),
      getPopupHeatmapGrid(),
      getCurrentWeekTimeStats(),
      getPathProjection(),
    ]).then(([activity, streak, heatmap, weekStats, projection]) => {
      setTodayActivity(activity)
      setStreakStatus(streak)
      setHeatmapGrid(heatmap)
      setWeeklyTimeStats(weekStats)
      syncProjection(projection)
    })
  }

  useEffect(() => {
    let isMounted = true
    const refreshIntervalId = window.setInterval(refreshTodayActivity, 5_000)

    void Promise.all([
      getUserSettings(),
      getActivityForDate(new Date()),
      getStorageValue('streakStatus'),
      getPopupHeatmapGrid(),
      getCurrentWeekTimeStats(),
      getPathProgress(),
      getPathProjection(),
    ]).then(
      ([
        loadedSettings,
        loadedTodayActivity,
        loadedStreakStatus,
        loadedHeatmapGrid,
        loadedWeeklyTimeStats,
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
        setPathProgress(loadedPathProgress)
        syncProjection(projection)
        setDailyGoalMinutes(
          String(secondsToMinutes(loadedSettings.dailyGoalSeconds)),
        )
        setIdleTimeoutMinutes(
          String(secondsToMinutes(loadedSettings.idleTimeoutSeconds)),
        )
        setTimezone(loadedSettings.timezone)
        setPathName(loadedPathProgress.pathName)
        setTotalEstimatedHours(String(loadedPathProgress.totalEstimatedHours))
        setProgressPercentage(String(loadedPathProgress.progressPercentage))
      },
    )

    return () => {
      isMounted = false
      window.clearInterval(refreshIntervalId)
    }
  }, [])

  const syncPathProgress = (nextPathProgress: PathProgress) => {
    setPathProgress(nextPathProgress)
    setPathName(nextPathProgress.pathName)
    setTotalEstimatedHours(String(nextPathProgress.totalEstimatedHours))
    setProgressPercentage(String(nextPathProgress.progressPercentage))
    setPathError(null)
    refreshProjection()
  }

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

  const saveIdleTimeoutValue = () => {
    void saveIdleTimeout(Number(idleTimeoutMinutes) * 60).then(setSettings)
  }

  const saveTimezoneValue = () => {
    void saveTimezone(timezone).then((nextSettings) => {
      setSettings(nextSettings)
      setTimezone(nextSettings.timezone)
    })
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

  const toggleTracking = () => {
    if (!settings) {
      return
    }

    void saveTrackingEnabled(!settings.trackingEnabled).then(setSettings)
  }

  const goalProgress = getGoalProgress(todayActivity, settings)
  const todayActiveTime = formatActiveTime(todayActivity?.activeSeconds ?? 0)
  const todayGoalTime =
    goalProgress.goalSeconds > 0 ? formatActiveTime(goalProgress.goalSeconds) : 'Not set'
  const todayProgressState =
    goalProgress.goalSeconds === 0
      ? 'Set a daily goal to track progress'
      : goalProgress.isComplete
        ? 'Goal complete'
        : `${formatActiveTime(goalProgress.remainingSeconds)} remaining`
  const weeklyActiveTime = formatActiveTime(weeklyTimeStats?.activeSeconds ?? 0)
  const weeklyAverageText = `${formatActiveTime(
    weeklyTimeStats?.averageSecondsPerDay ?? 0,
  )} avg/day`
  const averagePaceText = formatHoursPerDay(averagePaceSeconds)
  const completedHoursText = formatPathHours(completedHours)
  const remainingHoursText =
    remainingHours <= 0 ? 'Path complete' : formatPathHours(remainingHours)
  const streakDisplay = getStreakDisplayState(streakStatus, goalProgress)

  return (
    <main className="popup-shell" aria-label="Scrimba Learning Tracker popup">
      <header className="popup-header">
        <div>
          <p className="eyebrow">Scrimba tracker</p>
          <h1>{settings?.trackingEnabled === false ? 'Paused' : 'Learning status'}</h1>
        </div>
        <span className="status-pill">
          {settings?.trackingEnabled === false ? 'Paused' : 'Tracking on'}
        </span>
      </header>

      <section
        className={[
          'popup-today-card',
          goalProgress.isComplete ? 'is-complete' : '',
        ].filter(Boolean).join(' ')}
        aria-label="Today's progress"
      >
        <div className="popup-today-header">
          <span>Today's progress</span>
          {goalProgress.isComplete ? (
            <span
              aria-label="Goal completed"
              className="today-goal-check"
              role="img"
            />
          ) : null}
        </div>

        <div className="popup-today-metrics">
          <span>
            Active
            <strong>{todayActiveTime}</strong>
          </span>
          <span>
            Goal
            <strong>{todayGoalTime}</strong>
          </span>
        </div>

        <div className="goal-progress" aria-label="Today goal progress">
          <div className="goal-progress-header">
            <span>{todayProgressState}</span>
            <strong>{goalProgress.percentage}%</strong>
          </div>
          <div className="progress-track" aria-hidden="true">
            <span style={{ width: `${goalProgress.visualPercentage}%` }} />
          </div>
        </div>
      </section>

      <section className="popup-status-grid" aria-label="Current status">
        <article className={`popup-status-card streak-state-${streakDisplay.tone}`}>
          <span>Current streak</span>
          <strong>{streakDisplay.currentLabel}</strong>
          <small>{streakDisplay.message}</small>
        </article>
        <article className="popup-status-card">
          <span>Weekly total</span>
          <strong>{weeklyActiveTime}</strong>
          <small>{weeklyAverageText}</small>
        </article>
      </section>

      <section className="mini-heatmap" aria-label="Recent activity heatmap">
        <div className="mini-heatmap-header">
          <span>Last 12 weeks</span>
          <span>Less More</span>
        </div>
        <div className="mini-heatmap-grid" role="img" aria-label="Daily Scrimba activity for the last 12 weeks">
          {heatmapGrid?.weeks.map((week) => (
            <div className="mini-heatmap-week" key={week.startDate}>
              {week.days.map((day) => (
                <span
                  key={day.date}
                  tabIndex={0}
                  className={[
                    'mini-heatmap-cell',
                    'heatmap-tooltip-trigger',
                    `heatmap-level-${day.intensity}`,
                    day.isToday ? 'is-today' : '',
                    day.isFuture ? 'is-future' : '',
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
      </section>

      <section className="popup-projection" aria-label="Pace projection">
        <span>Pace projection</span>
        <strong>{finishDateText}</strong>
        <small>{averagePaceText} - {remainingHoursText} remaining</small>
      </section>

      <button type="button" className="primary-button" onClick={openDashboard}>
        Open dashboard
      </button>

      <details className="popup-settings-shortcut">
        <summary>Settings</summary>

        <section className="settings-panel" aria-label="Tracking settings">
          <label className="toggle-row">
            <span>Tracking</span>
            <input
              type="checkbox"
              checked={settings?.trackingEnabled ?? true}
              onChange={toggleTracking}
            />
          </label>

          <label>
            <span>Daily goal</span>
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
              <div className="input-row">
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
          </label>

          <label>
            <span>Idle timeout</span>
            <div className="input-row">
              <input
                min="0"
                type="number"
                value={idleTimeoutMinutes}
                onBlur={saveIdleTimeoutValue}
                onChange={(event) => setIdleTimeoutMinutes(event.target.value)}
              />
              <span>min</span>
            </div>
          </label>

          <label>
            <span>Timezone</span>
            <input
              type="text"
              value={timezone}
              onBlur={saveTimezoneValue}
              onChange={(event) => setTimezone(event.target.value)}
            />
          </label>
        </section>

        <section className="settings-panel" aria-label="Path settings">
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
            <div className="input-row">
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
            <div className="input-row">
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

          <p className="projection-line">
            Completed {completedHoursText}
          </p>
          {pathError ? <span className="error-text">{pathError}</span> : null}
        </section>
      </details>
    </main>
  )
}

export default Popup
