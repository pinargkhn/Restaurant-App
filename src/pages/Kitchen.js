import { useEffect, useState } from "react";
import { db, collection, onSnapshot, doc, updateDoc } from "../lib/firebase";

export default function Kitchen() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const tablesRef = collection(db, "tables");
    const unsubscribeTables = onSnapshot(tablesRef, (tablesSnap) => {
      const unsubscribers = [];

      tablesSnap.forEach((tableDoc) => {
        const tableId = tableDoc.id;
        const ordersRef = collection(db, "tables", tableId, "orders");

        const unsub = onSnapshot(ordersRef, (ordersSnap) => {
          setOrders((prev) => {
            const filtered = prev.filter((o) => o.tableId !== tableId);
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

  // 🔹 Sipariş durumunu güncelleme
  const handleStatusChange = async (order, newStatus) => {
    if (!order.tableId || !order.id) {
      console.error("❌ order.tableId veya order.id eksik:", order);
      return;
    }

    try {
      const ref = doc(db, "tables", order.tableId, "orders", order.id);

      // 🔥 Hazırlanıyor: startCookingAt eklenecek
      if (newStatus === "Hazırlanıyor") {
        await updateDoc(ref, {
          status: newStatus,
          startCookingAt: new Date(),
        });
      }
      // 🔥 Hazır: readyAt eklenecek
      else if (newStatus === "Hazır") {
        await updateDoc(ref, {
          status: newStatus,
          readyAt: new Date(),
        });
      } else {
        await updateDoc(ref, { status: newStatus });
      }

      alert(`✅ ${order.tableId} masası '${newStatus}' olarak işaretlendi.`);
    } catch (err) {
      console.error("❌ Firestore güncelleme hatası:", err);
      alert("Güncelleme hatası oluştu. Console'u kontrol et.");
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">🍳 Mutfak Paneli</h2>

      {!orders.length && <p className="text-gray-500">Henüz sipariş yok.</p>}

      <ul className="space-y-4">
        {orders
          .filter((o) => o.status !== "Teslim Edildi")
          .sort(
            (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
          )
          .map((o) => (
            <li
              key={`${o.tableId}-${o.id}`}
              className={`rounded shadow p-4 ${getBgColor(o.status)}`}
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold">
                  Masa: {o.tableId}
                  {o.newItemsAdded && (
                    <span className="ml-2 text-red-600 font-semibold animate-pulse">
                      ⚠️ Yeni ürün eklendi
                    </span>
                  )}
                </span>
                <span className="text-sm px-2 py-1 rounded bg-gray-100">
                  {o.status}
                </span>
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
                  className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                  onClick={() => handleStatusChange(o, "Hazırlanıyor")}
                >
                  👨‍🍳 Hazırlanıyor
                </button>
                <button
                  className="px-3 py-1 bg-green-700 text-white rounded hover:bg-green-800"
                  onClick={() => handleStatusChange(o, "Hazır")}
                >
                  ✅ Hazır
                </button>
              </div>
            </li>
          ))}
      </ul>
    </div>
  );
}
