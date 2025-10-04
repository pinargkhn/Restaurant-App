import { useEffect, useState } from "react";
import { db, collection, onSnapshot } from "../lib/firebase";
import { updateOrderStatus, moveToPastOrders } from "../lib/orders";

export default function Waiter() {
  const [orders, setOrders] = useState([]);
  const [pastOrders, setPastOrders] = useState([]);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    const tablesRef = collection(db, "tables");
    const unsubTables = onSnapshot(tablesRef, (tablesSnap) => {
      const unsubscribers = [];

      tablesSnap.forEach((tableDoc) => {
        const tableId = tableDoc.id;
        const ordersRef = collection(db, "tables", tableId, "orders");
        const pastOrdersRef = collection(db, "tables", tableId, "pastOrders");

        // 🔹 Aktif siparişleri dinle
        const unsubOrders = onSnapshot(ordersRef, (ordersSnap) => {
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

        // 🔹 Geçmiş siparişleri dinle
        const unsubPast = onSnapshot(pastOrdersRef, (pastSnap) => {
          setPastOrders((prev) => {
            const filtered = prev.filter((o) => o.tableId !== tableId);
            const newPast = pastSnap.docs.map((d) => ({
              id: d.id,
              tableId,
              ...d.data(),
            }));
            return [...filtered, ...newPast];
          });
        });

        unsubscribers.push(unsubOrders, unsubPast);
      });

      return () => unsubscribers.forEach((u) => u());
    });

    return () => unsubTables();
  }, []);

  // 🔹 Renk durumları
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

  // 🔹 Teslim Edildi işlemi
  const handleDelivered = async (order) => {
    try {
      await updateOrderStatus(order.tableId, order.id, "Teslim Edildi");
      await moveToPastOrders(order.tableId, order.id, order);

      // 🧹 State’ten anında kaldır
      setOrders((prev) =>
        prev.filter((o) => !(o.id === order.id && o.tableId === order.tableId))
      );
    } catch (err) {
      console.error("Teslim işlemi hatası:", err);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Garson Paneli</h2>

      <h3 className="text-lg font-semibold mb-2">Aktif Siparişler</h3>
      {!orders.length && <p className="text-gray-500">Aktif sipariş yok.</p>}

      {orders
        .filter((o) => o.status !== "Teslim Edildi")
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .map((o) => (
          <div
            key={`${o.tableId}-${o.id}`}
            className={`p-3 border rounded mb-3 ${getBgColor(o.status)}`}
          >
            <p className="font-semibold">Masa: {o.tableId}</p>
            <p>
              <strong>Ürünler:</strong>{" "}
              {o.items.map((i) => `${i.name} x${i.qty}`).join(", ")}
            </p>
            <p>
              <strong>Durum:</strong>{" "}
              <span className="px-2 py-0.5 bg-gray-100 rounded">{o.status}</span>
            </p>

            <div className="mt-3">
              <button
                onClick={() => handleDelivered(o)}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Teslim Edildi
              </button>
            </div>
          </div>
        ))}

      <button
        onClick={() => setShowPast(!showPast)}
        className="mt-4 px-4 py-2 bg-gray-700 text-white rounded"
      >
        {showPast ? "Geçmişi Gizle" : "Geçmiş Siparişleri Göster"}
      </button>

      {showPast && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold">Geçmiş Siparişler</h3>
          {!pastOrders.length && (
            <p className="text-gray-500">Geçmiş sipariş yok.</p>
          )}

          {pastOrders
            // 🔹 24 saatten eski siparişleri gösterme
            .filter((o) => {
              if (!o.movedAt?.seconds) return true;
              const now = Date.now();
              const moved = o.movedAt.seconds * 1000;
              return now - moved < 24 * 60 * 60 * 1000; // 24 saat
            })
            // 🔹 En yeni siparişleri en üste sırala
            .sort(
              (a, b) =>
                (b.movedAt?.seconds || 0) - (a.movedAt?.seconds || 0)
            )
            .map((o) => (
              <div
                key={`${o.tableId}-${o.id}`}
                className="p-2 border mb-2 bg-gray-100"
              >
                <p>
                  <strong>Masa:</strong> {o.tableId}
                </p>
                <p>
                  <strong>Ürünler:</strong>{" "}
                  {o.items.map((i) => `${i.name} x${i.qty}`).join(", ")}
                </p>
                <p>
                  <strong>Durum:</strong> {o.status}</p>
                <p className="text-sm text-gray-500">
                  {o.movedAt
                    ? new Date(o.movedAt.seconds * 1000).toLocaleString("tr-TR")
                    : ""}
                </p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
