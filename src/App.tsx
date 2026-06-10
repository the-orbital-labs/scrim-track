import './App.css'

function App() {
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
          <strong>0m</strong>
          <span>Active Scrimba time</span>
        </article>
        <article>
          <span className="metric-label">Streak</span>
          <strong>0 days</strong>
          <span>Current learning streak</span>
        </article>
        <article>
          <span className="metric-label">Goal</span>
          <strong>Not set</strong>
          <span>Daily learning target</span>
        </article>
      </section>

      <section className="panel">
        <h2>Milestone 1.1</h2>
        <ul className="check-list">
          <li>Manifest V3 extension structure</li>
          <li>Popup entry connected to the toolbar action</li>
          <li>Background service worker entry</li>
          <li>Scrimba-only content script match patterns</li>
          <li>Dashboard page entry for future tracker views</li>
        </ul>
      </section>
    </main>
  )
}

export default App
