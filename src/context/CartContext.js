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

// --- CartProvider (YENİDEN DÜZENLENDİ) ---
export function CartProvider({ children }) {
  const [cart, setCart] = useState({ items: [], total: 0, note: "" });
  const [params] = useSearchParams();
  const tableId = params.get("table");
  const [isProcessing, setIsProcessing] = useState(false); // Firestore yazma kilidi

  // --- Firestore Listener (Sadece State'i Günceller) ---
  useEffect(() => {
    if (!tableId) {
        setCart({ items: [], total: 0, note: "" }); // Masa yoksa veya değiştiyse sıfırla
        return;
    };

    console.log(`Firestore listener starting for: tables/${tableId}`);
    const tableRef = doc(db, "tables", tableId);

    const unsub = onSnapshot(tableRef, (snap) => {
      console.log("Firestore snapshot received.");
      const firestoreCartData = snap.data()?.cart || { items: [], total: 0, note: "" };
      console.log("Firestore data:", firestoreCartData);

      // Firestore'dan geleni doğrudan state'e yaz (yerel notu koruyarak)
      setCart(currentLocalCart => {
          // Eğer Firestore'dan gelen not boş değilse ve yerel not boşsa, Firestore'dakini al
          // (Bu, başka bir cihazdan not eklendiğinde senkronize olmasını sağlar)
          // Ama kullanıcı şu an not yazıyorsa (yerel not boş değilse), yerel not korunur.
          const noteToKeep = currentLocalCart.note || firestoreCartData.note || "";
          console.log("Updating local state from Firestore. Keeping note:", noteToKeep);
          return {
            items: firestoreCartData.items || [],
            total: firestoreCartData.total || 0,
            note: noteToKeep
          };
      });

    }, (error) => {
      console.error("🔥 Firestore listener error:", error);
    });

    return () => {
      console.log(`Firestore listener stopping for: tables/${tableId}`);
      unsub();
    };
  }, [tableId]);

  // --- Helper: Calculate Total ---
  const calculateTotal = (items) =>
    items.reduce((sum, item) => sum + (item.qty || 0) * (item.price || 0), 0);

  // --- Firestore Update Function (Kilit Mekanizması ile) ---
  const updateFirestore = async (cartStateToSave) => {
    if (!tableId || isProcessing) return; // Zaten bir işlem varsa veya masa ID yoksa çık

    setIsProcessing(true); // Kilidi aktif et
    console.log(`Writing to Firestore: tables/${tableId}`, cartStateToSave);
    try {
      const tableRef = doc(db, "tables", tableId);
      await setDoc(tableRef, {
        cart: {
          items: cartStateToSave.items,
          total: cartStateToSave.total,
          note: cartStateToSave.note
        },
        updatedAt: serverTimestamp(),
      }, { merge: true });
      console.log("Firestore update successful.");
    } catch (e) {
      console.error("❌ Firestore Cart update failed:", e);
      // Hata durumunda kullanıcıya bilgi verilebilir
    } finally {
        // Gecikme ekleyerek Firestore listener'ın state'i güncellemesine zaman tanıyabiliriz (isteğe bağlı)
        // await new Promise(resolve => setTimeout(resolve, 100)); // Örn: 100ms bekle
        setIsProcessing(false); // Kilidi kaldır
        console.log("Firestore processing finished.");
    }
  };

  // --- Cart API Functions (Sadece Firestore'u Tetikler) ---

  const addItem = (product) => {
    if (isProcessing) return; // Hızlı tıklamaları engelle
    // 1. Mevcut state üzerinden bir sonraki state'i HESAPLA
    const currentCart = cart; // O anki state'i oku
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

    console.log("addItem - Calculated next state:", newState);
    // 2. Yerel state'i güncelleme (setCart ÇAĞIRMA!)
    // 3. Hesaplanan state'i Firestore'a yaz
    updateFirestore(newState);
  };

  const updateItemQty = (itemId, change) => {
     if (isProcessing) return; // Hızlı tıklamaları engelle
     // 1. Mevcut state üzerinden bir sonraki state'i HESAPLA
     const currentCart = cart; // O anki state'i oku
     let newItems = currentCart.items
       .map((item) =>
         item.id === itemId ? { ...item, qty: Math.max(0, (item.qty || 0) + change) } : item
       )
       .filter((item) => item.qty > 0);
     const newTotal = calculateTotal(newItems);
     const newState = { items: newItems, total: newTotal, note: currentCart.note }; // Mevcut notu koru

     console.log("updateItemQty - Calculated next state:", newState);
     // 2. Yerel state'i güncelleme (setCart ÇAĞIRMA!)
     // 3. Hesaplanan state'i Firestore'a yaz
     updateFirestore(newState);
  };

  const clearCart = () => {
    if (isProcessing) return; // Hızlı tıklamaları engelle
    console.log("clearCart called.");
    const emptyState = { items: [], total: 0, note: "" };
    // Yerel state'i güncelleme (setCart ÇAĞIRMA!)
    // Sadece Firestore'u güncelle
    updateFirestore(emptyState);
    // Not: onSnapshot yerel state'i zaten temizleyecek.
  };

  // Not sadece yerel state'i günceller
  const updateNote = (newNote) => {
      console.log("updateNote called (local only):", newNote);
      setCart(prev => ({ ...prev, note: newNote }));
      // Not değiştiğinde Firestore'u hemen GÜNCELLEME.
      // Bir sonraki ürün değişikliği veya siparişle birlikte gidecek.
  };

  // Siparişi gönder
  const placeOrder = async () => {
    if (!tableId || cart.items.length === 0 || isProcessing) {
      console.warn("Order placement failed: Cart empty, no tableId, or processing.");
      return;
    }
    const cartToSubmit = { // Gönderilecek anlık state (note dahil)
        items: cart.items,
        total: cart.total,
        note: cart.note
    };
    console.log("placeOrder called, cart to submit:", cartToSubmit);
    setIsProcessing(true); // Sipariş gönderirken de kilitle
    try {
      await submitOrder({
        tableId,
        items: cartToSubmit.items,
        total: cartToSubmit.total,
        note: cartToSubmit.note,
      });
      alert("✅ Siparişiniz başarıyla alındı ve mutfağa iletildi!");
      // Sipariş BAŞARILI olursa Firestore'daki sepeti temizle
      // Bu, onSnapshot'ı tetikleyerek yerel sepeti de temizleyecek
      await updateFirestore({ items: [], total: 0, note: "" });
    } catch (e) {
      console.error("❌ Order submission error:", e);
      alert("Siparişiniz gönderilemedi. Lütfen tekrar deneyin.");
      setIsProcessing(false); // Hata durumunda kilidi aç
    }
    // Başarılı durumda updateFirestore'un finally bloğu kilidi açacak
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
    isProcessing // Arayüzde butonları disable etmek için kullanılabilir (isteğe bağlı)
  }), [cart, tableId, isProcessing]); // Fonksiyonlar artık değişmediği için bağımlılıkta yok

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}