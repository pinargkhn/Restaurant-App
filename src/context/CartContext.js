// src/context/CartContext.js
import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
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
        // id ve qty kontrolü ekleyelim
        return itemA.id === itemB.id && (itemA.qty || 0) === (itemB.qty || 0);
    });
};


export function CartProvider({ children }) {
  const [cart, setCart] = useState({ items: [], total: 0, note: "" });
  const [params] = useSearchParams();
  const tableId = params.get("table");
  const firestoreUpdateTimeout = useRef(null);
  // YENİ: Sepet temizleme veya sipariş gönderme işlemi sırasında kilitleme
  const [isProcessingAction, setIsProcessingAction] = useState(false);

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
        // console.log("Current local cart:", currentLocalCart);
        // Firestore'dan gelen veri ile mevcut yerel state'i TAMAMEN karşılaştır
        if (areCartsEqual(firestoreCartData, currentLocalCart)) {
          // console.log("Firestore data matches local state exactly. No update needed.");
          return currentLocalCart; // Veri aynıysa, state'i değiştirme
        } else {
          console.log("Firestore data differs. Updating local state from Firestore.");
          // Veri farklıysa, Firestore'dan gelen veriyi kullan
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

  // --- Anlık Firestore Update Function ---
  const updateFirestoreImmediately = async (cartStateToSave) => {
    if (!tableId) return;
    // Devam eden debounce işlemini iptal et (varsa)
    if (firestoreUpdateTimeout.current) {
        clearTimeout(firestoreUpdateTimeout.current);
        firestoreUpdateTimeout.current = null;
    }
    try {
        console.log(`Writing IMMEDIATE to Firestore: tables/${tableId}`, cartStateToSave);
        const tableRef = doc(db, "tables", tableId);
        await setDoc(tableRef, { cart: cartStateToSave, updatedAt: serverTimestamp() }, { merge: true });
        console.log("Firestore IMMEDIATE update successful.");
    } catch (e) {
        console.error("❌ Firestore Cart IMMEDIATE update failed:", e);
        // Hata durumunda kullanıcıya bilgi verilebilir
        throw e; // Hatanın yukarıya (çağıran fonksiyona) iletilmesi için
    }
  };


  // --- Debounced Firestore Update Function ---
  const scheduleFirestoreUpdate = (cartStateToSave) => {
    if (firestoreUpdateTimeout.current) {
      clearTimeout(firestoreUpdateTimeout.current);
    }
    firestoreUpdateTimeout.current = setTimeout(async () => {
      if (!tableId) return;
      try {
        console.log(`Debounced Write to Firestore: tables/${tableId}`, cartStateToSave);
        const tableRef = doc(db, "tables", tableId);
        await setDoc(tableRef, {
          cart: { items: cartStateToSave.items, total: cartStateToSave.total, note: cartStateToSave.note },
          updatedAt: serverTimestamp(),
        }, { merge: true });
        console.log("Firestore update successful (debounced).");
      } catch (e) {
        console.error("❌ Firestore Cart update failed (debounced):", e);
      }
    }, 350); // Gecikmeyi biraz artırdık (350ms)
  };

  // --- Cart API Functions ---

  const addItem = (product) => {
    // Eğer bir işlem devam ediyorsa ekleme yapma (isteğe bağlı)
    // if (isProcessingAction) return;
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
    // if (isProcessingAction) return;
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

  // ----- clearCart (SADECE FIRESTORE TETİKLEYEN HALİ) -----
  const clearCart = async () => {
    // Zaten işlem yapılıyorsa veya masa ID yoksa işlem yapma
    if (isProcessingAction || !tableId) return;

    console.log("clearCart called - Triggering Firestore update only.");
    setIsProcessingAction(true); // Kilidi aktif et

    const emptyState = { items: [], total: 0, note: "" };
    try {
        // Yerel state'i DEĞİŞTİRME. Sadece Firestore'u HEMEN güncelle.
        await updateFirestoreImmediately(emptyState);
        // Başarılı olursa, onSnapshot zaten yerel state'i güncelleyecek.
    } catch (error) {
        alert("Sepet temizlenirken bir hata oluştu.");
        console.error("clearCart Firestore update error:", error);
    } finally {
        setIsProcessingAction(false); // İşlem bitince kilidi kaldır
    }
  };
  // ----- clearCart Bitiş -----

  const updateNote = (newNote) => {
      console.log("updateNote called:", newNote);
      let newState;
      setCart(prev => {
          newState = { ...prev, note: newNote };
          return newState; // Yerel state'i HEMEN güncelle
      });
      if (newState) {
          scheduleFirestoreUpdate(newState); // Firestore güncellemesini zamanla
      }
  };

  const placeOrder = async () => {
    if (!tableId || cart.items.length === 0 || isProcessingAction) return;

    // Devam eden debounce işlemini iptal et
    if (firestoreUpdateTimeout.current) {
        clearTimeout(firestoreUpdateTimeout.current);
        firestoreUpdateTimeout.current = null;
    }

    setIsProcessingAction(true); // Kilidi aktif et
    const cartToSubmit = { ...cart }; // Gönderilecek anlık state'in kopyası
    console.log("placeOrder called, cart to submit:", cartToSubmit);

    try {
      await submitOrder({ // Bu, 'orders' koleksiyonuna yazar
        tableId,
        items: cartToSubmit.items,
        total: cartToSubmit.total,
        note: cartToSubmit.note,
      });
      alert("✅ Siparişiniz başarıyla alındı ve mutfağa iletildi!");

      // Sipariş başarılıysa, Firestore'daki 'tables' koleksiyonundaki sepeti HEMEN temizle
      const emptyState = { items: [], total: 0, note: "" };
      await updateFirestoreImmediately(emptyState); // Bu, onSnapshot'ı tetikleyerek yerel state'i de temizleyecek
      // Yerel state'i ayrıca temizlemeye gerek yok

    } catch (e) {
      console.error("❌ Order submission error:", e);
      alert("Siparişiniz gönderilemedi. Lütfen tekrar deneyin.");
       // Hata durumunda kilidi burada aç
       setIsProcessingAction(false);
    } finally {
       // Başarılı durumda da kilidi aç (updateFirestoreImmediately'den sonra)
       // Ancak updateFirestoreImmediately zaten kilidi kontrol etmiyor,
       // bu yüzden sipariş sonrası temizleme işlemi bitince kilidi açmak daha doğru.
       // Hata durumunda yukarıda açtık.
       //setIsProcessingAction(false); // Başarılıysa bu satıra gerek kalmayabilir
    }
     // Başarılı veya başarısız, kilidi açmayı garanti altına alalım
     setIsProcessingAction(false);
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
    isProcessingAction // Butonları disable etmek için
  }), [cart, tableId, isProcessingAction]); // isProcessingAction eklendi

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}