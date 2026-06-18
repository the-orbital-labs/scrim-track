import { useEffect, useState } from 'react'
import '../App.css'
import { getActivityForDate } from '../activity'
import { downloadLocalDataExport } from '../dataExport'
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
import { getStorageValue, resetLocalData } from '../storage'
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
const idleTimeoutPresetMinutes = [1, 2, 5, 10] as const
const dashboardPath = 'dashboard.html'

const openDashboard = () => {
  if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
    chrome.runtime.openOptionsPage()
    return
  }

  const dashboardUrl =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL(dashboardPath)
      : `/${dashboardPath}`

  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url: dashboardUrl })
    return
  }

  window.open(dashboardUrl, '_blank', 'noopener,noreferrer')
}

const isValidDailyGoalMinutes = (value: number): boolean =>
  Number.isInteger(value) && value > 0 && value <= 24 * 60

const isValidIdleTimeoutMinutes = (value: number): boolean =>
  Number.isInteger(value) && value > 0 && value <= 60

const formatTimeoutMinutes = (minutes: number): string =>
  `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`

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
  const [dailyGoalStatusText, setDailyGoalStatusText] = useState<string | null>(null)
  const [idleTimeoutStatusText, setIdleTimeoutStatusText] = useState<string | null>(null)
  const [trackingStatusMessage, setTrackingStatusMessage] = useState<string | null>(null)
  const [pathError, setPathError] = useState<string | null>(null)
  const [pathSaveStatusText, setPathSaveStatusText] = useState<string | null>(null)
  const [exportStatusText, setExportStatusText] = useState<string | null>(null)
  const [resetStatusText, setResetStatusText] = useState<string | null>(null)

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
      setDailyGoalStatusText(null)
      setDailyGoalMinutes(
        settings ? String(secondsToMinutes(settings.dailyGoalSeconds)) : '30',
      )
      return
    }

    setDailyGoalError(null)
    setDailyGoalStatusText('Saving daily goal...')
    setDailyGoalMinutes(String(minutes))
    void saveDailyGoal(minutes * 60).then((nextSettings) => {
      setSettings(nextSettings)
      setDailyGoalMinutes(String(secondsToMinutes(nextSettings.dailyGoalSeconds)))
      setDailyGoalStatusText(
        `Saved ${formatActiveTime(nextSettings.dailyGoalSeconds)} daily goal.`,
      )
      refreshTodayActivity()
    }).catch(() => {
      setDailyGoalError('Enter 1-1440 minutes.')
      setDailyGoalStatusText(null)
    })
  }

  const saveCustomGoal = () => {
    saveGoalMinutes(Number(dailyGoalMinutes))
  }

  const saveIdleTimeoutMinutes = (minutes: number) => {
    if (!isValidIdleTimeoutMinutes(minutes)) {
      setIdleTimeoutStatusText('Choose a timeout between 1 and 60 minutes.')
      setIdleTimeoutMinutes(
        settings ? String(secondsToMinutes(settings.idleTimeoutSeconds)) : '2',
      )
      return
    }

    setIdleTimeoutStatusText('Saving idle timeout...')
    setIdleTimeoutMinutes(String(minutes))
    void saveIdleTimeout(minutes * 60).then((nextSettings) => {
      setSettings(nextSettings)
      setIdleTimeoutMinutes(String(secondsToMinutes(nextSettings.idleTimeoutSeconds)))
      setIdleTimeoutStatusText(
        `Saved ${formatTimeoutMinutes(minutes)} idle timeout.`,
      )
    })
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
      setPathSaveStatusText(null)
      setPathName(pathProgress?.pathName ?? '')
      return
    }

    setPathSaveStatusText('Saving path name...')
    void savePathName(pathName).then((nextPathProgress) => {
      syncPathProgress(nextPathProgress)
      setPathSaveStatusText('Saved path name.')
    })
  }

  const saveTotalEstimatedHoursValue = () => {
    const hours = Number(totalEstimatedHours)

    if (!isValidTotalEstimatedHours(hours)) {
      setPathError('Total estimate must be greater than 0 hours.')
      setPathSaveStatusText(null)
      setTotalEstimatedHours(String(pathProgress?.totalEstimatedHours ?? 1))
      return
    }

    setPathSaveStatusText('Saving total estimate...')
    void saveTotalEstimatedHours(hours).then((nextPathProgress) => {
      syncPathProgress(nextPathProgress)
      setPathSaveStatusText('Saved total estimate.')
    })
  }

  const saveProgressPercentageValue = () => {
    const percentage = Number(progressPercentage)

    if (!isValidProgressPercentage(percentage)) {
      setPathError('Progress must be between 0 and 100%.')
      setPathSaveStatusText(null)
      setProgressPercentage(String(pathProgress?.progressPercentage ?? 0))
      return
    }

    setPathSaveStatusText('Saving progress...')
    void saveProgressPercentage(percentage).then((nextPathProgress) => {
      syncPathProgress(nextPathProgress)
      setPathSaveStatusText('Saved progress.')
    })
  }

  const saveAverageWindowValue = (averageWindowDays: AverageWindowDays) => {
    if (!isValidAverageWindowDays(averageWindowDays)) {
      setPathError('Choose a valid average window.')
      setPathSaveStatusText(null)
      return
    }

    setPathSaveStatusText('Saving average window...')
    void saveAverageWindowDays(averageWindowDays).then((nextPathProgress) => {
      syncPathProgress(nextPathProgress)
      setPathSaveStatusText('Saved average window.')
    })
  }

  const toggleTracking = () => {
    if (!settings) {
      return
    }

    const nextTrackingEnabled = !settings.trackingEnabled

    setTrackingStatusMessage(
      nextTrackingEnabled ? 'Resuming tracking...' : 'Pausing tracking...',
    )
    void saveTrackingEnabled(nextTrackingEnabled).then((nextSettings) => {
      setSettings(nextSettings)
      setTrackingStatusMessage(
        nextSettings.trackingEnabled
          ? 'Tracking is on. Scrimba activity will be counted.'
          : 'Tracking is paused. No Scrimba activity will be counted.',
      )
      refreshTodayActivity()
    })
  }

  const resetData = (resetSettings: boolean) => {
    const message = resetSettings
      ? 'Delete all local activity, sessions, streaks, path settings, and app settings? This cannot be undone.'
      : 'Delete all local activity, sessions, and streaks while keeping your settings? This cannot be undone.'

    if (!window.confirm(message)) {
      return
    }

    setResetStatusText('Resetting local data...')
    void resetLocalData({ resetSettings }).then((nextStorage) => {
      setSettings(nextStorage.userSettings)
      setStreakStatus(nextStorage.streakStatus)
      setPathProgress(nextStorage.pathProgress)
      setPathName(nextStorage.pathProgress.pathName)
      setTotalEstimatedHours(String(nextStorage.pathProgress.totalEstimatedHours))
      setProgressPercentage(String(nextStorage.pathProgress.progressPercentage))
      setDailyGoalMinutes(String(secondsToMinutes(nextStorage.userSettings.dailyGoalSeconds)))
      setIdleTimeoutMinutes(
        String(secondsToMinutes(nextStorage.userSettings.idleTimeoutSeconds)),
      )
      setDailyGoalError(null)
      setDailyGoalStatusText(null)
      setIdleTimeoutStatusText(null)
      setTrackingStatusMessage(null)
      setPathError(null)
      setPathSaveStatusText(null)
      setResetStatusText(
        resetSettings
          ? 'All local data and settings were reset.'
          : 'Activity data, sessions, and streaks were reset. Settings were kept.',
      )
      refreshTodayActivity()
      refreshProjection()
    })
  }

  const exportData = () => {
    setExportStatusText('Preparing JSON export...')
    void downloadLocalDataExport().then((fileName) => {
      setExportStatusText(`Downloaded ${fileName}.`)
    }).catch(() => {
      setExportStatusText('Export failed. Try again.')
    })
  }

  const goalProgress = getGoalProgress(todayActivity, settings)
  const todayActiveTime = formatActiveTime(todayActivity?.activeSeconds ?? 0)
  const todayGoalTime =
    goalProgress.goalSeconds > 0 ? formatActiveTime(goalProgress.goalSeconds) : 'Not set'
  const currentDailyGoalText =
    settings && settings.dailyGoalSeconds > 0
      ? formatActiveTime(settings.dailyGoalSeconds)
      : 'Not set'
  const currentIdleTimeoutText =
    settings && settings.idleTimeoutSeconds > 0
      ? formatActiveTime(settings.idleTimeoutSeconds)
      : 'Not set'
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
  const currentStreak = streakStatus?.currentStreak ?? 0
  const currentStreakUnit = currentStreak === 1 ? 'day' : 'days'

  return (
    <main
      className={[
        'popup-shell',
        settings?.trackingEnabled === false ? 'is-tracking-paused' : '',
      ].filter(Boolean).join(' ')}
      aria-label="Scrimba Learning Tracker popup"
    >
      <header className="popup-header">
        <div>
          <p className="eyebrow">Scrimba tracker</p>
          <h1>{settings?.trackingEnabled === false ? 'Paused' : 'Learning status'}</h1>
        </div>
        <span
          className={[
            'status-pill',
            settings?.trackingEnabled === false ? 'is-paused' : 'is-active',
          ].filter(Boolean).join(' ')}
        >
          {settings?.trackingEnabled === false ? 'Paused' : 'Tracking on'}
        </span>
      </header>

      {settings?.trackingEnabled === false ? (
        <section className="paused-notice" aria-label="Tracking paused">
          <strong>Tracking is paused</strong>
          <span>No Scrimba activity will be counted until you turn tracking back on.</span>
        </section>
      ) : null}

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
        <article
          className={`popup-status-card popup-streak-card streak-state-${streakDisplay.tone}`}
          aria-label="Current streak"
        >
          <div className="popup-streak-header">
            <span>Current streak</span>
            <span
              aria-hidden="true"
              className={`streak-status-mark streak-status-mark-${streakDisplay.tone}`}
            />
          </div>
          <div className="popup-streak-value">
            <strong>{currentStreak}</strong>
            <span>{currentStreakUnit}</span>
          </div>
          <small>{streakDisplay.message}</small>
          <span className="popup-streak-best">{streakDisplay.longestLabel}</span>
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
            <span>
              Tracking
              <small>
                {settings?.trackingEnabled === false
                  ? 'Paused across Scrimba pages'
                  : 'Counting active Scrimba time'}
              </small>
            </span>
            <input
              type="checkbox"
              checked={settings?.trackingEnabled ?? true}
              onChange={toggleTracking}
            />
          </label>
          {trackingStatusMessage ? (
            <span className="save-status" role="status" aria-live="polite">
              {trackingStatusMessage}
            </span>
          ) : null}

          <label>
            <span>Daily goal</span>
            <span className="settings-current-value">
              Current goal <strong>{currentDailyGoalText}</strong>
            </span>
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
                    {minutes}m
                  </button>
                ))}
              </div>
              <div className="input-row goal-custom-row">
                <input
                  max="1440"
                  min="1"
                  step="1"
                  type="number"
                  value={dailyGoalMinutes}
                  onChange={(event) => setDailyGoalMinutes(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      saveCustomGoal()
                    }
                  }}
                />
                <span>min</span>
                <button type="button" className="secondary-button" onClick={saveCustomGoal}>
                  Save
                </button>
              </div>
            </div>
            {dailyGoalError ? <span className="error-text">{dailyGoalError}</span> : null}
            {dailyGoalStatusText ? (
              <span className="save-status" role="status" aria-live="polite">
                {dailyGoalStatusText}
              </span>
            ) : null}
          </label>

          <label>
            <span>Idle timeout</span>
            <span className="settings-current-value">
              Current timeout <strong>{currentIdleTimeoutText}</strong>
            </span>
            <p className="settings-help-text">
              Pauses tracking after Scrimba sits without mouse, keyboard, scroll, or touch activity.
            </p>
            <div className="goal-control" role="group" aria-label="Idle timeout presets">
              <div className="segmented-control idle-timeout-presets">
                {idleTimeoutPresetMinutes.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    className={
                      Number(idleTimeoutMinutes) === minutes ? 'is-selected' : undefined
                    }
                    onClick={() => saveIdleTimeoutMinutes(minutes)}
                  >
                    {minutes}m
                  </button>
                ))}
              </div>
            </div>
            {idleTimeoutStatusText ? (
              <span className="save-status" role="status" aria-live="polite">
                {idleTimeoutStatusText}
              </span>
            ) : null}
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
          <div className="path-setting-field">
            <label htmlFor="popup-path-name">Path name</label>
            <div className="path-setting-row">
              <input
                id="popup-path-name"
                type="text"
                value={pathName}
                onChange={(event) => setPathName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    savePathNameValue()
                  }
                }}
              />
              <button type="button" className="secondary-button" onClick={savePathNameValue}>
                Save
              </button>
            </div>
          </div>

          <div className="path-setting-field">
            <label htmlFor="popup-total-estimate">Total estimate</label>
            <div className="input-row path-setting-row">
              <input
                id="popup-total-estimate"
                min="0.1"
                step="0.5"
                type="number"
                value={totalEstimatedHours}
                onChange={(event) => setTotalEstimatedHours(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    saveTotalEstimatedHoursValue()
                  }
                }}
              />
              <span>hr</span>
              <button type="button" className="secondary-button" onClick={saveTotalEstimatedHoursValue}>
                Save
              </button>
            </div>
          </div>

          <div className="path-setting-field">
            <label htmlFor="popup-path-progress">Progress</label>
            <div className="input-row path-setting-row">
              <input
                id="popup-path-progress"
                max="100"
                min="0"
                step="1"
                type="number"
                value={progressPercentage}
                onChange={(event) => setProgressPercentage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    saveProgressPercentageValue()
                  }
                }}
              />
              <span>%</span>
              <button type="button" className="secondary-button" onClick={saveProgressPercentageValue}>
                Save
              </button>
            </div>
          </div>

          <div className="path-setting-field">
            <label htmlFor="popup-average-window">Average window</label>
            <select
              id="popup-average-window"
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
          </div>

          <p className="projection-line">
            Completed {completedHoursText}
          </p>
          {pathError ? <span className="error-text">{pathError}</span> : null}
          {pathSaveStatusText ? (
            <span className="save-status" role="status" aria-live="polite">
              {pathSaveStatusText}
            </span>
          ) : null}
        </section>

        <section className="settings-panel data-reset-panel" aria-label="Export and reset data">
          <span>Export and reset data</span>
          <p className="settings-help-text">
            Export downloads a JSON file with daily activity, sessions, settings, streaks, and path data.
          </p>
          <div className="export-action-row">
            <button type="button" className="secondary-button" onClick={exportData}>
              Download JSON
            </button>
            {exportStatusText ? (
              <span className="save-status" role="status" aria-live="polite">
                {exportStatusText}
              </span>
            ) : null}
          </div>
          <div className="reset-action-grid">
            <button
              type="button"
              className="secondary-button"
              onClick={() => resetData(false)}
            >
              Reset activity only
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => resetData(true)}
            >
              Reset all
            </button>
          </div>
          {resetStatusText ? (
            <span className="save-status" role="status" aria-live="polite">
              {resetStatusText}
            </span>
          ) : null}
        </section>
      </details>
    </main>
  )
}

export default Popup
