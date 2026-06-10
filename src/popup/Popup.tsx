import { useEffect, useState } from 'react'
import '../App.css'
import {
  getUserSettings,
  saveDailyGoal,
  saveIdleTimeout,
  saveTimezone,
  saveTrackingEnabled,
} from '../settings'
import type { UserSettings } from '../storage'

const openDashboard = () => {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') })
    return
  }

  window.location.href = '/dashboard.html'
}

const secondsToMinutes = (seconds: number): number => Math.round(seconds / 60)

function Popup() {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState('30')
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState('5')
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  )

  useEffect(() => {
    let isMounted = true

    void getUserSettings().then((loadedSettings) => {
      if (!isMounted) {
        return
      }

      setSettings(loadedSettings)
      setDailyGoalMinutes(String(secondsToMinutes(loadedSettings.dailyGoalSeconds)))
      setIdleTimeoutMinutes(
        String(secondsToMinutes(loadedSettings.idleTimeoutSeconds)),
      )
      setTimezone(loadedSettings.timezone)
    })

    return () => {
      isMounted = false
    }
  }, [])

  const saveGoal = () => {
    void saveDailyGoal(Number(dailyGoalMinutes) * 60).then(setSettings)
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
          <div className="input-row">
            <input
              min="0"
              type="number"
              value={dailyGoalMinutes}
              onBlur={saveGoal}
              onChange={(event) => setDailyGoalMinutes(event.target.value)}
            />
            <span>min</span>
          </div>
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

      <button type="button" className="primary-button" onClick={openDashboard}>
        Open dashboard
      </button>
    </main>
  )
}

export default Popup
