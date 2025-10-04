import { useCart } from "../context/CartContext";
import { submitOrder } from "../lib/orders";

export default function Cart() {
  const { items, total, increaseQty, decreaseQty, removeItem, clearCart } = useCart();
  const tableId = new URLSearchParams(window.location.search).get("table") || "unknown";

  const handleConfirm = async () => {
    if (!items.length) return alert("Sepet boş!");
    try {
      console.log("Sipariş gönderiliyor:", { tableId, items, total });

      const orderId = await submitOrder({ tableId, items, total });
      console.log("Sipariş eklendi ID:", orderId);

      await clearCart(); // ✅ sepet temizlenir
      alert("Sipariş alındı!");
    } catch (e) {
      console.error("Sipariş gönderilemedi:", e);
      alert("Sipariş gönderilemedi.");
    }
  };

  return (
    <aside className="w-80 bg-white shadow-lg p-4 sticky top-0 h-screen overflow-y-auto">
      <h3 className="text-xl font-semibold mb-3">Sepet</h3>

      {!items.length && <p className="text-gray-500">Sepet boş.</p>}

      {!!items.length && (
        <>
          <ul className="divide-y">
            {items.map((p) => (
              <li key={p.id} className="py-2 flex justify-between items-center">
                <span className="font-medium">{p.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    className="px-2 py-1 bg-gray-200 rounded"
                    onClick={() => decreaseQty(p.id)}
                  >
                    −
                  </button>
                  <span>{p.qty}</span>
                  <button
                    className="px-2 py-1 bg-gray-200 rounded"
                    onClick={() => increaseQty(p.id)}
                  >
                    +
                  </button>
                  <span className="font-semibold">{p.price * p.qty} ₺</span>
                  <button
                    className="text-red-600 ml-2"
                    onClick={() => removeItem(p.id)}
                  >
                    Sil
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex justify-between items-center mt-4">
            <span className="text-lg font-bold">Toplam: {total} ₺</span>
            <button
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              onClick={handleConfirm}
            >
              Sepeti Onayla
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
