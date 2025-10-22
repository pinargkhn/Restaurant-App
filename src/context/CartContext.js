// src/context/CartContext.js
import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from "react"; // useRef eklendi
import { useSearchParams } from "react-router-dom";
import { db } from "../lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { submitOrder } from "../lib/orders";

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
        return itemA.id === itemB.id && itemA.qty === itemB.qty;
    });
};


export function CartProvider({ children }) {
  const [cart, setCart] = useState({ items: [], total: 0, note: "" });
  const [params] = useSearchParams();
  const tableId = params.get("table");
  // Debounce için timeout referansı
  const firestoreUpdateTimeout = useRef(null);

  // --- Firestore Listener (State Karşılaştırması ile) ---
  useEffect(() => {
    if (!tableId) {
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
        // Firestore'dan gelen veri ile mevcut yerel state'i TAMAMEN karşılaştır
        if (areCartsEqual(firestoreCartData, currentLocalCart)) {
          console.log("Firestore data matches local state exactly. No update needed.");
          return currentLocalCart; // Veri aynıysa, state'i değiştirme (gereksiz render önle)
        } else {
          console.log("Firestore data differs. Updating local state from Firestore.");
          // Veri farklıysa, Firestore'dan gelen veriyi kullan
          // Bu, başka bir cihazdan yapılan değişiklikleri senkronize eder
          return {
            items: firestoreCartData.items || [],
            total: firestoreCartData.total || 0,
            note: firestoreCartData.note || "" // Notu da Firestore'dan al
          };
        }
      });
    }, (error) => {
      console.error("🔥 Firestore listener error:", error);
    });

    // Cleanup: Listener'ı ve timeout'u temizle
    return () => {
      console.log(`Firestore listener stopping for: tables/${tableId}`);
      unsub();
      if (firestoreUpdateTimeout.current) {
          clearTimeout(firestoreUpdateTimeout.current);
      }
    };
  }, [tableId]);

  // --- Helper: Calculate Total ---
  const calculateTotal = (items) =>
    items.reduce((sum, item) => sum + (item.qty || 0) * (item.price || 0), 0);

  // --- Debounced Firestore Update Function ---
  const scheduleFirestoreUpdate = (cartStateToSave) => {
    // Önceki zamanlayıcıyı temizle (varsa)
    if (firestoreUpdateTimeout.current) {
      clearTimeout(firestoreUpdateTimeout.current);
    }
    // Yeni bir zamanlayıcı başlat
    firestoreUpdateTimeout.current = setTimeout(async () => {
      if (!tableId) return;
      try {
        console.log(`Debounced Write to Firestore: tables/${tableId}`, cartStateToSave);
        const tableRef = doc(db, "tables", tableId);
        await setDoc(tableRef, {
          cart: {
            items: cartStateToSave.items,
            total: cartStateToSave.total,
            note: cartStateToSave.note
          },
          updatedAt: serverTimestamp(),
        }, { merge: true });
        console.log("Firestore update successful (debounced).");
      } catch (e) {
        console.error("❌ Firestore Cart update failed (debounced):", e);
      }
    }, 300); // 300ms gecikme
  };

  // --- Cart API Functions (Optimistic UI + Debounced Firestore Write) ---

  const addItem = (product) => {
    let newState; // Güncellenmiş state'i tutmak için
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
      return newState; // Yerel state'i HEMEN güncelle
    });
    // Yerel state güncellendikten SONRA Firestore güncellemesini zamanla
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
       return newState; // Yerel state'i HEMEN güncelle
    });
    // Yerel state güncellendikten SONRA Firestore güncellemesini zamanla
    if (newState) {
        scheduleFirestoreUpdate(newState);
    }
  };

  const clearCart = () => {
    console.log("clearCart called.");
    const emptyState = { items: [], total: 0, note: "" };
    // Önce yerel state'i temizle
    setCart(emptyState);
    // Sonra Firestore güncellemesini (gecikmeli olarak) zamanla
    scheduleFirestoreUpdate(emptyState);
  };

  // Not değişikliği HEMEN yerel state'i günceller VE Firestore güncellemesini zamanlar
  const updateNote = (newNote) => {
      console.log("updateNote called:", newNote);
      let newState;
      setCart(prev => {
          newState = { ...prev, note: newNote };
          return newState; // Yerel state'i HEMEN güncelle
      });
      // Not değiştiğinde de Firestore güncellemesini zamanla
      if (newState) {
          scheduleFirestoreUpdate(newState);
      }
  };

  // Siparişi gönder (Bu işlem anlık olmalı, debounce YOK)
  const placeOrder = async () => {
    if (!tableId || cart.items.length === 0) return;

    // Devam eden debounce işlemini iptal et, çünkü sipariş veriliyor
    if (firestoreUpdateTimeout.current) {
        clearTimeout(firestoreUpdateTimeout.current);
        firestoreUpdateTimeout.current = null; // Timeout referansını temizle
    }

    const cartToSubmit = cart; // O anki yerel state'i al
    console.log("placeOrder called, cart to submit:", cartToSubmit);
    // Butonları disable etmek için bir state eklenebilir (opsiyonel)
    // setIsPlacingOrder(true);
    try {
      await submitOrder({ // submitOrder Firestore'a yazar
        tableId,
        items: cartToSubmit.items,
        total: cartToSubmit.total,
        note: cartToSubmit.note,
      });
      alert("✅ Siparişiniz başarıyla alındı ve mutfağa iletildi!");
      // Sipariş başarılıysa, Firestore'daki sepeti ANINDA temizle
      // Bu, onSnapshot'ı tetikleyerek yerel state'i de temizleyecek
      const emptyState = { items: [], total: 0, note: "" };
      const tableRef = doc(db, "tables", tableId);
      await setDoc(tableRef, { cart: emptyState, updatedAt: serverTimestamp() }, { merge: true });
      // Yerel state'i de hemen temizleyebiliriz, onSnapshot zaten aynısını yapacak
      setCart(emptyState);
    } catch (e) {
      console.error("❌ Order submission error:", e);
      alert("Siparişiniz gönderilemedi. Lütfen tekrar deneyin.");
    } finally {
      // setIsPlacingOrder(false);
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
  }), [cart, tableId]);

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}