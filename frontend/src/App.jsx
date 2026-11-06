import React, { useState, useEffect, useCallback } from 'react'
import { api } from './services/api'
import { Header } from './components/Header'
import { SummaryCards } from './components/SummaryCards'
import { LowStockAlert } from './components/LowStockAlert'
import { VoiceRecorder } from './components/VoiceRecorder'
import { ProductForm } from './components/ProductForm'
import { ProductTable } from './components/ProductTable'
import { EditQuantityModal } from './components/EditQuantityModal'
import './App.css'

export default function App() {
  const [products, setProducts] = useState([])
  const [lowStockProducts, setLowStockProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [globalError, setGlobalError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Table controls
  const [searchTerm, setSearchTerm] = useState('')
  const [isFilterActive, setIsFilterActive] = useState(false)

  // Modal control
  const [activeProductForEdit, setActiveProductForEdit] = useState(null)

  // Show a toast/banner message that auto-clears
  const notifySuccess = (msg) => {
    setSuccessMessage(msg)
    setTimeout(() => {
      setSuccessMessage((prev) => (prev === msg ? '' : prev))
    }, 4000)
  }

  // Load inventory from FastAPI
  const loadInventory = useCallback(async () => {
    try {
      const [allProds, lowStock] = await Promise.all([
        api.getProducts(),
        api.getLowStock(),
      ])
      setProducts(allProds)
      setLowStockProducts(lowStock)
      setIsConnected(true)
      setGlobalError('')
    } catch (err) {
      setIsConnected(false)
      setGlobalError(err.message || 'Failed to load inventory data.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInventory()
  }, [loadInventory])

  // Handle Add Product
  const handleAddProduct = async (productData) => {
    setIsSubmitting(true)
    try {
      const newProduct = await api.addProduct(productData)
      await loadInventory()
      notifySuccess(`"${newProduct.name}" successfully added to inventory!`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Update Quantity
  const handleUpdateQuantity = async (productId, newQuantity) => {
    setIsUpdating(true)
    try {
      const updated = await api.updateQuantity(productId, newQuantity)
      await loadInventory()
      notifySuccess(`Updated "${updated.name}" stock quantity to ${updated.quantity} ${updated.unit}.`)
    } finally {
      setIsUpdating(false)
    }
  }

  // Handle Delete Product
  const handleDeleteProduct = async (productId) => {
    try {
      const res = await api.deleteProduct(productId)
      await loadInventory()
      notifySuccess(res.message || 'Product deleted successfully.')
    } catch (err) {
      setGlobalError(err.message || 'Failed to delete product.')
    }
  }

  return (
    <div className="app-container">
      <Header isConnected={isConnected} />

      <main className="main-content">
        {globalError && (
          <div className="banner banner-error" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div className="banner-content">
              <strong>Connection Error:</strong> {globalError}
            </div>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={loadInventory}
            >
              Retry
            </button>
          </div>
        )}

        {successMessage && (
          <div className="banner banner-success" role="status">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <div className="banner-content">{successMessage}</div>
            <button
              type="button"
              className="banner-close"
              onClick={() => setSuccessMessage('')}
            >
              ✕
            </button>
          </div>
        )}

        {/* Dashboard Metrics */}
        <SummaryCards
          products={products}
          lowStockProducts={lowStockProducts}
          isFilterActive={isFilterActive}
          onFilterLowStock={() => setIsFilterActive(!isFilterActive)}
        />

        {/* Low-stock Warning Bar */}
        <LowStockAlert
          lowStockProducts={lowStockProducts}
          onOpenQuantityModal={(prod) => setActiveProductForEdit(prod)}
        />

        {/* Voice Assistant Recorder */}
        <VoiceRecorder
          onInventoryUpdated={loadInventory}
          onCommandExecuted={(res) => {
            if (res && res.message && res.success) {
              notifySuccess(res.message)
            }
            loadInventory()
          }}
        />

        {/* Add Product Form */}
        <ProductForm
          onAddProduct={handleAddProduct}
          isSubmitting={isSubmitting}
        />

        {/* Inventory Stock Table */}
        <ProductTable
          products={products}
          isLoading={isLoading}
          onOpenQuantityModal={(prod) => setActiveProductForEdit(prod)}
          onDeleteProduct={handleDeleteProduct}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          isFilterActive={isFilterActive}
          setIsFilterActive={setIsFilterActive}
        />
      </main>

      {/* Quick Edit Quantity Modal */}
      {activeProductForEdit && (
        <EditQuantityModal
          product={activeProductForEdit}
          onClose={() => setActiveProductForEdit(null)}
          onUpdateQuantity={handleUpdateQuantity}
          isUpdating={isUpdating}
        />
      )}

      <footer className="app-footer">
        <p>VoiceStock • Voice-Powered Kirana Store Inventory • FastAPI + React + Vite</p>
      </footer>
    </div>
  )
}
