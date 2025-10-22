// src/context/CartContext.js
import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { db } from "../lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp, writeBatch } from "firebase/firestore"; // writeBatch eklendi (gerekirse diye)
import { submitOrder } from "../lib/orders";

const CartContext = createContext();

export function useCart() {
  return useContext(CartContext);
}

export function CartProvider({ children }) {
  const [cart, setCart] = useState({ items: [], total: 0, note: "" });
  const [params] = useSearchParams();
  const tableId = params.get("table");
  // YENİ: Firestore'a yazma işlemi sırasında butonları kilitlemek için state
  const [isProcessing, setIsProcessing] = useState(false);
  // YENİ: Firestore'dan ilk yüklemenin tamamlanıp tamamlanmadığını takip etmek için
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);


  // --- Firestore Listener (Sadece State'i Günceller) ---
  useEffect(() => {
    if (!tableId) {
      setCart({ items: [], total: 0, note: "" });
      setIsInitialLoadComplete(true); // Masa yoksa yükleme tamamlandı say
      return;
    }

    setIsInitialLoadComplete(false); // Yeni masa için yüklemeyi başlat
    console.log(`Firestore listener starting for: tables/${tableId}`);
    const tableRef = doc(db, "tables", tableId);

    const unsub = onSnapshot(tableRef, (snap) => {
      console.log("Firestore snapshot received.");
      const firestoreCartData = snap.data()?.cart || { items: [], total: 0, note: "" };
      console.log("Firestore data:", firestoreCartData);

      // Firestore'dan geleni DOĞRUDAN state'e yaz. Karşılaştırma YOK.
      // Not: Kullanıcı not yazarken onSnapshot gelirse üzerine yazabilir.
      // Bu durumu engellemek için notu ayrı bir state'te tutup
      // sadece Firestore'a yazarken birleştirebiliriz ama şimdilik basit tutalım.
      setCart({
          items: firestoreCartData.items || [],
          total: firestoreCartData.total || 0,
          note: firestoreCartData.note || "" // Notu da Firestore'dan al
      });

      // İlk snapshot geldikten sonra yüklemenin tamamlandığını işaretle
      if (!isInitialLoadComplete) {
          setIsInitialLoadComplete(true);
      }

    }, (error) => {
      console.error("🔥 Firestore listener error:", error);
      setIsInitialLoadComplete(true); // Hata durumunda da yüklemeyi bitir
    });

    // Cleanup
    return () => {
      console.log(`Firestore listener stopping for: tables/${tableId}`);
      unsub();
      setIsInitialLoadComplete(false); // Dinleyici durduğunda yüklemeyi sıfırla
    };
  }, [tableId]); // Sadece tableId değiştiğinde çalışır

  // --- Helper: Calculate Total ---
  const calculateTotal = (items) =>
    items.reduce((sum, item) => sum + (item.qty || 0) * (item.price || 0), 0);

  // --- Firestore Update Function (Kilit Mekanizması ile) ---
  const updateFirestoreCart = async (newCartData) => {
    if (!tableId || isProcessing) {
        console.warn("Firestore update skipped: No tableId or already processing.");
        return; // Zaten bir işlem varsa veya masa ID yoksa çık
    }

    setIsProcessing(true); // Kilidi aktif et
    console.log(`Writing cart to Firestore: tables/${tableId}`, newCartData);
    try {
      const tableRef = doc(db, "tables", tableId);
      await setDoc(tableRef, {
        cart: newCartData, // Tüm cart nesnesini gönder
        updatedAt: serverTimestamp(),
      }, { merge: true }); // Merge true önemli
      console.log("Firestore cart update successful.");
    } catch (e) {
      console.error("❌ Firestore Cart update failed:", e);
      // Hata durumunda kullanıcıya bilgi verilebilir
      alert("Sepet güncellenirken bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setIsProcessing(false); // Kilidi kaldır
      console.log("Firestore processing finished.");
    }
  };

  // --- Cart API Functions (Sadece Firestore'u Tetikler, setCart YOK) ---

  const addItem = (product) => {
    if (isProcessing) return; // Hızlı tıklamaları engelle

    // 1. Mevcut state üzerinden bir sonraki state'i HESAPLA
    const currentCart = cart; // O anki state'i oku (onSnapshot'tan gelen en güncel hali)
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
    // Hesaplanan state (mevcut notu koruyarak)
    const newState = { items: newItems, total: newTotal, note: currentCart.note };

    console.log("addItem - Calculated next state to write:", newState);
    // 2. Yerel state'i güncelleme (setCart ÇAĞIRMA!)
    // 3. Hesaplanan state'i Firestore'a yaz
    updateFirestoreCart(newState);
  };

  const updateItemQty = (itemId, change) => {
     if (isProcessing) return; // Hızlı tıklamaları engelle

     // 1. Mevcut state üzerinden bir sonraki state'i HESAPLA
     const currentCart = cart; // O anki state'i oku
     let newItems = currentCart.items
       .map((item) =>
         item.id === itemId ? { ...item, qty: Math.max(0, (item.qty || 0) + change) } : item
       )
       .filter((item) => item.qty > 0); // Adet 0 olursa çıkar
     const newTotal = calculateTotal(newItems);
     // Hesaplanan state (mevcut notu koruyarak)
     const newState = { items: newItems, total: newTotal, note: currentCart.note };

     console.log("updateItemQty - Calculated next state to write:", newState);
     // 2. Yerel state'i güncelleme (setCart ÇAĞIRMA!)
     // 3. Hesaplanan state'i Firestore'a yaz
     updateFirestoreCart(newState);
  };

  const clearCart = () => {
    if (isProcessing || !tableId) return; // Hızlı tıklamaları/masa yoksa engelle
    console.log("clearCart called - Triggering Firestore update only.");
    const emptyState = { items: [], total: 0, note: "" };
    // Yerel state'i DEĞİŞTİRME. Sadece Firestore'u güncelle.
    updateFirestoreCart(emptyState);
    // onSnapshot yerel state'i zaten temizleyecek.
  };

  // Not değişikliği: Bu hala yerel state'i güncellemeli ki kullanıcı yazdığını görsün.
  // Ancak Firestore'a yazma işlemi debounce edilebilir veya sadece diğer işlemlerle birlikte yapılabilir.
  // Şimdilik sadece yerel state'i güncelleyelim. Firestore'a yazma, ürün ekleme/çıkarma veya sipariş ile gidecek.
  const updateNote = (newNote) => {
      console.log("updateNote called (local only):", newNote);
      setCart(prev => ({ ...prev, note: newNote }));
      // Not: Eğer notun Firestore'a anında gitmesi istenmiyorsa,
      // addItem, updateItemQty, clearCart, placeOrder içindeki
      // Firestore yazma işlemlerinde `note: currentCart.note` yerine
      // `note: cart.note` (yani en güncel state'deki not) kullanılmalı.
      // Mevcut kod zaten bunu yapıyor.
  };

  // Siparişi gönder
  const placeOrder = async () => {
    if (!tableId || cart.items.length === 0 || isProcessing) return;

    setIsProcessing(true); // Kilidi aktif et
    const cartToSubmit = { ...cart }; // Gönderilecek anlık state
    console.log("placeOrder called, cart to submit:", cartToSubmit);

    try {
      // 1. Siparişi 'orders' koleksiyonuna gönder
      await submitOrder({
        tableId,
        items: cartToSubmit.items,
        total: cartToSubmit.total,
        note: cartToSubmit.note,
      });
      alert("✅ Siparişiniz başarıyla alındı ve mutfağa iletildi!");

      // 2. Sipariş başarılıysa, 'tables' koleksiyonundaki sepeti TEMİZLE
      const emptyState = { items: [], total: 0, note: "" };
      await updateFirestoreCart(emptyState); // Bu onSnapshot'ı tetikleyecek

    } catch (e) {
      console.error("❌ Order submission error:", e);
      alert("Siparişiniz gönderilemedi. Lütfen tekrar deneyin.");
      setIsProcessing(false); // Hata durumunda kilidi açmayı unutma!
    }
    // Başarılı durumda updateFirestoreCart zaten kilidi false yapacak.
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
    // YENİ: Butonları disable etmek için hem işlem durumunu hem de ilk yükleme durumunu verelim
    isProcessing: isProcessing || !isInitialLoadComplete
  }), [cart, tableId, isProcessing, isInitialLoadComplete]); // Bağımlılıklar güncellendi

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}