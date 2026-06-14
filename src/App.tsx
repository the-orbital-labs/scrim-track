import { useEffect, useState } from 'react'
import './App.css'
import { getActivityForDate } from './activity'
import { formatMinutes, getGoalProgress, secondsToMinutes } from './goalProgress'
import { getUserSettings, saveDailyGoal } from './settings'
import { getStorageValue } from './storage'
import type { DailyActivity, StreakStatus, UserSettings } from './storage'
import { getStreakDisplayState } from './streakDisplay'

const dailyGoalPresetMinutes = [15, 30, 45, 60] as const

const isValidDailyGoalMinutes = (value: number): boolean =>
  Number.isInteger(value) && value > 0 && value <= 24 * 60

function App() {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [todayActivity, setTodayActivity] = useState<DailyActivity | null>(null)
  const [streakStatus, setStreakStatus] = useState<StreakStatus | null>(null)
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState('30')
  const [dailyGoalError, setDailyGoalError] = useState<string | null>(null)

  const refreshTodayActivity = () => {
    void Promise.all([
      getActivityForDate(new Date()),
      getStorageValue('streakStatus'),
    ]).then(([activity, streak]) => {
      setTodayActivity(activity)
      setStreakStatus(streak)
    })
  }

  useEffect(() => {
    let isMounted = true
    const refreshIntervalId = window.setInterval(refreshTodayActivity, 5_000)

    void Promise.all([
      getUserSettings(),
      getActivityForDate(new Date()),
      getStorageValue('streakStatus'),
    ]).then(
      ([loadedSettings, loadedTodayActivity, loadedStreakStatus]) => {
        if (!isMounted) {
          return
        }

        setSettings(loadedSettings)
        setTodayActivity(loadedTodayActivity)
        setStreakStatus(loadedStreakStatus)
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
      ? `${formatMinutes(goalProgress.activeSeconds)} / ${formatMinutes(goalProgress.goalSeconds)}`
      : 'Not set'
  const streakDisplay = getStreakDisplayState(streakStatus, goalProgress)

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
          <strong>{formatMinutes(todayActivity?.activeSeconds ?? 0)}</strong>
          <span>Active Scrimba time</span>
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
              : `${formatMinutes(goalProgress.remainingSeconds)} remaining`}
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
