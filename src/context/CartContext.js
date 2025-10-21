// src/context/CartContext.js
import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { db } from "../lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { submitOrder } from "../lib/orders";

const CartContext = createContext();

export function useCart() {
  return useContext(CartContext);
}

// Helper to compare item arrays focusing on id and qty
const compareItems = (itemsA, itemsB) => {
    if (!itemsA || !itemsB || itemsA.length !== itemsB.length) {
        return false;
    }
    // Sort both arrays by id to ensure order doesn't affect comparison
    const sortedA = [...itemsA].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    const sortedB = [...itemsB].sort((a, b) => (a.id || '').localeCompare(b.id || ''));

    return sortedA.every((itemA, index) => {
        const itemB = sortedB[index];
        return itemA.id === itemB.id && itemA.qty === itemB.qty;
    });
};


export function CartProvider({ children }) {
  const [cart, setCart] = useState({ items: [], total: 0, note: "" });
  const [params] = useSearchParams();
  const tableId = params.get("table");

  // --- Firestore Listener (with Item Comparison) ---
  useEffect(() => {
    if (!tableId) {
        // Masa ID yoksa veya değiştiyse, yerel sepeti temizle
        setCart({ items: [], total: 0, note: "" });
        return;
    };

    console.log(`Firestore listener starting for: tables/${tableId}`);
    const tableRef = doc(db, "tables", tableId);

    const unsub = onSnapshot(tableRef, (snap) => {
      console.log("Firestore snapshot received.");
      const firestoreCartData = snap.data()?.cart || { items: [], total: 0, note: "" };
      console.log("Firestore data:", firestoreCartData);

      setCart(currentLocalCart => {
        console.log("Current local cart:", currentLocalCart);
        // Gelen veriyle yerel veriyi karşılaştır (sadece items ve total)
        const itemsAreIdentical = compareItems(firestoreCartData.items, currentLocalCart.items);
        const totalIsIdentical = (firestoreCartData.total || 0) === (currentLocalCart.total || 0);

        if (itemsAreIdentical && totalIsIdentical) {
          console.log("Firestore data matches local state (items & total). Keeping local note.");
          // Eğer items ve total aynıysa, sadece not farklı olabilir, yerel notu koru.
          // Bu, yarış durumunu ve gereksiz güncellemeyi önler.
          return currentLocalCart;
        } else {
          console.log("Firestore data differs. Updating local state, preserving local note.");
          // Farklıysa, Firestore verisini al ama yerel notu koru.
          return {
            items: firestoreCartData.items || [],
            total: firestoreCartData.total || 0,
            note: currentLocalCart.note // Notu her zaman yerelden koru
          };
        }
      });
    }, (error) => {
      console.error("🔥 Firestore listener error:", error);
    });

    return () => {
      console.log(`Firestore listener stopping for: tables/${tableId}`);
      unsub();
    };
  }, [tableId]); // Sadece tableId değiştiğinde çalışır

  // --- Helper: Calculate Total ---
  const calculateTotal = (items) =>
    items.reduce((sum, item) => sum + (item.qty || 0) * (item.price || 0), 0);

  // --- Firestore Update Function (Takes the full intended cart state) ---
  const updateFirestore = async (cartStateToSave) => {
    if (!tableId) return;
    try {
      console.log(`Writing to Firestore: tables/${tableId}`, cartStateToSave);
      const tableRef = doc(db, "tables", tableId);
      await setDoc(tableRef, {
        cart: { // Sadece cart nesnesini gönder
          items: cartStateToSave.items,
          total: cartStateToSave.total,
          note: cartStateToSave.note
        },
        updatedAt: serverTimestamp(),
      }, { merge: true }); // Merge true önemli
      console.log("Firestore update successful.");
    } catch (e) {
      console.error("❌ Firestore Cart update failed:", e);
    }
  };

  // --- Cart API Functions (Optimistic UI first, then async Firestore update) ---

  const addItem = (product) => {
    // 1. Calculate the next state based on the CURRENT cart state
    const currentCart = cart; // O anki state'i al
    const existingItem = currentCart.items.find((item) => item.id === product.id);
    let newItems;
    if (existingItem) {
      newItems = currentCart.items.map((item) =>
        item.id === product.id ? { ...item, qty: (item.qty || 0) + 1 } : item
      );
    } else {
      const priceAsNumber = Number(product.price) || 0;
      newItems = [...currentCart.items, { ...product, price: priceAsNumber, qty: 1 }];
    }
    const newTotal = calculateTotal(newItems);
    const newState = { items: newItems, total: newTotal, note: currentCart.note }; // Mevcut notu koru

    console.log("addItem - Optimistic local state:", newState);
    // 2. Optimistically update local state IMMEDIATELY
    setCart(newState);
    // 3. Asynchronously update Firestore with the calculated new state
    updateFirestore(newState);
  };

  const updateItemQty = (itemId, change) => {
    // 1. Calculate the next state based on the CURRENT cart state
    const currentCart = cart; // O anki state'i al
    let newItems = currentCart.items
      .map((item) =>
        item.id === itemId ? { ...item, qty: Math.max(0, (item.qty || 0) + change) } : item
      )
      .filter((item) => item.qty > 0); // Remove items with qty 0
    const newTotal = calculateTotal(newItems);
    const newState = { items: newItems, total: newTotal, note: currentCart.note }; // Mevcut notu koru

    console.log("updateItemQty - Optimistic local state:", newState);
    // 2. Optimistically update local state IMMEDIATELY
    setCart(newState);
    // 3. Asynchronously update Firestore with the calculated new state
    updateFirestore(newState);
  };

  const clearCart = () => {
    console.log("clearCart called.");
    const emptyState = { items: [], total: 0, note: "" };
    // 1. Optimistically update local state
    setCart(emptyState);
    // 2. Asynchronously update Firestore
    updateFirestore(emptyState);
  };

  // Note update only affects local state until the next Firestore update or placeOrder
  const updateNote = (newNote) => {
      console.log("updateNote called:", newNote);
      // Sadece yerel state'i güncelle
      setCart(prev => ({ ...prev, note: newNote }));
      // Firestore'u burada güncelleme, gereksiz yazmaları önlemek için.
      // Firestore, bir sonraki addItem/updateItemQty/clearCart/placeOrder ile güncellenecek.
  };

  // Place order sends the current state and clears afterward
  const placeOrder = async () => {
    if (!tableId || cart.items.length === 0) {
      console.warn("Order placement failed: Cart empty or no tableId.");
      return;
    }
    const cartToSubmit = cart; // O anki state'i gönder
    console.log("placeOrder called, cart to submit:", cartToSubmit);
    try {
      await submitOrder({
        tableId,
        items: cartToSubmit.items,
        total: cartToSubmit.total,
        note: cartToSubmit.note,
      });
      alert("✅ Siparişiniz başarıyla alındı ve mutfağa iletildi!");
      // Sipariş BAŞARILI olursa sepeti temizle
      clearCart(); // Bu hem yerel state'i hem Firestore'u temizler
    } catch (e) {
      console.error("❌ Order submission error:", e);
      alert("Siparişiniz gönderilemedi. Lütfen tekrar deneyin.");
      // Hata durumunda sepeti temizleme!
    }
  };

  // Context value
  const value = useMemo(() => ({
    cart,
    tableId,
    addItem,
    updateItemQty,
    clearCart,
    placeOrder,
    updateNote,
  }), [cart, tableId]); // Fonksiyonları bağımlılıktan çıkardık, çünkü artık useCallback kullanmıyorlar

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}