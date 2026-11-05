import React from 'react'

export function SummaryCards({ products, lowStockProducts, onFilterLowStock, isFilterActive }) {
  const totalProducts = products.length
  // Total quantity across all products
  const totalQuantity = products.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
  const lowStockCount = lowStockProducts.length

  return (
    <div className="summary-grid">
      <div className="metric-card">
        <div className="metric-icon-wrap icon-blue">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m7.5 4.27 9 5.15"/>
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
          </svg>
        </div>
        <div className="metric-content">
          <span className="metric-label">Total Products</span>
          <span className="metric-value">{totalProducts}</span>
          <span className="metric-hint">Unique inventory items</span>
        </div>
      </div>

      <div className="metric-card">
        <div className="metric-icon-wrap icon-emerald">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1"/>
            <path d="M18 8h4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-4"/>
            <circle cx="8" cy="12" r="2"/>
          </svg>
        </div>
        <div className="metric-content">
          <span className="metric-label">Total Stock Units</span>
          <span className="metric-value">
            {Number.isInteger(totalQuantity) ? totalQuantity : totalQuantity.toFixed(2)}
          </span>
          <span className="metric-hint">Cumulative item quantity</span>
        </div>
      </div>

      <div
        className={`metric-card metric-clickable ${lowStockCount > 0 ? 'metric-alert' : ''} ${isFilterActive ? 'metric-selected' : ''}`}
        onClick={onFilterLowStock}
        role="button"
        tabIndex="0"
        title="Click to filter low stock items"
      >
        <div className="metric-icon-wrap icon-amber">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div className="metric-content">
          <span className="metric-label">Low-Stock Alert</span>
          <span className="metric-value">{lowStockCount}</span>
          <span className="metric-hint">
            {isFilterActive ? 'Showing low-stock (click to show all)' : 'Items at or below minimum threshold'}
          </span>
        </div>
      </div>
    </div>
  )
}
