import { createContext, useContext, useState, useMemo, useEffect, useCallback } from "react";
import { db, doc, setDoc, onSnapshot, serverTimestamp } from "../lib/firebase";

const CartContext = createContext();

export function CartProvider({ children }) {
  const tableId = new URLSearchParams(window.location.search).get("table") || "unknown";
  const [items, setItems] = useState([]);
  const [lastOrderId, setLastOrderId] = useState(null);

  // Firestore'dan sepet oku
  useEffect(() => {
    const ref = doc(db, "carts", tableId);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setItems(snap.data().items || []);
      }
    });
    return () => unsub();
  }, [tableId]);

  // Firestore'a yazma
  const syncCart = async (newItems) => {
    const ref = doc(db, "carts", tableId);
    await setDoc(ref, { items: newItems, updatedAt: serverTimestamp() }, { merge: true });
  };

  const addItem = (product) => {
    setItems((prev) => {
      const existing = prev.find((p) => p.id === product.id);
      const newItems = existing
        ? prev.map((p) => (p.id === product.id ? { ...p, qty: p.qty + 1 } : p))
        : [...prev, { ...product, qty: 1 }];
      syncCart(newItems);
      return newItems;
    });
  };

  const increaseQty = (id) => {
    setItems((prev) => {
      const newItems = prev.map((p) => (p.id === id ? { ...p, qty: p.qty + 1 } : p));
      syncCart(newItems);
      return newItems;
    });
  };

  const decreaseQty = (id) => {
    setItems((prev) => {
      const newItems = prev
        .map((p) => (p.id === id ? { ...p, qty: p.qty - 1 } : p))
        .filter((p) => p.qty > 0);
      syncCart(newItems);
      return newItems;
    });
  };

  const removeItem = (id) => {
    setItems((prev) => {
      const newItems = prev.filter((p) => p.id !== id);
      syncCart(newItems);
      return newItems;
    });
  };

  const clearCart = useCallback(async () => {
    setItems([]); // UI anında boşalsın
    const ref = doc(db, "carts", tableId);
    await setDoc(ref, { items: [], updatedAt: serverTimestamp() }, { merge: true });
  }, [tableId]);

  const total = useMemo(() => items.reduce((sum, p) => sum + p.price * p.qty, 0), [items]);

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
        lastOrderId,
        setLastOrderId,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
