// src/components/Cart.js
import React, { useState } from "react";
import { useCart } from "../context/CartContext";
import './Cart.css';

export default function Cart() {
  const { cart, tableId, updateItemQty, clearCart, placeOrder, updateNote, isProcessingAction} = useCart();
  const { items, total, note } = cart;
  const [isExpanded, setIsExpanded] = useState(false);

  if (items.length === 0) {
    return (
      <div className="cart-container cart-empty">
        <p className="cart-empty-text">Sepetiniz boş.</p>
        {tableId && <p className="cart-table-id">Masa: {tableId}</p>}
      </div>
    );
  }

  // Güvenlik için toplamı tekrar hesapla (isteğe bağlı ama önerilir)
  const calculatedTotal = items.reduce((sum, item) => sum + (item.qty || 0) * (item.price || 0), 0);
  const displayTotal = total !== calculatedTotal ? calculatedTotal : total; // State'deki total ile farklıysa hesaplananı göster

  return (
    <div className={`cart-container ${isExpanded ? 'is-expanded' : ''}`}>
      <div className="cart-header">
        <h3 className="cart-title">🛒 Sipariş Sepetiniz</h3>
        <button
          className="cart-toggle"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? 'Ayrıntıları Gizle' : 'Ayrıntıları Gör'}
          {/* 👈 DÜZELTME: Ürün sayısı arasına boşluk eklendi */}
          <span>{items.length} ürün</span>
        </button>
      </div>

      <div className="cart-collapsible-area">
        <div className="cart-items-list">
          {items.map((item) => (
            <div key={item.id} className="cart-item">
              <span className="cart-item-name">{item.name}</span>
              <div className="cart-item-controls">
                <span className="cart-item-price">{item.price} ₺</span>
                <button onClick={() => updateItemQty(item.id, -1)} className="qty-button">−</button>
                <span className="qty-count">{item.qty}</span>
                <button onClick={() => updateItemQty(item.id, 1)} className="qty-button">+</button>
              </div>
            </div>
          ))}
        </div>
        <div className="cart-note-section">
            <label htmlFor="order-note" className="form-label">Sipariş Notu (Opsiyonel)</label>
            <textarea
                id="order-note"
                value={note}
                onChange={(e) => updateNote(e.target.value)}
                rows="3"
                placeholder="Ekstra sos, alerjen bilgisi vb."
                className="form-textarea"
            />
        </div>
      </div>

      <div className="cart-footer">
        <div className="cart-total">
          <span>Toplam:</span>
          {/* 👈 GÜNCELLEME: displayTotal kullanıldı */}
          <span>{displayTotal.toFixed(2)} ₺</span>
        </div>
        <button onClick={placeOrder} className="button button-primary" disabled={items.length === 0}>
          Siparişi Onayla ve Gönder
        </button>
        <button onClick={clearCart} className="button button-danger-outline" disabled={items.length === 0}>
          Sepeti Temizle
        </button>
      </div>
    </div>
  );
}