import { createContext, useContext, useState, useMemo, useEffect } from "react";
import { db } from "../lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { updateCart } from "../lib/orders";

const CartContext = createContext();

export function CartProvider({ children }) {
  const tableId =
    new URLSearchParams(window.location.search).get("table") || "masa_1";
  const [items, setItems] = useState([]);

  // 🔹 Firestore’daki cart alanını dinle
  useEffect(() => {
    const ref = doc(db, "tables", tableId);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists() && snap.data().cart) {
        // Okunan veriyi sayıya çevirerek state'e yükle (ilk yükleme güvenliği)
        const itemsFromDb = snap.data().cart.items || [];
        setItems(itemsFromDb.map(item => ({ ...item, qty: Number(item.qty) })));
      }
    });
    return () => unsub();
  }, [tableId]);

  // 🔹 Firestore ve local state'i senkronize et
  const syncCart = (newItems) => {
    // ✅ DÜZELTME: Sepet güncellenirken her zaman qty'yi sayıya çevir
    const preparedItems = newItems.map(item => ({
        ...item,
        qty: Number(item.qty)
    }));

    const total = preparedItems.reduce((sum, p) => sum + p.price * p.qty, 0);
    setItems(preparedItems); // Local state'i sayı formatında güncelle
    updateCart(tableId, preparedItems, total); // Firestore'a sayı formatında kaydet
  };

  // 🔹 Ürün ekleme
  const addItem = (product) => {
    const existing = items.find((p) => p.id === product.id);
    const newItems = existing
      ? items.map((p) =>
          p.id === product.id ? { ...p, qty: Number(p.qty) + 1 } : p
        )
      : [...items, { ...product, qty: 1 }];
    syncCart(newItems);
  };

  // 🔹 Miktar artırma / azaltma / silme / temizleme
  const increaseQty = (id) =>
    syncCart(
      items.map((p) =>
        p.id === id ? { ...p, qty: Number(p.qty) + 1 } : p // ✅ Güvenli artırma
      )
    );

  const decreaseQty = (id) =>
    syncCart(
      items
        .map((p) =>
          p.id === id ? { ...p, qty: Number(p.qty) - 1 } : p // ✅ Güvenli azaltma
        )
        .filter((p) => Number(p.qty) > 0) // ✅ Güvenli filtreleme
    );

  const removeItem = (id) => syncCart(items.filter((p) => p.id !== id));
  const clearCart = () => syncCart([]);

  // 🔹 Toplam fiyat
  const total = useMemo(
    () => items.reduce((sum, p) => sum + p.price * p.qty, 0),
    [items]
  );

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        increaseQty,
        decreaseQty,
        removeItem,
        clearCart,
        total,
        tableId,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}