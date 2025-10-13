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
        setItems(snap.data().cart.items || []);
      }
    });
    return () => unsub();
  }, [tableId]);

  // 🔹 Firestore ve local state'i senkronize et
  const syncCart = (newItems) => {
    const total = newItems.reduce((sum, p) => sum + p.price * p.qty, 0);
    setItems(newItems);
    updateCart(tableId, newItems, total);
  };

  // 🔹 Ürün ekleme
  const addItem = (product) => {
    const existing = items.find((p) => p.id === product.id);
    const newItems = existing
      ? items.map((p) =>
          p.id === product.id ? { ...p, qty: p.qty + 1 } : p
        )
      : [...items, { ...product, qty: 1 }];
    syncCart(newItems);
  };

  // 🔹 Miktar artırma / azaltma / silme / temizleme
  const increaseQty = (id) =>
    syncCart(
      items.map((p) =>
        p.id === id ? { ...p, qty: p.qty + 1 } : p
      )
    );

  const decreaseQty = (id) =>
    syncCart(
      items
        .map((p) =>
          p.id === id ? { ...p, qty: p.qty - 1 } : p
        )
        .filter((p) => p.qty > 0)
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
