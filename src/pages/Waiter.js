import { useEffect, useState } from "react";
import { db, onSnapshot, collection, query, orderBy } from "../lib/firebase";
import { updateOrderStatus } from "../lib/orders";

export default function Waiter() {
  const [orders, setOrders] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    // Tüm siparişleri dinle
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOrders(list);
    });
    return () => unsub();
  }, []);

  // Garsonun göreceği aktif siparişler (Hazırlanıyor + Hazır)
  const activeOrders = orders.filter(o => o.status === "Hazırlanıyor" || o.status === "Hazır");
  // Geçmiş (Teslim Edildi)
  const deliveredOrders = orders.filter(o => o.status === "Teslim Edildi");

  // Duruma göre arka plan
  const getBgColor = (status) => {
    switch (status) {
      case "Hazırlanıyor":
        return "bg-yellow-100";
      case "Hazır":
        return "bg-green-200";
      case "Teslim Edildi":
        return "bg-gray-200";
      default:
        return "bg-white";
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Garson Paneli</h2>

      {!activeOrders.length && (
        <p className="text-gray-500">Hazır veya hazırlanıyor sipariş yok.</p>
      )}

      {/* Aktif siparişler */}
      <ul className="space-y-4">
        {activeOrders.map(o => (
          <li
            key={o.id}
            className={`rounded shadow p-4 ${getBgColor(o.status)}`}
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

            {o.status === "Hazır" && (
              <div className="mt-3 flex gap-2">
                <button
                  className="px-3 py-1 bg-blue-700 text-white rounded"
                  onClick={() => updateOrderStatus(o.id, "Teslim Edildi")}
                >
                  Teslim Edildi
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Geçmiş siparişler toggle */}
      <div className="mt-6">
        <button
          className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800"
          onClick={() => setShowHistory(!showHistory)}
        >
          {showHistory ? "Geçmişi Gizle" : "Geçmiş Siparişleri Göster"}
        </button>

        {showHistory && (
          <div className="mt-4">
            <h3 className="text-xl font-semibold mb-2">Teslim Edilmiş Siparişler</h3>
            {!deliveredOrders.length && (
              <p className="text-gray-500">Geçmiş sipariş yok.</p>
            )}
            <ul className="space-y-3">
              {deliveredOrders.map(o => (
                <li
                  key={o.id}
                  className={`rounded p-3 ${getBgColor(o.status)}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Masa: {o.tableId}</span>
                    <span className="text-sm px-2 py-1 rounded bg-gray-300">
                      {o.status}
                    </span>
                  </div>
                  <ul className="mt-2 list-disc ml-6 text-gray-700 text-sm">
                    {o.items?.map((it, i) => (
                      <li key={i}>{it.name} × {it.qty}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
