// src/pages/Kitchen.js
import { useEffect, useState } from "react";
// 👈 serverTimestamp import edildi
import { db, collection, onSnapshot, doc, updateDoc, serverTimestamp } from "../lib/firebase";
import './Kitchen.css'; // Stil dosyası

export default function Kitchen() {
  const [orders, setOrders] = useState([]); // Birleştirilmiş ve filtrelenmiş siparişler

  // --- Helper Fonksiyonlar ---
  // Ürünleri birleştirir (Adetleri toplar)
  const mergeItems = (orders) => {
    const combinedItems = {};
    orders.forEach(order => {
      (order.items || []).forEach(item => {
        const key = item.id;
        if (combinedItems[key]) {
          combinedItems[key].qty += (Number(item.qty) || 0);
        } else {
          // Yeni ürün eklerken qty'nin sayı olduğundan emin ol
          combinedItems[key] = { ...item, qty: (Number(item.qty) || 0) };
        }
      });
    });
    return Object.values(combinedItems);
  };

  // Birleştirilmiş durumu belirler (Hazır > Hazırlanıyor > Yeni)
  const getMergedStatus = (orders) => {
    if (orders.some(o => o.status === "Hazır")) return "Hazır";
    if (orders.some(o => o.status === "Hazırlanıyor")) return "Hazırlanıyor";
    return "Yeni";
  };

  // Yeni ürün eklenip eklenmediğini kontrol eder
  const getMergedNewItemsAdded = (orders) =>
    orders.some(o => o.newItemsAdded === true);

  // En son 'Hazır' olma zamanını bulur
  const getLatestReadyAt = (orders) => {
    const readyOrders = orders.filter(o => o.status === "Hazır" && o.readyAt);
    if (!readyOrders.length) return null;
    // Zaman damgalarına göre en yeniyi bul
    return readyOrders.sort((a, b) => (b.readyAt?.seconds || 0) - (a.readyAt?.seconds || 0))[0].readyAt;
  };

  // Belge listesindeki en son güncellenen/oluşturulan belgeyi bulur
  const getLatestOrder = (orders) => {
    if (!orders || orders.length === 0) return {}; // Boşsa boş nesne döndür
    return [...orders].sort( // Orijinal diziyi değiştirmemek için kopyala
        (a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0)
    )[0];
  };

  // Aktif (Teslim Edilmemiş) siparişleri masaya göre birleştirir
  const mergeActiveOrdersByTable = (allOrders) => {
    const nonDelivered = allOrders.filter(o => o.status !== "Teslim Edildi");
    const grouped = nonDelivered.reduce((acc, o) => {
      (acc[o.tableId] ||= []).push(o); // Masaya göre grupla
      return acc;
    }, {});

    // Her masa grubu için birleştirilmiş sipariş nesnesi oluştur
    return Object.entries(grouped).map(([tableId, list]) => {
      const latestDoc = getLatestOrder(list); // En son belgeyi al (not vb. için)
      return {
        tableId,
        id: list.map((x) => x.id), // Alt sipariş ID'leri
        orderDocuments: list, // Orijinal alt sipariş belgeleri
        items: mergeItems(list), // Birleştirilmiş ürünler
        status: getMergedStatus(list), // Birleştirilmiş durum
        newItemsAdded: getMergedNewItemsAdded(list), // Uyarı durumu
        latestReadyAt: getLatestReadyAt(list), // Son hazır olma zamanı (sıralama için)
        note: latestDoc.note || "", // En son belgedeki not
      };
    });
  };

  // Sipariş kartının arka plan rengi için CSS sınıfını döndürür
  const getCardClass = (order) => {
    if (order.newItemsAdded) return "status-new-items"; // Yeni ürün varsa
    switch (order.status) {
      case "Hazırlanıyor": return "status-preparing"; // Hazırlanıyorsa
      case "Hazır": return "status-ready"; // Hazırsa
      default: return "status-new"; // Yeni ise
    }
  };

  // Siparişleri sıralamak için (Uyarı > Zaman)
  const compareOrders = (a, b) => {
    if (a.newItemsAdded && !b.newItemsAdded) return -1; // Uyarı olanlar en üste
    if (!a.newItemsAdded && b.newItemsAdded) return 1;

    // Hazır siparişleri kendi içinde hazır olma zamanına göre sırala (en yeni hazır olan üste)
    if (a.status === "Hazır" && b.status === "Hazır") {
        return (b.latestReadyAt?.seconds || 0) - (a.latestReadyAt?.seconds || 0);
    }
    // Diğerlerini en son güncelleme/oluşturma zamanına göre sırala (en yeni üste)
    const aLatestDoc = getLatestOrder(a.orderDocuments || []);
    const bLatestDoc = getLatestOrder(b.orderDocuments || []);
    const at = aLatestDoc.updatedAt?.seconds || aLatestDoc.createdAt?.seconds || 0;
    const bt = bLatestDoc.updatedAt?.seconds || bLatestDoc.createdAt?.seconds || 0;
    return bt - at;
  };
  // --- Helper Fonksiyonlar Bitiş ---

  // --- Firestore Dinleme ---
  useEffect(() => {
    const tablesRef = collection(db, "tables");
    let allCurrentOrders = []; // Tüm aktif siparişleri (tüm masalardan) tutacak dizi
    let tableListeners = {}; // Hangi masaların dinlendiğini takip etmek için

    // Tüm masaları dinle
    const unsubTables = onSnapshot(tablesRef, (tablesSnap) => {
      const currentTableIds = tablesSnap.docs.map(doc => doc.id);
      const newUnsubscribers = {}; // Yeni dinleyicileri tut

      // Yeni veya mevcut masalar için sipariş dinleyicilerini başlat/güncelle
      tablesSnap.forEach((t) => {
        const tableId = t.id;
        // Eğer bu masa için zaten bir dinleyici varsa, onu koru
        if (tableListeners[tableId]) {
          newUnsubscribers[tableId] = tableListeners[tableId];
          delete tableListeners[tableId]; // Eskisinden çıkar
        } else {
          // Yeni masa için dinleyici başlat
          console.log(`Starting listener for new table: ${tableId}`);
          const ordersRef = collection(db, "tables", tableId, "orders");
          const unsubOrderListener = onSnapshot(ordersRef, (snap) => {
            const newTableOrders = snap.docs.map(d => ({ id: d.id, tableId: tableId, ...d.data() }));
            // Ana sipariş listesini güncelle (bu masanın eskilerini çıkar, yenilerini ekle)
            allCurrentOrders = [...allCurrentOrders.filter(o => o.tableId !== tableId), ...newTableOrders];
            // Birleştirilmiş siparişleri hesapla ve state'i güncelle
            setOrders(mergeActiveOrdersByTable(allCurrentOrders));
          }, (error) => console.error(`Error listening to orders for table ${tableId}:`, error));
          newUnsubscribers[tableId] = unsubOrderListener; // Yeni dinleyiciyi kaydet
        }
      });

      // Artık var olmayan masaların dinleyicilerini durdur
      Object.values(tableListeners).forEach(unsub => unsub());

      // Dinleyici listesini güncelle
      tableListeners = newUnsubscribers;

      // Artık var olmayan masaların siparişlerini ana listeden kaldır
      allCurrentOrders = allCurrentOrders.filter(o => currentTableIds.includes(o.tableId));
      setOrders(mergeActiveOrdersByTable(allCurrentOrders)); // State'i son kez güncelle

    }, (error) => console.error("Error listening to tables collection:", error));

    // Component unmount olduğunda tüm dinleyicileri temizle
    return () => {
      console.log("Stopping all Firestore listeners in Kitchen...");
      unsubTables();
      Object.values(tableListeners).forEach(unsub => unsub());
      tableListeners = {}; // Listeyi temizle
    };
  }, []); // Sadece component mount olduğunda çalışır

  // --- Durum Güncelleme Fonksiyonu (Zaman Damgaları Eklenmiş) ---
  const handleStatusChange = async (mergedOrder, newStatus) => {
    // Gerekli verilerin varlığını kontrol et
    if (!mergedOrder?.tableId || !mergedOrder.orderDocuments || mergedOrder.orderDocuments.length === 0) {
        console.error("❌ Geçersiz sipariş verisi:", mergedOrder);
        alert("Sipariş durumu güncellenemedi: Eksik veya geçersiz veri.");
        return;
    }

    console.log(`Durum değiştiriliyor: Masa ${mergedOrder.tableId} -> ${newStatus}`);
    try {
      // Bu masaya ait TÜM aktif (yani teslim edilmemiş) alt sipariş belgelerini güncelle
      for (const subOrderDoc of mergedOrder.orderDocuments) {
        // Belge referansını al
        const orderRef = doc(db, "tables", mergedOrder.tableId, "orders", subOrderDoc.id);

        // Güncellenecek verileri hazırla
        const updateData = {
          status: newStatus,
          newItemsAdded: false, // <-- UYARIYI HER DURUMDA KALDIR
          updatedAt: serverTimestamp(), // Güncelleme zamanını ayarla
        };

        // Eğer durum "Hazır" ise 'readyAt' zaman damgasını ekle
        // Sadece durum gerçekten değişiyorsa veya readyAt yoksa ekle
        if (newStatus === "Hazır" && (subOrderDoc.status !== "Hazır" || !subOrderDoc.readyAt)) {
          updateData.readyAt = serverTimestamp();
        }
        // Eğer durum "Hazırlanıyor" ise ve siparişin mevcut durumu 'Yeni' ise 'startCookingAt' ekle
        else if (newStatus === "Hazırlanıyor" && subOrderDoc.status === "Yeni") {
           // startCookingAt zaten varsa üzerine yazma (ilk başlangıç zamanı önemliyse)
           if (!subOrderDoc.startCookingAt) {
               updateData.startCookingAt = serverTimestamp();
           }
        }

        // Firestore belgesini güncelle
        await updateDoc(orderRef, updateData);
        console.log(` - Alt sipariş güncellendi: ${subOrderDoc.id} -> ${newStatus}, newItemsAdded: false, Timestamps added/updated.`);
      }
      console.log(`✅ ${mergedOrder.tableId} masasının tüm alt siparişleri '${newStatus}' olarak güncellendi.`);
    } catch (err) {
      console.error(`❌ Firestore güncelleme hatası (${mergedOrder.tableId}):`, err);
      alert("Sipariş durumu güncellenirken bir hata oluştu. Lütfen konsolu kontrol edin.");
    }
  };
  // --- Durum Güncelleme Bitiş ---

  // --- RENDER ---
  return (
    <div className="kitchen-container">
      <h2 className="kitchen-title">🍳 Mutfak Paneli</h2>
      {/* Yükleniyor veya boş durumu gösterilebilir */}
      {/* {loading && <p>Yükleniyor...</p>} */}
      {!orders.length && <p className="empty-text">Henüz aktif sipariş yok.</p>}

      <ul className="kitchen-order-list">
        {orders
          // Sırala (en yeni veya uyarılı olan üste)
          .sort(compareOrders)
          // Listele
          .map(o => (
            <li key={o.tableId} className={`kitchen-order-card ${getCardClass(o)}`}>
              {/* Kart Başlığı */}
              <div className="card-header">
                <span className="table-id"> Masa: {o.tableId} </span>
                {o.newItemsAdded && (
                  <span className="new-item-alert"> ⚠️ Yeni ürün eklendi – Garson bilgilendirildi </span>
                )}
                <span className="order-status-badge"> {o.status} </span>
              </div>

              {/* Not */}
              {o.note && ( <div className="order-note"> <strong>Not:</strong> {o.note} </div> )}

              {/* Ürünler */}
              <ul className="order-items-list">
                {o.items?.map((it, index) => ( <li key={`${it.id}-${index}`}>{it.name} × {it.qty || 1}</li> ))}
              </ul>

              {/* Butonlar */}
              <div className="card-actions">
                <button
                  className="button button-yellow"
                  onClick={() => handleStatusChange(o, "Hazırlanıyor")}
                  // Zaten o durumda veya ilerisindeyse disable et
                  disabled={o.status === "Hazırlanıyor" || o.status === "Hazır"}
                >
                  👨‍🍳 Hazırlanıyor
                </button>
                <button
                  className="button button-green"
                  onClick={() => handleStatusChange(o, "Hazır")}
                  // Zaten o durumda ise disable et
                  disabled={o.status === "Hazır"}
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