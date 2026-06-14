import { useEffect, useState } from 'react'
import './App.css'
import { getActivityForDate } from './activity'
import { getUserSettings, saveDailyGoal } from './settings'
import type { DailyActivity, UserSettings } from './storage'

const dailyGoalPresetMinutes = [15, 30, 45, 60] as const

const secondsToMinutes = (seconds: number): number => Math.round(seconds / 60)

const formatMinutes = (seconds: number): string => `${secondsToMinutes(seconds)}m`

const isValidDailyGoalMinutes = (value: number): boolean =>
  Number.isInteger(value) && value > 0 && value <= 24 * 60

function App() {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [todayActivity, setTodayActivity] = useState<DailyActivity | null>(null)
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState('30')
  const [dailyGoalError, setDailyGoalError] = useState<string | null>(null)

  const refreshTodayActivity = () => {
    void getActivityForDate(new Date()).then(setTodayActivity)
  }

  useEffect(() => {
    let isMounted = true

    void Promise.all([getUserSettings(), getActivityForDate(new Date())]).then(
      ([loadedSettings, loadedTodayActivity]) => {
        if (!isMounted) {
          return
        }

        setSettings(loadedSettings)
        setTodayActivity(loadedTodayActivity)
        setDailyGoalMinutes(
          String(secondsToMinutes(loadedSettings.dailyGoalSeconds)),
        )
      },
    )

    return () => {
      isMounted = false
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

  const currentGoalSeconds =
    todayActivity?.goalSeconds ?? settings?.dailyGoalSeconds ?? 0

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
          <strong>0 days</strong>
          <span>Current learning streak</span>
        </article>
        <article>
          <span className="metric-label">Goal</span>
          <strong>{currentGoalSeconds > 0 ? formatMinutes(currentGoalSeconds) : 'Not set'}</strong>
          <span>{todayActivity?.goalCompleted ? 'Completed today' : 'Daily learning target'}</span>
        </article>
      </section>

      <section className="panel">
        <h2>Daily Goal</h2>
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
