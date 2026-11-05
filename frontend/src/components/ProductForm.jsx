import React, { useState } from 'react'

const COMMON_UNITS = ['kg', 'g', 'packet', 'litre', 'ml', 'piece', 'box', 'can', 'bottle']

export function ProductForm({ onAddProduct, isSubmitting }) {
  const [formData, setFormData] = useState({
    name: '',
    quantity: '',
    unit: 'kg',
    minimum_stock: '',
  })
  const [error, setError] = useState('')
  const [customUnit, setCustomUnit] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (error) setError('')
  }

  const handleUnitSelect = (e) => {
    const val = e.target.value
    if (val === '__custom__') {
      setCustomUnit(true)
      setFormData((prev) => ({ ...prev, unit: '' }))
    } else {
      setCustomUnit(false)
      setFormData((prev) => ({ ...prev, unit: val }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const name = formData.name.trim()
    const unit = formData.unit.trim()
    const quantity = parseFloat(formData.quantity)
    const minimum_stock = parseFloat(formData.minimum_stock || 0)

    if (!name) {
      setError('Please enter a product name.')
      return
    }
    if (isNaN(quantity) || quantity < 0) {
      setError('Quantity must be a valid number (0 or higher).')
      return
    }
    if (!unit) {
      setError('Please select or specify a unit of measurement.')
      return
    }
    if (isNaN(minimum_stock) || minimum_stock < 0) {
      setError('Minimum stock must be 0 or higher.')
      return
    }

    try {
      await onAddProduct({
        name,
        quantity,
        unit,
        minimum_stock,
      })
      // Reset form on success
      setFormData({
        name: '',
        quantity: '',
        unit: 'kg',
        minimum_stock: '',
      })
      setCustomUnit(false)
    } catch (err) {
      setError(err.message || 'Failed to add product.')
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Add New Product</h2>
        <p className="card-subtitle">Quickly register a new grocery item into inventory</p>
      </div>

      {error && (
        <div className="form-error-banner" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="product-form" noValidate>
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="product-name">Product Name *</label>
            <input
              id="product-name"
              name="name"
              type="text"
              required
              placeholder="e.g. Basmati Rice, Tata Salt"
              value={formData.name}
              onChange={handleChange}
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="product-quantity">Quantity in Stock *</label>
            <input
              id="product-quantity"
              name="quantity"
              type="number"
              step="any"
              min="0"
              required
              placeholder="e.g. 25"
              value={formData.quantity}
              onChange={handleChange}
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="product-unit">Unit *</label>
            {!customUnit ? (
              <select
                id="product-unit"
                value={formData.unit}
                onChange={handleUnitSelect}
                disabled={isSubmitting}
              >
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
                <option value="__custom__">+ Custom unit...</option>
              </select>
            ) : (
              <div className="input-with-button">
                <input
                  id="product-unit"
                  name="unit"
                  type="text"
                  required
                  placeholder="e.g. pouch, bundle"
                  value={formData.unit}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    setCustomUnit(false)
                    setFormData((prev) => ({ ...prev, unit: 'kg' }))
                  }}
                >
                  Presets
                </button>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="product-min-stock">Minimum Stock Alert Level</label>
            <input
              id="product-min-stock"
              name="minimum_stock"
              type="number"
              step="any"
              min="0"
              placeholder="e.g. 5 (default 0)"
              value={formData.minimum_stock}
              onChange={handleChange}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="spinner"></span>
                Adding Product...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Product to Inventory
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
