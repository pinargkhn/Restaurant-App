// src/context/CartContext.js
import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { db } from "../lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { submitOrder } from "../lib/orders"; // Sipariş oluşturma fonksiyonu

const CartContext = createContext();

export function useCart() {
  return useContext(CartContext);
}

// Helper: İki sepet state'ini karşılaştırır (items, total, note)
const areCartsEqual = (cartA, cartB) => {
    if (!cartA || !cartB) return false;
    // Notları karşılaştır
    if ((cartA.note || "") !== (cartB.note || "")) return false;
    // Toplamları karşılaştır
    if ((cartA.total || 0) !== (cartB.total || 0)) return false;
    // Items dizilerini karşılaştır (sıra önemli değil, id ve qty yeterli)
    const itemsA = cartA.items || [];
    const itemsB = cartB.items || [];
    if (itemsA.length !== itemsB.length) return false;
    const sortedA = [...itemsA].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    const sortedB = [...itemsB].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    return sortedA.every((itemA, index) => {
        const itemB = sortedB[index];
        // id ve qty kontrolü
        return itemA.id === itemB.id && (itemA.qty || 0) === (itemB.qty || 0);
    });
};


export function CartProvider({ children }) {
  const [cart, setCart] = useState({ items: [], total: 0, note: "" });
  const [params] = useSearchParams();
  const tableId = params.get("table");
  const firestoreUpdateTimeout = useRef(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);


  // --- Firestore Listener (State Karşılaştırması ile) ---
  useEffect(() => {
    if (!tableId) {
        setCart({ items: [], total: 0, note: "" });
        setIsInitialLoadComplete(true);
        return;
    };
    setIsInitialLoadComplete(false);
    console.log(`Firestore listener starting for: tables/${tableId}`);
    const tableRef = doc(db, "tables", tableId);

    const unsub = onSnapshot(tableRef, (snap) => {
      console.log("Firestore snapshot received.");
      const firestoreCartData = snap.data()?.cart || { items: [], total: 0, note: "" };
      console.log("Firestore data:", firestoreCartData);

      setCart(currentLocalCart => {
        if (areCartsEqual(firestoreCartData, currentLocalCart)) {
          // console.log("Firestore data matches local state exactly. No update needed.");
          return currentLocalCart;
        } else {
          console.log("Firestore data differs. Updating local state from Firestore.");
          // Firestore'dan gelen veriyi kullan (not dahil)
          return {
            items: firestoreCartData.items || [],
            total: firestoreCartData.total || 0,
            note: firestoreCartData.note || ""
          };
        }
      });
      if (!isInitialLoadComplete) setIsInitialLoadComplete(true);

    }, (error) => {
      console.error("🔥 Firestore listener error:", error);
      setIsInitialLoadComplete(true);
    });

    // Cleanup
    return () => {
      console.log(`Firestore listener stopping for: tables/${tableId}`);
      unsub();
      if (firestoreUpdateTimeout.current) clearTimeout(firestoreUpdateTimeout.current);
      setIsInitialLoadComplete(false);
    };
  }, [tableId]);

  // --- Helper: Calculate Total ---
  const calculateTotal = (items) => items.reduce((sum, item) => sum + (item.qty || 0) * (item.price || 0), 0);

  // --- Anlık Firestore Update Function ---
  const updateFirestoreImmediately = async (cartStateToSave) => {
    if (!tableId) return;
    if (firestoreUpdateTimeout.current) { clearTimeout(firestoreUpdateTimeout.current); firestoreUpdateTimeout.current = null; }
    try {
        console.log(`Writing IMMEDIATE to Firestore: tables/${tableId}`, cartStateToSave);
        const tableRef = doc(db, "tables", tableId);
        await setDoc(tableRef, { cart: cartStateToSave, updatedAt: serverTimestamp() }, { merge: true });
        console.log("Firestore IMMEDIATE update successful.");
    } catch (e) { console.error("❌ Firestore Cart IMMEDIATE update failed:", e); throw e; }
  };

  // --- Debounced Firestore Update Function ---
  const scheduleFirestoreUpdate = (cartStateToSave) => {
    if (firestoreUpdateTimeout.current) { clearTimeout(firestoreUpdateTimeout.current); }
    firestoreUpdateTimeout.current = setTimeout(async () => {
      if (!tableId) return;
      try {
        console.log(`Debounced Write to Firestore: tables/${tableId}`, cartStateToSave);
        const tableRef = doc(db, "tables", tableId);
        await setDoc(tableRef, { cart: cartStateToSave, updatedAt: serverTimestamp() }, { merge: true });
        console.log("Firestore update successful (debounced).");
      } catch (e) { console.error("❌ Firestore Cart update failed (debounced):", e); }
    }, 350);
  };

  // --- Cart API Functions ---

  const addItem = (product) => {
    let newState;
    setCart(prevCart => {
      const existingItem = prevCart.items.find((item) => item.id === product.id);
      let newItems;
      if (existingItem) {
        newItems = prevCart.items.map((item) =>
          item.id === product.id ? { ...item, qty: (item.qty || 0) + 1 } : item
        );
      } else {
        const priceAsNumber = Number(product.price) || 0;
        newItems = [...prevCart.items, { ...product, price: priceAsNumber, qty: 1 }];
      }
      const newTotal = calculateTotal(newItems);
      newState = { items: newItems, total: newTotal, note: prevCart.note };
      console.log("addItem - Optimistic local update:", newState);
      return newState;
    });
    if (newState) {
        scheduleFirestoreUpdate(newState);
    }
  };

  const updateItemQty = (itemId, change) => {
    let newState;
    setCart(prevCart => {
       let newItems = prevCart.items
         .map((item) =>
           item.id === itemId ? { ...item, qty: Math.max(0, (item.qty || 0) + change) } : item
         )
         .filter((item) => item.qty > 0);
       const newTotal = calculateTotal(newItems);
       newState = { items: newItems, total: newTotal, note: prevCart.note };
       console.log("updateItemQty - Optimistic local update:", newState);
       return newState;
    });
    if (newState) {
        scheduleFirestoreUpdate(newState);
    }
  };

  // Sepeti Temizle (Sadece Firestore'u tetikler)
  const clearCart = async () => {
    if (isProcessingAction || !tableId) return;
    console.log("clearCart called - Triggering Firestore update only.");
    setIsProcessingAction(true);
    const emptyState = { items: [], total: 0, note: "" };
    try {
        await updateFirestoreImmediately(emptyState);
    } catch (error) {
        alert("Sepet temizlenirken bir hata oluştu.");
        console.error("clearCart Firestore update error:", error);
    } finally {
        setIsProcessingAction(false);
    }
  };

  // Notu Güncelle (Optimistic UI + Debounced Firestore)
  const updateNote = (newNote) => {
      console.log("updateNote called:", newNote);
      let newState;
      setCart(prev => {
          newState = { ...prev, note: newNote };
          return newState;
      });
      if (newState) {
          scheduleFirestoreUpdate(newState);
      }
  };

  // Siparişi Gönder (Sepeti Temizlemez)
  const placeOrder = async () => {
    if (!tableId || cart.items.length === 0 || isProcessingAction) {
      console.warn("Order placement failed: Cart empty, no tableId, or processing.");
      return;
    }
    if (firestoreUpdateTimeout.current) { clearTimeout(firestoreUpdateTimeout.current); firestoreUpdateTimeout.current = null; }

    setIsProcessingAction(true);
    const cartToSubmit = { ...cart };
    console.log("placeOrder called, submitting cart:", cartToSubmit);

    try {
      // 1. Siparişi 'orders' koleksiyonuna gönder
      await submitOrder({
        tableId,
        items: cartToSubmit.items,
        total: cartToSubmit.total,
        note: cartToSubmit.note,
      });
      alert("✅ Siparişiniz başarıyla alındı ve mutfağa iletildi!");
      // 2. !!! Sepeti Temizleme Kodu Kaldırıldı !!!
      console.log("Order placed successfully. Cart remains unchanged in Firestore table document.");

    } catch (e) {
      console.error("❌ Order submission error:", e);
      alert("Siparişiniz gönderilemedi. Lütfen tekrar deneyin.");
    } finally {
       setIsProcessingAction(false); // İşlem bitince kilidi aç
    }
  };

  // Context değeri
  const value = useMemo(() => ({
    cart,
    tableId,
    addItem,
    updateItemQty,
    clearCart,
    placeOrder,
    updateNote,
    isProcessing: isProcessingAction || !isInitialLoadComplete
  }), [cart, tableId, isProcessingAction, isInitialLoadComplete]);

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}