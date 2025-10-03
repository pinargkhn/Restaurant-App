import { useEffect, useState } from "react";
import { db, onSnapshot, collection, query, orderBy } from "../lib/firebase";
import { updateOrderStatus } from "../lib/orders";

export default function Kitchen() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOrders(list);
    });
    return () => unsub();
  }, []);

  // Duruma göre arka plan rengi belirle
  const getBgColor = (status) => {
    switch (status) {
      case "Hazırlanıyor":
        return "bg-yellow-100";
      case "Hazır":
        return "bg-green-200";
      default:
        return "bg-white"; // Yeni
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Mutfak Paneli</h2>

      {!orders.length && (
        <p className="text-gray-500">Henüz sipariş yok.</p>
      )}

      <ul className="space-y-4">
        {orders
          .filter(o => o.status !== "Teslim Edildi") // ✅ Teslim edilenleri gösterme
          .map(o => (
          <li
            key={o.id}
            className={`rounded shadow p-4 transition-colors duration-500 ${getBgColor(o.status)}`}
          >
            <div className="flex justify-between items-center">
              <span className="font-semibold">Masa: {o.tableId}</span>
              <span className="text-sm px-2 py-1 rounded bg-gray-100">
                {o.status}
              </span>
            </div>

            <ul className="mt-2 list-disc ml-6 text-gray-700 text-sm">
              {o.items?.map((it, i) => (
                <li key={i}>{it.name} × {it.qty}</li>
              ))}
            </ul>

            <div className="mt-3 flex gap-2">
              <button
                className="px-3 py-1 bg-yellow-600 text-white rounded"
                onClick={() => updateOrderStatus(o.id, "Hazırlanıyor")}
              >
                Hazırlanıyor
              </button>
              <button
                className="px-3 py-1 bg-green-700 text-white rounded"
                onClick={() => updateOrderStatus(o.id, "Hazır")}
              >
                Hazır
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
