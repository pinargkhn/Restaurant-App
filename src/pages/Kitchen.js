import { useEffect, useState } from "react";
import { db, collection, onSnapshot } from "../lib/firebase";
import { updateOrderStatus } from "../lib/orders";

export default function Kitchen() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const tablesRef = collection(db, "tables");
    const unsubscribeTables = onSnapshot(tablesRef, (tablesSnap) => {
      const unsubscribers = [];

      // Her tabloyu dinle
      tablesSnap.forEach((tableDoc) => {
        const tableId = tableDoc.id;
        const ordersRef = collection(db, "tables", tableId, "orders");

        const unsub = onSnapshot(ordersRef, (ordersSnap) => {
          setOrders((prevOrders) => {
            // Önce bu masaya ait eski siparişleri temizle
            const filtered = prevOrders.filter((o) => o.tableId !== tableId);

            // Yeni snapshot'tan gelen siparişleri ekle
            const newOrders = ordersSnap.docs.map((d) => ({
              id: d.id,
              tableId,
              ...d.data(),
            }));

            return [...filtered, ...newOrders];
          });
        });

        unsubscribers.push(unsub);
      });

      // cleanup
      return () => unsubscribers.forEach((u) => u());
    });

    return () => unsubscribeTables();
  }, []);

  const getBgColor = (status) => {
    switch (status) {
      case "Hazırlanıyor":
        return "bg-yellow-100";
      case "Hazır":
        return "bg-green-200";
      default:
        return "bg-white";
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Mutfak Paneli</h2>

      {!orders.length && <p className="text-gray-500">Henüz sipariş yok.</p>}

      <ul className="space-y-4">
        {orders
          .filter((o) => o.status !== "Teslim Edildi")
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
          .map((o) => (
            <li
              key={`${o.tableId}-${o.id}`}
              className={`rounded shadow p-4 ${getBgColor(o.status)}`}
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold">Masa: {o.tableId}</span>
                <span className="text-sm px-2 py-1 rounded bg-gray-100">{o.status}</span>
              </div>

              <ul className="mt-2 list-disc ml-6 text-gray-700 text-sm">
                {o.items?.map((it, i) => (
                  <li key={i}>
                    {it.name} × {it.qty}
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex gap-2">
                <button
                  className="px-3 py-1 bg-yellow-600 text-white rounded"
                  onClick={() => updateOrderStatus(o.tableId, o.id, "Hazırlanıyor")}
                >
                  Hazırlanıyor
                </button>
                <button
                  className="px-3 py-1 bg-green-700 text-white rounded"
                  onClick={() => updateOrderStatus(o.tableId, o.id, "Hazır")}
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
