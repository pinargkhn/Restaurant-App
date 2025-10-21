// src/components/Cart.js
import React, { useState } from "react"; // 👈 useState EKLENDİ
import { useCart } from "../context/CartContext";
import './Cart.css';

export default function Cart() {
  const { cart, tableId, updateItemQty, clearCart, placeOrder, updateNote } = useCart();
  const { items, total, note } = cart;
  
  // 👈 MOBİL İÇİN YENİ STATE
  const [isExpanded, setIsExpanded] = useState(false);

  // Sepet boşsa gösterilecek minimal görünüm (Değişiklik yok)
  if (items.length === 0) {
    return (
      <div className="cart-container cart-empty">
        <p className="cart-empty-text">
          Sepetiniz boş.
        </p>
        {tableId && (
          <p className="cart-table-id">
            Masa: {tableId}
          </p>
        )}
      </div>
    );
  }

  return (
    // 👈 YENİ CSS SINIFI EKLENDİ
    <div className={`cart-container ${isExpanded ? 'is-expanded' : ''}`}>
      
      {/* Sepet Başlığı ve Ayrıntı Açma/Kapatma Butonu
        Bu bölüm .cart-footer'ın ÜSTÜNE taşındı 
      */}
      <div className="cart-header">
        <h3 className="cart-title">🛒 Sipariş Sepetiniz</h3>
        {/* 👈 YENİ AÇ/KAPAT BUTONU */}
        <button 
          className="cart-toggle"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? 'Ayrıntıları Gizle' : 'Ayrıntıları Gör'}
          <span>{items.length} ürün</span>
        </button>
      </div>

      {/* ------- KATLANABİLİR ALAN BAŞLANGICI ------- */}
      {/* Bu alan (items-list ve note-section) 
        mobilde gizlenecek, sadece 'is-expanded' durumunda görünecek 
      */}
      <div className="cart-collapsible-area">
        {/* Sepet İçeriği */}
        <div className="cart-items-list">
          {items.map((item) => (
            <div key={item.id} className="cart-item">
              <span className="cart-item-name">{item.name}</span>
              <div className="cart-item-controls">
                <span className="cart-item-price">
                  {item.price} ₺
                </span>
                <button
                  onClick={() => updateItemQty(item.id, -1)}
                  className="qty-button"
                >
                  −
                </button>
                <span className="qty-count">{item.qty}</span>
                <button
                  onClick={() => updateItemQty(item.id, 1)}
                  className="qty-button"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
        
        {/* Sipariş Notu */}
        <div className="cart-note-section">
            <label htmlFor="order-note" className="form-label">
                Sipariş Notu (Opsiyonel)
            </label>
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
      {/* ------- KATLANABİLİR ALAN BİTİŞİ ------- */}


      {/* Alt Bilgi ve Butonlar (Hep görünür) */}
      <div className="cart-footer">
        <div className="cart-total">
          <span>Toplam:</span>
          <span>{total.toFixed(2)} ₺</span>
        </div>
        <button
          onClick={placeOrder}
          className="button button-primary"
        >
          Siparişi Onayla ve Gönder
        </button>
        <button
          onClick={clearCart}
          className="button button-danger-outline"
        >
          Sepeti Temizle
        </button>
      </div>
    </div>
  );
}