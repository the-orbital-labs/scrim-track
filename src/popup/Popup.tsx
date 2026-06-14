import { useEffect, useState } from 'react'
import '../App.css'
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
import type { AverageWindowDays, PathProgress, UserSettings } from '../storage'

const dailyGoalPresetMinutes = [15, 30, 45, 60] as const

const openDashboard = () => {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') })
    return
  }

  window.location.href = '/dashboard.html'
}

const secondsToMinutes = (seconds: number): number => Math.round(seconds / 60)

const isValidDailyGoalMinutes = (value: number): boolean =>
  Number.isInteger(value) && value > 0 && value <= 24 * 60

function Popup() {
  const [settings, setSettings] = useState<UserSettings | null>(null)
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

  useEffect(() => {
    let isMounted = true

    void Promise.all([getUserSettings(), getPathProgress(), getPathProjection()]).then(
      ([loadedSettings, loadedPathProgress, projection]) => {
        if (!isMounted) {
          return
        }

        setSettings(loadedSettings)
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
    void saveDailyGoal(minutes * 60).then(setSettings).catch(() => {
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
