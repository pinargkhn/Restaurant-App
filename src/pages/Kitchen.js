// src/pages/Kitchen.js
import { useEffect, useState } from "react";
import { db, collection, onSnapshot, doc, updateDoc, serverTimestamp } from "../lib/firebase";
import './Kitchen.css'; // 👈 YENİ CSS İÇE AKTAR

export default function Kitchen() {
  const [orders, setOrders] = useState([]);

  // ---------------- HELPER FONKSİYONLAR ----------------
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
  
  // 🔹 YENİ HELPER: En son güncellenen sipariş belgesini bulur.
  const getLatestOrder = (orders) => {
    return orders.sort(
        (a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0)
    )[0];
  };

  // 🔹 Masaya göre siparişleri birleştirir
  const mergeActiveOrdersByTable = (allOrders) => {
    const nonDelivered = allOrders.filter(o => o.status !== "Teslim Edildi");
    const grouped = nonDelivered.reduce((acc, o) => {
      (acc[o.tableId] ||= []).push(o);
      return acc;
    }, {});
    
    return Object.entries(grouped).map(([tableId, list]) => {
      const latest = getLatestOrder(list); // 🔹 EN SON SİPARİŞİ BUL
      
      return {
        tableId,
        id: list.map((x) => x.id),
        orderDocuments: list,
        items: mergeItems(list),
        status: getMergedStatus(list),
        newItemsAdded: getMergedNewItemsAdded(list),
        latestReadyAt: getLatestReadyAt(list),
        note: latest.note || "", // 🚀 NOTE'u EN SON SİPARİŞTEN AL
      };
    });
  };

  // 🔹 CSS Sınıfı döndüren helper
  const getCardClass = (order) => {
    if (order.newItemsAdded) return "status-new-items"; // ⚠️ yeni ürün
    switch (order.status) {
      case "Hazırlanıyor": return "status-preparing";
      case "Hazır":        return "status-ready";
      default:             return "status-new";
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

  // ---------------- FIRESTORE DİNLEME ----------------
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

  // ---------------- Durum Güncelleme ----------------
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

  // ---------------- RENDER ----------------
  return (
    <div className="kitchen-container">
      <h2 className="kitchen-title">🍳 Mutfak Paneli</h2>
      {!orders.length && <p className="empty-text">Henüz sipariş yok.</p>}

      <ul className="kitchen-order-list">
        {orders
          .filter(o => o.status !== "Teslim Edildi")
          .sort(compareOrders)
          .map(o => (
            <li key={o.tableId} className={`kitchen-order-card ${getCardClass(o)}`}>
              <div className="card-header">
                <span className="table-id">
                  Masa: {o.tableId}
                </span>
                {o.newItemsAdded && (
                  <span className="new-item-alert">
                    ⚠️ Yeni ürün eklendi – Garson bilgilendirildi
                  </span>
                )}
                <span className="order-status-badge">
                  {o.status}
                </span>
              </div>
              
              {o.note && (
                  <div className="order-note">
                      <strong>Not:</strong> {o.note}
                  </div>
              )}

              <ul className="order-items-list">
                {o.items?.map((it, i) => (
                  <li key={i}>{it.name} × {it.qty}</li>
                ))}
              </ul>

              <div className="card-actions">
                <button
                  className="button button-yellow"
                  onClick={() => handleStatusChange(o, "Hazırlanıyor")}
                >
                  👨‍🍳 Hazırlanıyor
                </button>
                <button
                  className="button button-green"
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