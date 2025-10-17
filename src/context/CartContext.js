import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { db } from "../lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { submitOrder } from "../lib/orders";

// Context oluştur
const CartContext = createContext();

// Hook oluştur
export function useCart() {
  return useContext(CartContext);
}

// Provider Componenti
export function CartProvider({ children }) {
  // Sepet yapısı: { items: [], total: 0, note: "" }
  const [cart, setCart] = useState({ items: [], total: 0, note: "" }); // 🔹 NOTE EKLENDİ
  const [params] = useSearchParams();
  const tableId = params.get("table");

  // ---------------- FIRESTORE SYNC (READ) ----------------
  // Firestore'daki masanın cart alanını dinler
  useEffect(() => {
    if (!tableId) return;

    const tableRef = doc(db, "tables", tableId);
    const unsub = onSnapshot(tableRef, (snap) => {
      const data = snap.data()?.cart || { items: [], total: 0, note: "" }; // 🔹 NOTE OKUNDU
      // Sadece cart.items ve cart.total değiştiyse güncelle, note'a dokunma
      setCart(prev => ({
          ...prev,
          items: data.items,
          total: data.total,
          // note: data.note, // NOTE'u buradan okumayıp local state'te tutuyoruz ki,
                            // kullanıcının yazdığı not anlık olarak silinmesin.
      }));
    });

    return () => unsub();
  }, [tableId]);

  // ---------------- LOCAL HELPER FUNCTIONS ----------------

  const calculateTotal = (items) =>
    items.reduce((sum, item) => sum + item.qty * item.price, 0);

  const updateFirestore = async (newItems, newTotal) => {
    if (!tableId) return;
    try {
      const tableRef = doc(db, "tables", tableId);
      // NOTE'u Firestore'a kaydederken, mevcut local state'ten alıyoruz.
      await setDoc(tableRef, {
        cart: {
          items: newItems,
          total: newTotal,
          note: cart.note, // 🔹 NOTE KAYDEDİLDİ
        },
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.error("❌ Firestore Cart güncellenemedi:", e);
    }
  };

  // ---------------- PUBLIC API FUNCTIONS ----------------

  const addItem = (product) => {
    const existingItem = cart.items.find((item) => item.id === product.id);
    let newItems;

    if (existingItem) {
      newItems = cart.items.map((item) =>
        item.id === product.id
          ? { ...item, qty: item.qty + 1 }
          : item
      );
    } else {
      newItems = [...cart.items, { ...product, qty: 1 }];
    }

    const newTotal = calculateTotal(newItems);
    setCart({ ...cart, items: newItems, total: newTotal });
    updateFirestore(newItems, newTotal);
  };

  const updateItemQty = (itemId, change) => {
    let newItems = cart.items
      .map((item) =>
        item.id === itemId
          ? { ...item, qty: Math.max(0, item.qty + change) }
          : item
      )
      .filter((item) => item.qty > 0);

    const newTotal = calculateTotal(newItems);
    setCart({ ...cart, items: newItems, total: newTotal });
    updateFirestore(newItems, newTotal);
  };

  const clearCart = () => {
    setCart({ items: [], total: 0, note: "" }); // 🔹 NOTE TEMİZLENDİ
    updateFirestore([], 0);
  };
  
  // 🔹 YENİ FONKSİYON: Sipariş notunu güncelle
  const updateNote = (newNote) => {
      setCart(prev => ({ ...prev, note: newNote }));
      // Firestore'a anlık kaydetmiyoruz, sadece sepete eklerken veya sipariş gönderilirken kaydedeceğiz.
      // updateFirestore(cart.items, cart.total); // Anlık kaydı yoruma aldık
  };

  // Sipariş gönderme (NOTE'u gönderir)
  const placeOrder = async () => {
    if (!tableId || cart.items.length === 0) return;

    try {
      await submitOrder({
        tableId,
        items: cart.items,
        total: cart.total,
        note: cart.note, // 🔹 NOTE SUBMIT EDİLDİ
      });
      clearCart();
      alert("✅ Siparişiniz başarıyla alındı ve mutfağa iletildi!");
    } catch (e) {
      console.error("❌ Sipariş gönderme hatası:", e);
      alert("Siparişiniz gönderilemedi. Lütfen tekrar deneyin.");
    }
  };

  const value = useMemo(() => ({
    cart,
    tableId,
    addItem,
    updateItemQty,
    clearCart,
    placeOrder,
    updateNote, // 🔹 YENİ FONKSİYON EKLENDİ
  }), [cart, tableId]);

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}