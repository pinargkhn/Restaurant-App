import React from "react";
import { useCart } from "../context/CartContext";
import { submitOrder } from "../lib/orders";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function Cart() {
  const {
    items,
    total,
    tableId,
    clearCart,
    increaseQty,
    decreaseQty,
    removeItem,
  } = useCart();

  // 🔹 Siparişi Firestore'a gönder
  const handleConfirm = async () => {
    if (!items.length) return alert("Sepet boş!");

    try {
      console.log("🚀 Sipariş gönderiliyor:", { tableId, items, total });

      // 1️⃣ Siparişi orders alt koleksiyonuna gönder
      await submitOrder({ tableId, items, total });

      // 2️⃣ Masa altındaki cart alanını sıfırla
      const ref = doc(db, "tables", tableId);
      await updateDoc(ref, {
        cart: { items: [], total: 0 },
      });

      // 3️⃣ Yerel sepeti temizle
      clearCart();

      alert("✅ Sipariş başarıyla gönderildi!");
    } catch (e) {
      console.error("🔥 Sipariş gönderme hatası:", e);
      alert("❌ Sipariş gönderilemedi. Lütfen tekrar deneyin.");
    }
  };

  return (
    <div className="bg-gray-100 shadow-md rounded-lg p-4 w-full md:w-80">
      <h2 className="text-lg font-bold mb-3 text-center">🛒 Sepet</h2>

      {items.length === 0 ? (
        <p className="text-gray-500 text-center">Sepet boş.</p>
      ) : (
        <>
          <ul className="divide-y divide-gray-300">
            {items.map((item) => (
              <li
                key={item.id}
                className="py-2 flex justify-between items-center"
              >
                <div className="flex flex-col">
                  <span className="font-semibold">{item.name}</span>
                  <span className="text-sm text-gray-500">
                    {item.price} ₺
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => decreaseQty(item.id)}
                    className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                  >
                    −
                  </button>
                  <span className="font-medium">{item.qty}</span>
                  <button
                    onClick={() => increaseQty(item.id)}
                    className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                  >
                    +
                  </button>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-red-500 hover:text-red-700 ml-2 text-sm"
                  >
                    ❌
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t pt-3">
            <div className="flex justify-between items-center font-semibold mb-3">
              <span>Toplam:</span>
              <span>{total} ₺</span>
            </div>

            <button
              onClick={handleConfirm}
              className="w-full bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 transition-all"
            >
              ✅ Siparişi Gönder
            </button>
          </div>
        </>
      )}
    </div>
  );
}
