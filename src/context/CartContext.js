// src/context/CartContext.js
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
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

  // --- Firestore Senkronizasyonu (GÜNCELLENDİ) ---
  useEffect(() => {
    if (!tableId) return; // Masa ID yoksa dinleyiciyi başlatma

    console.log(`Firestore dinleyicisi başlatılıyor: tables/${tableId}`);
    const tableRef = doc(db, "tables", tableId);

    const unsub = onSnapshot(tableRef, (snap) => {
      console.log("Firestore snapshot alındı.");
      // Firestore'dan gelen ham veriyi al veya boş sepet oluştur
      const firestoreCartData = snap.data()?.cart || { items: [], total: 0, note: "" };
      console.log("Firestore verisi:", firestoreCartData);

      // setCart'in fonksiyonel güncelleme formunu kullan
      setCart(currentLocalCart => {
        console.log("Mevcut yerel sepet:", currentLocalCart);

        // Basit ama etkili kontrol: Firestore'dan gelen items dizisi ile yerel items dizisini
        // JSON string'e çevirerek karşılaştır. Eğer aynıysa, üzerine yazma.
        // Bu, hem gereksiz render'ları önler hem de yarış durumunu çözer.
        // Not: Çok büyük sepetlerde performansı etkileyebilir ama genellikle yeterlidir.
        const firestoreItemsString = JSON.stringify(firestoreCartData.items || []);
        const localItemsString = JSON.stringify(currentLocalCart.items || []);

        if (firestoreItemsString === localItemsString) {
          console.log("Firestore ve yerel items aynı. Yerel state korunuyor.");
          // Eğer item'lar aynıysa, sadece Firestore'dan gelen total farklıysa onu alabiliriz
          // (nadiren de olsa tutarsızlık olabilir), ama genellikle item'lar aynıysa total de aynıdır.
          // Yerel not'u korumak için yine currentLocalCart'ı temel alalım.
           if (firestoreCartData.total !== currentLocalCart.total) {
               console.warn("Firestore total ve yerel total farklı, ancak item'lar aynı. Firestore total kullanılıyor.");
                return {
                 ...currentLocalCart, // Yerel notu koru
                 total: firestoreCartData.total, // Firestore'dan gelen total'ı al
               };
           }
          // Hem item hem total aynıysa hiçbir şey yapma
          return currentLocalCart;
        } else {
          console.log("Firestore ve yerel items farklı. Firestore verisiyle güncelleniyor (yerel not korunuyor).");
          // Firestore'dan gelen veri farklıysa, yerel state'i güncelle,
          // ancak kullanıcının yazdığı not'u (currentLocalCart.note) koru.
          return {
            ...currentLocalCart, // Yerel notu koru
            items: firestoreCartData.items,
            total: firestoreCartData.total,
          };
        }
      });
    }, (error) => {
        // Hata durumunda loglama
        console.error("🔥 Firestore dinleme hatası:", error);
    });

    // Clean-up fonksiyonu: Bileşen kaldırıldığında dinleyiciyi kapat
    return () => {
        console.log(`Firestore dinleyicisi kapatılıyor: tables/${tableId}`);
        unsub();
    };
  }, [tableId]); // Sadece tableId değiştiğinde dinleyiciyi yeniden başlat

  // --- Yerel Yardımcı Fonksiyonlar ---
  const calculateTotal = (items) =>
    items.reduce((sum, item) => sum + (item.qty || 0) * (item.price || 0), 0); // qty ve price yoksa 0 kabul et

  // --- Firestore Güncelleme Fonksiyonu (useCallback ile optimize edildi) ---
  const updateFirestore = useCallback(async (newItems, newTotal) => {
    if (!tableId) return;
    try {
      console.log(`Firestore'a yazılıyor: tables/${tableId}`, { items: newItems, total: newTotal });
      const tableRef = doc(db, "tables", tableId);
      // Yazmadan hemen önceki state'den not'u al
      const currentNote = cart.note;
      await setDoc(tableRef, {
        cart: {
          items: newItems,
          total: newTotal,
          note: currentNote, // En güncel notu yaz
        },
        updatedAt: serverTimestamp(),
      }, { merge: true });
      console.log("Firestore başarıyla güncellendi.");
    } catch (e) {
      console.error("❌ Firestore Cart güncellenemedi:", e);
    }
  }, [tableId, cart.note]); // tableId veya cart.note değişirse fonksiyonu yeniden oluştur

  // --- Sepet API Fonksiyonları (GÜNCELLENDİ: Fonksiyonel setCart kullanımı) ---

  const addItem = useCallback((product) => {
    setCart(prevCart => {
      console.log("addItem çağrıldı:", product);
      const existingItem = prevCart.items.find((item) => item.id === product.id);
      let newItems;
      if (existingItem) {
        newItems = prevCart.items.map((item) =>
          item.id === product.id ? { ...item, qty: (item.qty || 0) + 1 } : item
        );
      } else {
        // Fiyatın sayı olduğundan emin ol
        const priceAsNumber = Number(product.price) || 0;
        newItems = [...prevCart.items, { ...product, price: priceAsNumber, qty: 1 }];
      }
      const newTotal = calculateTotal(newItems);
      console.log("Yeni sepet durumu (yerel):", { items: newItems, total: newTotal });
      // Firestore'u güncelle (güncel not ile birlikte)
      updateFirestore(newItems, newTotal);
      // Yeni yerel state'i döndür (not korunur)
      return { ...prevCart, items: newItems, total: newTotal };
    });
  }, [updateFirestore]); // updateFirestore değişirse addItem'ı yeniden oluştur

  const updateItemQty = useCallback((itemId, change) => {
     setCart(prevCart => {
        console.log("updateItemQty çağrıldı:", itemId, change);
        let newItems = prevCart.items
          .map((item) =>
            item.id === itemId ? { ...item, qty: Math.max(0, (item.qty || 0) + change) } : item
          )
          .filter((item) => item.qty > 0); // Adet 0 olursa sepetten çıkar
        const newTotal = calculateTotal(newItems);
        console.log("Yeni sepet durumu (yerel):", { items: newItems, total: newTotal });
        updateFirestore(newItems, newTotal); // Firestore'u güncelle
        return { ...prevCart, items: newItems, total: newTotal }; // Yerel state'i güncelle
     });
  }, [updateFirestore]);

  const clearCart = useCallback(() => {
    console.log("clearCart çağrıldı.");
    // Önce Firestore'u (boş sepet ve mevcut not ile) güncelle,
    // sonra yerel state'i temizle ki yarış durumu olmasın.
    // Not: Boş sepette notu tutmak mantıklı olmayabilir, Firestore'dan da temizleyelim.
    if (tableId) {
        const tableRef = doc(db, "tables", tableId);
        setDoc(tableRef, {
            cart: { items: [], total: 0, note: "" }, // Notu da temizle
            updatedAt: serverTimestamp(),
        }, { merge: true }).catch(e => console.error("Firestore sepet temizleme hatası:", e));
    }
    setCart({ items: [], total: 0, note: "" }); // Yerel state'i temizle
  }, [tableId]);

  // Not sadece yerel state'i günceller
  const updateNote = useCallback((newNote) => {
      console.log("updateNote çağrıldı:", newNote);
      setCart(prev => ({ ...prev, note: newNote }));
  }, []);

  // Siparişi gönder
  const placeOrder = useCallback(async () => {
    // Sepet boşsa veya masa ID yoksa işlem yapma
    if (!tableId || !cart || cart.items.length === 0) {
        console.warn("Sipariş gönderilemedi: Sepet boş veya masa ID yok.");
        return;
    }
    console.log("placeOrder çağrıldı, gönderilecek sepet:", cart);
    try {
      await submitOrder({
        tableId,
        items: cart.items,
        total: cart.total,
        note: cart.note, // En güncel notu gönder
      });
      alert("✅ Siparişiniz başarıyla alındı ve mutfağa iletildi!");
      clearCart(); // Sipariş gönderildikten sonra sepeti temizle
    } catch (e) {
      console.error("❌ Sipariş gönderme hatası:", e);
      alert("Siparişiniz gönderilemedi. Lütfen tekrar deneyin.");
    }
  }, [tableId, cart, clearCart]); // cart değiştiğinde fonksiyonu yeniden oluştur

  // Context değerini oluştur (useMemo ile optimize edildi)
  const value = useMemo(() => ({
    cart,
    tableId,
    addItem,
    updateItemQty,
    clearCart,
    placeOrder,
    updateNote,
  }), [cart, tableId, addItem, updateItemQty, clearCart, placeOrder, updateNote]); // Tüm fonksiyonları bağımlılıklara ekle

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}