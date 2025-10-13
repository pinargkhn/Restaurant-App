// src/pages/Kitchen.js
import { useEffect, useState } from "react";
import { db, collection, onSnapshot, doc, updateDoc } from "../lib/firebase";

export default function Kitchen() {
  const [orders, setOrders] = useState([]);

  const mergeItems = (orders) => {
    const combinedItems = {};
    orders.forEach(order => {
      (order.items || []).forEach(item => {
        const key = item.id;
        if (combinedItems[key]) combinedItems[key].qty += item.qty;
        else combinedItems[key] = { ...item };
      });
    });
    return Object.values(combinedItems);
  };

  const getMergedStatus = (orders) => {
    if (orders.some(o => o.status === "Hazır")) return "Hazır";
    if (orders.some(o => o.status === "Hazırlanıyor")) return "Hazırlanıyor";
    return "Yeni";
  };

  const getMergedNewItemsAdded = (orders) =>
    orders.some(o => o.newItemsAdded === true);

  const getLatestReadyAt = (orders) => {
    const ready = orders.filter(o => o.status === "Hazır");
    if (!ready.length) return null;
    return ready.sort((a,b)=>(b.readyAt?.seconds||0)-(a.readyAt?.seconds||0))[0].readyAt;
  };

  const mergeActiveOrdersByTable = (allOrders) => {
    const nonDelivered = allOrders.filter(o => o.status !== "Teslim Edildi");
    const grouped = nonDelivered.reduce((acc, o) => {
      (acc[o.tableId] ||= []).push(o);
      return acc;
    }, {});
    return Object.entries(grouped).map(([tableId, tableOrders]) => {
      const latest = tableOrders.sort((a,b)=>
        (b.updatedAt?.seconds||b.createdAt?.seconds||0) -
        (a.updatedAt?.seconds||a.createdAt?.seconds||0)
      )[0];
      return {
        tableId,
        id: tableOrders.map(o=>o.id),
        orderDocuments: tableOrders,
        items: mergeItems(tableOrders),
        status: getMergedStatus(tableOrders),
        newItemsAdded: getMergedNewItemsAdded(tableOrders), // ✅ uyarı flag
        createdAt: latest.createdAt,
        updatedAt: latest.updatedAt,
        readyAt: getLatestReadyAt(tableOrders),
        startCookingAt: latest.startCookingAt,
      };
    });
  };

  useEffect(() => {
    const tablesRef = collection(db, "tables");
    const unsubTables = onSnapshot(tablesRef, (tablesSnap) => {
      const unsubscribers = [];
      let all = [];
      tablesSnap.forEach((t) => {
        const ordersRef = collection(db, "tables", t.id, "orders");
        const unsub = onSnapshot(ordersRef, (snap) => {
          all = all.filter(o => o.tableId !== t.id).concat(
            snap.docs.map(d => ({ id: d.id, tableId: t.id, ...d.data() }))
          );
          setOrders(mergeActiveOrdersByTable(all));
        });
        unsubscribers.push(unsub);
      });
      return () => unsubscribers.forEach(u=>u());
    });
    return () => unsubTables();
  }, []);

  const getBgColor = (order) => {
    if (order.newItemsAdded) return "bg-red-100";     // ⚠️ yeni ürün → kırmızı
    switch (order.status) {
      case "Hazırlanıyor": return "bg-yellow-100";
      case "Hazır":        return "bg-green-200";
      default:             return "bg-white";
    }
  };

  const compareOrders = (a, b) => {
    if (a.newItemsAdded && !b.newItemsAdded) return -1;
    if (!a.newItemsAdded && b.newItemsAdded) return 1;
    if (a.status === "Hazır" && b.status === "Hazır")
      return (b.readyAt?.seconds||0)-(a.readyAt?.seconds||0);
    const at = a.updatedAt?.seconds||a.createdAt?.seconds||0;
    const bt = b.updatedAt?.seconds||b.createdAt?.seconds||0;
    return bt - at;
  };

  const handleStatusChange = async (mergedOrder, newStatus) => {
    if (!mergedOrder.tableId) return;
    try {
      if (newStatus === "Hazır") {
        // ✅ tüm alt siparişleri Hazır yap ve uyarıyı kaldır
        for (const sub of mergedOrder.orderDocuments) {
          const ref = doc(db, "tables", mergedOrder.tableId, "orders", sub.id);
          await updateDoc(ref, {
            status: "Hazır",
            readyAt: new Date(),
            newItemsAdded: false,  // ✅ sadece burada sıfırla
          });
        }
      } else if (newStatus === "Hazırlanıyor") {
        // 🔹 sadece en yeni belgeyi güncelle; uyarıyı KALDIRMA
        const target = mergedOrder.orderDocuments.sort(
          (a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)
        )[0];
        const ref = doc(db, "tables", mergedOrder.tableId, "orders", target.id);
        await updateDoc(ref, {
          status: "Hazırlanıyor",
          startCookingAt: new Date(),
          // newItemsAdded: (dokunma) → uyarı devam eder
        });
      }
      alert(`✅ ${mergedOrder.tableId} masası '${newStatus}' olarak güncellendi.`);
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
          .filter(o => o.status !== "Teslim Edildi")
          .sort(compareOrders)
          .map(o => (
            <li key={o.tableId} className={`rounded shadow p-4 ${getBgColor(o)}`}>
              <div className="flex justify-between items-center">
                <span className="font-semibold">
                  Masa: {o.tableId}
                  {o.newItemsAdded && (
                    <span className="ml-2 text-red-600 font-semibold animate-pulse">
                      ⚠️ Yeni ürün eklendi – Garson bilgilendirildi
                    </span>
                  )}
                </span>
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
