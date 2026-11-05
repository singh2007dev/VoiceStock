import React from 'react'

export function LowStockAlert({ lowStockProducts, onOpenQuantityModal }) {
  if (!lowStockProducts || lowStockProducts.length === 0) return null

  return (
    <div className="alert-card" role="alert" aria-live="polite">
      <div className="alert-header">
        <div className="alert-title-wrap">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="alert-icon">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <strong>Attention Needed: {lowStockProducts.length} item{lowStockProducts.length > 1 ? 's are' : ' is'} running low on stock!</strong>
        </div>
      </div>
      <div className="alert-list">
        {lowStockProducts.map((p) => (
          <div key={p.id} className="alert-item">
            <span className="alert-item-name">{p.name}</span>
            <span className="alert-item-quantities">
              Current: <strong>{p.quantity} {p.unit}</strong> (Min: {p.minimum_stock} {p.unit})
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline-alert"
              onClick={() => onOpenQuantityModal(p)}
            >
              Restock
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
