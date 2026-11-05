import React, { useState } from 'react'

export function EditQuantityModal({ product, onClose, onUpdateQuantity, isUpdating }) {
  const [newQuantity, setNewQuantity] = useState(product ? String(product.quantity) : '0')
  const [error, setError] = useState('')

  if (!product) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const qty = parseFloat(newQuantity)
    if (isNaN(qty) || qty < 0) {
      setError('Please enter a valid non-negative quantity.')
      return
    }

    try {
      await onUpdateQuantity(product.id, qty)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to update stock quantity.')
    }
  }

  // Quick adjust buttons (+1, +5, -1, -5)
  const adjustBy = (delta) => {
    const current = parseFloat(newQuantity) || 0
    const next = Math.max(0, current + delta)
    setNewQuantity(String(next))
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">Update Stock Quantity</h3>
            <p className="modal-subtitle">
              Adjust available inventory for <strong>{product.name}</strong>
            </p>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>

        {error && (
          <div className="form-error-banner" role="alert">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="quick-adjust-bar">
              <span className="quick-label">Quick Adjust:</span>
              <div className="quick-btn-group">
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => adjustBy(-5)}>-5</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => adjustBy(-1)}>-1</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => adjustBy(1)}>+1</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => adjustBy(5)}>+5</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => adjustBy(10)}>+10</button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="modal-qty-input">New Quantity ({product.unit}) *</label>
              <input
                id="modal-qty-input"
                type="number"
                step="any"
                min="0"
                required
                value={newQuantity}
                onChange={(e) => {
                  setNewQuantity(e.target.value)
                  if (error) setError('')
                }}
                disabled={isUpdating}
                autoFocus
              />
            </div>

            <div className="modal-info-box">
              <span>Threshold: <strong>{product.minimum_stock} {product.unit}</strong></span>
              {parseFloat(newQuantity) <= product.minimum_stock && (
                <span className="tag-warning">⚠️ Will trigger low-stock warning</span>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isUpdating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isUpdating}
            >
              {isUpdating ? 'Saving...' : 'Save New Quantity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
