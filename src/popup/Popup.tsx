import '../App.css'

const openDashboard = () => {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') })
    return
  }

  window.location.href = '/dashboard.html'
}

function Popup() {
  return (
    <main className="popup-shell" aria-label="Scrimba Learning Tracker popup">
      <div>
        <p className="eyebrow">Scrimba tracker</p>
        <h1>Ready to track</h1>
        <p className="muted">
          This extension is wired for Scrimba pages and stores data locally.
        </p>
      </div>

      <button type="button" className="primary-button" onClick={openDashboard}>
        Open dashboard
      </button>
    </main>
  )
}

export default Popup
