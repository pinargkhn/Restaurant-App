// src/context/CartContext.js
import React, { createContext, useContext, useState, useEffect, useMemo } from "react"; // useCallback kaldırıldı
import { useSearchParams } from "react-router-dom";
import { db } from "../lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { submitOrder } from "../lib/orders";

const CartContext = createContext();

export function useCart() {
  return useContext(CartContext);
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState({ items: [], total: 0, note: "" });
  const [params] = useSearchParams();
  const tableId = params.get("table");

  // --- Firestore Senkronizasyonu (GÜNCELLENDİ: Daha Basit Logic) ---
  useEffect(() => {
    if (!tableId) return;

    console.log(`Firestore listener starting for: tables/${tableId}`);
    const tableRef = doc(db, "tables", tableId);

    const unsub = onSnapshot(tableRef, (snap) => {
      console.log("Firestore snapshot received.");
      const firestoreCartData = snap.data()?.cart || { items: [], total: 0, note: "" };
      console.log("Firestore data:", firestoreCartData);

      // Fonksiyonel güncelleme: Yerel notu koruyarak Firestore'dan gelen items ve total'ı al
      setCart(currentLocalCart => {
          console.log("Updating local state based on Firestore. Preserving local note.");
          return {
              items: firestoreCartData.items || [], // Gelen items'ı al
              total: firestoreCartData.total || 0, // Gelen total'ı al
              note: currentLocalCart.note // Mevcut yerel notu koru
          };
      });

    }, (error) => {
        console.error("🔥 Firestore listener error:", error);
    });

    // Clean-up
    return () => {
        console.log(`Firestore listener stopping for: tables/${tableId}`);
        unsub();
    };
  }, [tableId]);

  // --- Yerel Yardımcı Fonksiyon ---
  const calculateTotal = (items) =>
    items.reduce((sum, item) => sum + (item.qty || 0) * (item.price || 0), 0);

  // --- Firestore Güncelleme Fonksiyonu ---
  const updateFirestore = async (newItems, newTotal, currentNote) => { // Notu parametre olarak al
    if (!tableId) return;
    try {
      console.log(`Writing to Firestore: tables/${tableId}`, { items: newItems, total: newTotal, note: currentNote });
      const tableRef = doc(db, "tables", tableId);
      await setDoc(tableRef, {
        cart: { items: newItems, total: newTotal, note: currentNote },
        updatedAt: serverTimestamp(),
      }, { merge: true });
      console.log("Firestore update successful.");
    } catch (e) {
      console.error("❌ Firestore Cart update failed:", e);
    }
  };

  // --- Sepet API Fonksiyonları (useCallback kaldırıldı) ---

  const addItem = (product) => {
    setCart(prevCart => {
      console.log("addItem called:", product);
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
      const currentNote = prevCart.note; // Güncel notu al
      console.log("New local cart state:", { items: newItems, total: newTotal, note: currentNote });
      // Firestore'u güncelle
      updateFirestore(newItems, newTotal, currentNote);
      // Yeni yerel state'i döndür
      return { items: newItems, total: newTotal, note: currentNote };
    });
  };

  const updateItemQty = (itemId, change) => {
     setCart(prevCart => {
        console.log("updateItemQty called:", itemId, change);
        let newItems = prevCart.items
          .map((item) =>
            item.id === itemId ? { ...item, qty: Math.max(0, (item.qty || 0) + change) } : item
          )
          .filter((item) => item.qty > 0);
        const newTotal = calculateTotal(newItems);
        const currentNote = prevCart.note; // Güncel notu al
        console.log("New local cart state:", { items: newItems, total: newTotal, note: currentNote });
        updateFirestore(newItems, newTotal, currentNote); // Firestore'u güncelle
        return { items: newItems, total: newTotal, note: currentNote }; // Yerel state'i güncelle
     });
  };

  const clearCart = () => {
    console.log("clearCart called.");
    // Firestore'u temizle (not dahil)
    updateFirestore([], 0, ""); // Notu da boş string olarak gönder
    // Yerel state'i temizle
    setCart({ items: [], total: 0, note: "" });
  };

  // Not sadece yerel state'i günceller
  const updateNote = (newNote) => {
      console.log("updateNote called:", newNote);
      setCart(prev => ({ ...prev, note: newNote }));
      // Not değiştiğinde Firestore'u hemen GÜNCELLEMEYEBİLİRİZ.
      // Sadece ürün eklendiğinde/çıkarıldığında veya sipariş verildiğinde güncellenmesi yeterli olabilir.
      // Ancak anlık kaydetmek isteniyorsa:
      // updateFirestore(cart.items, cart.total, newNote);
  };

  // Siparişi gönder
  const placeOrder = async () => {
    if (!tableId || cart.items.length === 0) {
        console.warn("Order placement failed: Cart empty or no tableId.");
        return;
    }
    console.log("placeOrder called, cart to submit:", cart);
    try {
      await submitOrder({
        tableId,
        items: cart.items,
        total: cart.total,
        note: cart.note, // En güncel notu gönder
      });
      alert("✅ Siparişiniz başarıyla alındı ve mutfağa iletildi!");
      clearCart();
    } catch (e) {
      console.error("❌ Order submission error:", e);
      alert("Siparişiniz gönderilemedi. Lütfen tekrar deneyin.");
    }
  };

  // Context değeri (useMemo bağımlılıkları güncellendi)
  const value = useMemo(() => ({
    cart,
    tableId,
    addItem,
    updateItemQty,
    clearCart,
    placeOrder,
    updateNote,
  }), [cart, tableId]); // useCallback kaldırıldığı için fonksiyonları bağımlılıktan çıkardık

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}