import React from 'react'

export function Header({ isConnected }) {
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m7.5 4.27 9 5.15"/>
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
            <path d="m3.3 7 8.7 5 8.7-5"/>
            <path d="M12 22V12"/>
          </svg>
        </div>
        <div>
          <h1 className="brand-title">VoiceStock</h1>
          <p className="brand-subtitle">Kirana Inventory Management System</p>
        </div>
      </div>

      <div className="header-status">
        <span className={`status-pill ${isConnected ? 'status-online' : 'status-offline'}`}>
          <span className="status-dot"></span>
          {isConnected ? 'Backend Online' : 'Connecting to API...'}
        </span>
      </div>
    </header>
  )
}
