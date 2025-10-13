import { useEffect, useState, useMemo } from "react";
import { db, collection, onSnapshot, doc, updateDoc } from "../lib/firebase";

export default function Kitchen() {
  const [orders, setOrders] = useState([]);

  // ---------------- YARDIMCI VE BİRLEŞTİRME (MERGE) LOGİĞİ ----------------
  
  // Sipariş ürünlerini birleştirir (aynı ürünlerin miktarlarını toplar)
  const mergeItems = (orders) => {
    const combinedItems = {};
    orders.forEach(order => {
        (order.items || []).forEach(item => {
            const key = item.id;
            if (combinedItems[key]) {
                combinedItems[key].qty += item.qty;
            } else {
                combinedItems[key] = { ...item };
            }
        });
    });
    return Object.values(combinedItems);
  };

  // Birleştirilmiş siparişin durumunu belirler (Hazır > Hazırlanıyor > Yeni)
  const getMergedStatus = (orders) => {
    if (orders.some(o => o.status === "Hazır")) return "Hazır";
    if (orders.some(o => o.status === "Hazırlanıyor")) return "Hazırlanıyor";
    // Mutfak, sadece aktif siparişleri (Teslim Edilmemiş) görür.
    return "Yeni";
  };
  
  // Birleştirilmiş siparişte yeni ürün eklenmiş mi kontrolü
  const getMergedNewItemsAdded = (orders) => {
    return orders.some(o => o.newItemsAdded === true);
  };

  // Birleştirilmiş sipariş için en son readyAt zamanını bul
  const getLatestReadyAt = (orders) => {
      // Sadece Hazır durumundakilerin hazır olduğu zamanı al
      const readyOrders = orders.filter(o => o.status === "Hazır");
      if (readyOrders.length === 0) return null;
      
      return readyOrders.sort((a, b) => (b.readyAt?.seconds || 0) - (a.readyAt?.seconds || 0))[0].readyAt;
  };

  /**
   * Aynı masa ID'sine sahip ve TESLİM EDİLMEMİŞ/ÖDENMEMİŞ siparişleri tek bir satırda birleştirir.
   */
  const mergeActiveOrdersByTable = (allOrders) => {
    // 1. Sadece Teslim Edilmemiş siparişleri al
    const nonDeliveredOrders = allOrders.filter(o => o.status !== "Teslim Edildi");

    // 2. Masa ID'sine göre grupla
    const groupedOrders = nonDeliveredOrders.reduce((acc, order) => {
        acc[order.tableId] = acc[order.tableId] || [];
        acc[order.tableId].push(order);
        return acc;
    }, {});

    // 3. Her grubu tek bir birleştirilmiş sipariş nesnesine dönüştür
    return Object.entries(groupedOrders).map(([tableId, tableOrders]) => {
        // En son güncellenen belgeyi bul (sıralama için)
        const latestOrder = tableOrders.sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0))[0];

        return {
            tableId,
            // 🚨 Önemli: id artık tüm alt belge ID'lerinin dizisidir
            id: tableOrders.map(o => o.id), 
            orderDocuments: tableOrders, // Eylemler için orijinal belgeler

            // Mutfak panelinde toplam fiyata ihtiyacımız yok
            // total: tableOrders.reduce((sum, o) => sum + (o.total || 0), 0), 
            items: mergeItems(tableOrders),
            status: getMergedStatus(tableOrders),
            newItemsAdded: getMergedNewItemsAdded(tableOrders),

            createdAt: latestOrder.createdAt,
            updatedAt: latestOrder.updatedAt,
            readyAt: getLatestReadyAt(tableOrders), // En son 'Hazır' zamanı
            startCookingAt: latestOrder.startCookingAt, // En son pişirme başlangıcı
        };
    });
  };

  // ---------------- FIRESTORE (DEĞİŞTİRİLDİ) ----------------
  useEffect(() => {
    const tablesRef = collection(db, "tables");
    const unsubscribeTables = onSnapshot(tablesRef, (tablesSnap) => {
      const unsubscribers = [];
      let allOrders = []; // Tüm aktif alt siparişleri tutar

      tablesSnap.forEach((tableDoc) => {
        const tableId = tableDoc.id;
        const ordersRef = collection(db, "tables", tableId, "orders");

        const unsub = onSnapshot(ordersRef, (ordersSnap) => {
          // Bu masa ID'sine ait eski siparişleri temizle
          allOrders = allOrders.filter((o) => o.tableId !== tableId);
          
          // Yeni siparişleri ekle
          const newOrders = ordersSnap.docs.map((d) => ({
              id: d.id,
              tableId,
              ...d.data(),
          }));

          allOrders = allOrders.concat(newOrders);
          
          // Tüm siparişleri birleştir ve state'e set et
          setOrders(mergeActiveOrdersByTable(allOrders));
        });

        unsubscribers.push(unsub);
      });

      return () => unsubscribers.forEach((u) => u());
    });

    // İlk abonelikten dönen temizleme fonksiyonu
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

  // 🔹 Siparişleri özel kurala göre sırala
  const compareOrders = (a, b) => {
    if (a.newItemsAdded && !b.newItemsAdded) return -1;
    if (!a.newItemsAdded && b.newItemsAdded) return 1;

    if (a.status === "Hazır" && b.status === "Hazır") {
      // En son hazır olan en üstte
      return (b.readyAt?.seconds || 0) - (a.readyAt?.seconds || 0);
    }

    const aTime = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
    const bTime = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
    // En son güncellenen/oluşturulan en üstte
    return bTime - aTime;
  };

  // 🔹 Sipariş durumunu güncelleme (GÜNCELLENDİ)
  // Mutfak, sadece BİR alt siparişin durumunu günceller.
  const handleStatusChange = async (mergedOrder, newStatus) => {
    if (!mergedOrder.tableId) {
      console.error("❌ order.tableId eksik:", mergedOrder);
      return;
    }

    try {
      // 🚨 Değişiklik: Eğer sipariş birleşmişse, durumu güncelleyeceğimiz belgeyi seçmeliyiz.
      // Hangi siparişin durumu değişiyorsa o alt sipariş belgesini bulup güncelleyebiliriz.
      // Basitlik adına, sadece en son sipariş belgesini güncelleyelim.
      
      const targetOrder = mergedOrder.orderDocuments
          // Henüz Hazır/Teslim Edildi olmayan, en yeni siparişi bul
          .filter(o => o.status !== "Hazır" && o.status !== "Teslim Edildi")
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0] 
          || mergedOrder.orderDocuments[0]; // Veya ilk belgeyi al

      const ref = doc(db, "tables", mergedOrder.tableId, "orders", targetOrder.id);
      const updateData = { status: newStatus };

      if (newStatus === "Hazırlanıyor") {
        updateData.startCookingAt = new Date();
        // Hazırlanmaya başlandığında yeni ürün uyarısını kaldır (Garsonun düzenlemesi bitti)
        updateData.newItemsAdded = false; 
      } else if (newStatus === "Hazır") {
        updateData.readyAt = new Date();
      }

      await updateDoc(ref, updateData);

      alert(`✅ ${mergedOrder.tableId} masası (Sipariş: ${targetOrder.id.substring(0, 4)}...) durumu '${newStatus}' olarak güncellendi.`);
    } catch (err) {
      console.error("❌ Firestore güncelleme hatası:", err);
      alert("Güncelleme hatası oluştu. Console'u kontrol et.");
    }
  };

  // ---------------- RENDER ----------------
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">🍳 Mutfak Paneli</h2>

      {!orders.length && <p className="text-gray-500">Henüz sipariş yok.</p>}

      <ul className="space-y-4">
        {orders
          // Teslim Edilmiş (Waiter.js'de filtreleniyordu, burada da filtreliyoruz)
          .filter((o) => o.status !== "Teslim Edildi") 
          .sort(compareOrders)
          .map((o) => (
            // Key olarak tableId kullanıyoruz çünkü siparişler birleştirildi
            <li key={o.tableId} className={`rounded shadow p-4 ${getBgColor(o.status)}`}>
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

              {/* Birleştirilmiş Ürün Listesi */}
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