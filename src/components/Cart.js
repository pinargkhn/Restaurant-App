import React from "react";
import { useCart } from "../context/CartContext";

export default function Cart() {
  const { cart, tableId, updateItemQty, clearCart, placeOrder, updateNote } = useCart(); // 🔹 updateNote eklendi
  const { items, total, note } = cart; // 🔹 note eklendi

  // Sepet boşsa gösterilecek minimal görünüm
  if (items.length === 0) {
    return (
      <div className="md:w-96 p-6 md:h-screen sticky top-0 bg-gray-50 border-l border-t md:border-t-0 shadow-lg flex flex-col justify-center items-center">
        <p className="text-xl font-semibold text-gray-500">
          Sepetiniz boş.
        </p>
        {tableId && (
          <p className="text-sm text-gray-400 mt-2">
            Masa: {tableId}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="md:w-96 p-6 md:h-screen sticky top-0 bg-gray-50 border-l border-t md:border-t-0 shadow-lg flex flex-col">
      <h3 className="text-xl font-bold mb-4">🛒 Sipariş Sepetiniz</h3>

      {/* Sepet İçeriği */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-2">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between items-center border-b pb-2">
            <span className="font-medium">{item.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">
                {item.price} ₺
              </span>
              <button
                onClick={() => updateItemQty(item.id, -1)}
                className="bg-gray-200 text-black px-2 rounded hover:bg-gray-300"
              >
                −
              </button>
              <span className="font-semibold">{item.qty}</span>
              <button
                onClick={() => updateItemQty(item.id, 1)}
                className="bg-gray-200 text-black px-2 rounded hover:bg-gray-300"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {/* 🔹 YENİ ALAN: Sipariş Notu */}
      <div className="mt-4 pt-4 border-t">
          <label htmlFor="order-note" className="block text-sm font-semibold mb-2">
              Sipariş Notu (Opsiyonel)
          </label>
          <textarea
              id="order-note"
              value={note}
              onChange={(e) => updateNote(e.target.value)} // 🔹 updateNote fonksiyonu ile bağlanır
              rows="3"
              placeholder="Ekstra sos, alerjen bilgisi vb."
              className="w-full border p-2 rounded focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
      </div>

      {/* Alt Bilgi ve Butonlar */}
      <div className="mt-4 pt-4 border-t">
        <div className="flex justify-between font-bold text-lg mb-4">
          <span>Toplam:</span>
          <span>{total.toFixed(2)} ₺</span>
        </div>
        <button
          onClick={placeOrder}
          className="w-full bg-blue-600 text-white py-3 rounded font-semibold hover:bg-blue-700 transition mb-2"
        >
          Siparişi Onayla ve Gönder
        </button>
        <button
          onClick={clearCart}
          className="w-full bg-red-500 text-white py-1 rounded hover:bg-red-600 transition text-sm"
        >
          Sepeti Temizle
        </button>
      </div>
    </div>
  );
}