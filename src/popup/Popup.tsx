import { useEffect, useState } from 'react'
import '../App.css'
import { getActivityForDate } from '../activity'
import { formatMinutes, getGoalProgress, secondsToMinutes } from '../goalProgress'
import { getPopupHeatmapGrid } from '../heatmap'
import type { HeatmapGrid } from '../heatmap'
import { getHeatmapTooltipLines, getHeatmapTooltipText } from '../heatmapTooltip'
import {
  getPathProgress,
  saveAverageWindowDays,
  savePathName,
  saveProgressPercentage,
  saveTotalEstimatedHours,
} from '../pathProgress'
import { getPathProjection } from '../projection'
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
  const [pathProgress, setPathProgress] = useState<PathProgress | null>(null)
  const [finishDate, setFinishDate] = useState<string | null>(null)
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState('30')
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState('2')
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  )
  const [pathName, setPathName] = useState('')
  const [totalEstimatedHours, setTotalEstimatedHours] = useState('1')
  const [progressPercentage, setProgressPercentage] = useState('0')
  const [dailyGoalError, setDailyGoalError] = useState<string | null>(null)

  const refreshProjection = () => {
    void getPathProjection().then((projection) => {
      setFinishDate(projection.finishDate)
    })
  }

  const refreshTodayActivity = () => {
    void Promise.all([
      getActivityForDate(new Date()),
      getStorageValue('streakStatus'),
      getPopupHeatmapGrid(),
    ]).then(([activity, streak, heatmap]) => {
      setTodayActivity(activity)
      setStreakStatus(streak)
      setHeatmapGrid(heatmap)
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
      getPathProgress(),
      getPathProjection(),
    ]).then(
      ([
        loadedSettings,
        loadedTodayActivity,
        loadedStreakStatus,
        loadedHeatmapGrid,
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
        setPathProgress(loadedPathProgress)
        setFinishDate(projection.finishDate)
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
    void savePathName(pathName).then(syncPathProgress)
  }

  const saveTotalEstimatedHoursValue = () => {
    void saveTotalEstimatedHours(Number(totalEstimatedHours)).then(syncPathProgress)
  }

  const saveProgressPercentageValue = () => {
    void saveProgressPercentage(Number(progressPercentage)).then(syncPathProgress)
  }

  const saveAverageWindowValue = (averageWindowDays: AverageWindowDays) => {
    void saveAverageWindowDays(averageWindowDays).then(syncPathProgress)
  }

  const toggleTracking = () => {
    if (!settings) {
      return
    }

    void saveTrackingEnabled(!settings.trackingEnabled).then(setSettings)
  }

  const goalProgress = getGoalProgress(todayActivity, settings)
  const progressText =
    goalProgress.goalSeconds > 0
      ? `${formatMinutes(goalProgress.activeSeconds)} / ${formatMinutes(goalProgress.goalSeconds)}`
      : 'Not set'
  const streakDisplay = getStreakDisplayState(streakStatus, goalProgress)

  return (
    <main className="popup-shell" aria-label="Scrimba Learning Tracker popup">
      <div>
        <p className="eyebrow">Scrimba tracker</p>
        <h1>{settings?.trackingEnabled === false ? 'Paused' : 'Ready to track'}</h1>
        <p className="muted">
          This extension is wired for Scrimba pages and stores data locally.
        </p>
      </div>

      <section className="settings-panel" aria-label="Tracking settings">
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
              : `${formatMinutes(goalProgress.remainingSeconds)} remaining`}
          </p>
        </div>

        <div className="mini-heatmap" aria-label="Recent activity heatmap">
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
        </div>

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
              const value = event.target.value
              saveAverageWindowValue(value === 'all' ? 'all' : Number(value) as 7 | 14 | 30)
            }}
          >
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="all">All time</option>
          </select>
        </label>

        <p className="projection-line">
          {finishDate ? `Projected finish ${finishDate}` : 'Projection pending'}
        </p>
      </section>

      <button type="button" className="primary-button" onClick={openDashboard}>
        Open dashboard
      </button>
    </main>
  )
}

export default Popup
