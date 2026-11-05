import React, { useState } from 'react'

export function ProductTable({
  products,
  isLoading,
  onOpenQuantityModal,
  onDeleteProduct,
  searchTerm,
  setSearchTerm,
  isFilterActive,
  setIsFilterActive,
}) {
  const [deletingId, setDeletingId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const filteredProducts = products.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = isFilterActive ? item.is_low_stock : true
    return matchesSearch && matchesFilter
  })

  const handleDelete = async (id) => {
    setDeletingId(id)
    try {
      await onDeleteProduct(id)
      setConfirmDeleteId(null)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="card table-card">
      <div className="table-toolbar">
        <div className="toolbar-header">
          <h2 className="card-title">Inventory Stocklist</h2>
          <span className="badge-count">{filteredProducts.length} items</span>
        </div>

        <div className="toolbar-controls">
          <div className="search-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="search-icon">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search products by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search products"
            />
            {searchTerm && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="button"
            className={`btn btn-sm ${isFilterActive ? 'btn-active-filter' : 'btn-outline'}`}
            onClick={() => setIsFilterActive(!isFilterActive)}
          >
            {isFilterActive ? '✓ Low Stock Filter Active' : 'Filter Low Stock'}
          </button>
        </div>
      </div>

      <div
        tabIndex="0"
        role="region"
        aria-label="Kirana inventory stocklist"
        className="table-wrapper"
      >
        <table className="inventory-table">
          <caption className="sr-only">Inventory stock list showing product quantities and alerts</caption>
          <thead>
            <tr>
              <th scope="col" className="col-id">#</th>
              <th scope="col" className="col-name">Product Name</th>
              <th scope="col" className="col-qty">Quantity</th>
              <th scope="col" className="col-unit">Unit</th>
              <th scope="col" className="col-min">Min. Threshold</th>
              <th scope="col" className="col-status">Stock Status</th>
              <th scope="col" className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && products.length === 0 ? (
              <tr>
                <td colSpan="7" className="text-center py-8">
                  <div className="loading-state">
                    <span className="spinner"></span>
                    <span>Loading inventory items...</span>
                  </div>
                </td>
              </tr>
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan="7" className="text-center py-8 empty-row">
                  <div className="empty-state">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="m7.5 4.27 9 5.15"/>
                      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
                    </svg>
                    <p className="empty-title">No products found</p>
                    <p className="empty-subtitle">
                      {searchTerm
                        ? `No items match "${searchTerm}"`
                        : isFilterActive
                        ? 'All products are currently above their minimum threshold!'
                        : 'Your inventory is empty. Add your first product using the form above.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredProducts.map((product) => (
                <tr
                  key={product.id}
                  className={product.is_low_stock ? 'row-low-stock' : ''}
                >
                  <td className="col-id cell-muted">{product.id}</td>
                  <td className="col-name">
                    <strong className="product-title">{product.name}</strong>
                  </td>
                  <td className="col-qty">
                    <span className="qty-value">{product.quantity}</span>
                  </td>
                  <td className="col-unit">
                    <span className="unit-badge">{product.unit}</span>
                  </td>
                  <td className="col-min cell-muted">
                    {product.minimum_stock} {product.unit}
                  </td>
                  <td className="col-status">
                    {product.is_low_stock ? (
                      <span className="badge badge-low-stock">
                        <span className="status-dot dot-warning"></span>
                        Low Stock
                      </span>
                    ) : (
                      <span className="badge badge-in-stock">
                        <span className="status-dot dot-success"></span>
                        In Stock
                      </span>
                    )}
                  </td>
                  <td className="col-actions">
                    <div className="action-buttons">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={() => onOpenQuantityModal(product)}
                        title="Update stock quantity"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9"/>
                          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                        </svg>
                        Update Qty
                      </button>

                      {confirmDeleteId === product.id ? (
                        <div className="confirm-delete-group">
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDelete(product.id)}
                            disabled={deletingId === product.id}
                          >
                            {deletingId === product.id ? 'Deleting...' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={deletingId === product.id}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-icon-danger"
                          onClick={() => setConfirmDeleteId(product.id)}
                          title="Delete product"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18"/>
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
