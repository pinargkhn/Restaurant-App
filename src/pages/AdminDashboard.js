// src/pages/Admin.js
import React, { useEffect, useState, useMemo } from "react";
import {
  db,
  collectionGroup,
  onSnapshot,
} from "../lib/firebase"; // Lütfen `../lib/firebase` dosyasının doğru olduğundan emin olun.

// 🔹 Alt Panelleri İçe Aktar
import MenuPanel from "./MenuPanel";
import TablePanel from "./TablePanel";
import UserPanel from "./UserPanel";
// 🚀 Analiz Hook'u İçe Aktarılıyor
import useAdminAnalytics from "../hooks/useAdminAnalytics"; 
// 🚀 Grafik Bileşeni İçe Aktarılıyor (Top 5 Sales için)
import TopProductsChart from "../components/TopProductsChart"; 

// -------------------------------------------------------------------
// 🔹 SADECE sıralama fonksiyonu kaldı.
// -------------------------------------------------------------------

// 🔹 Siparişleri özel kurala göre sırala (En yeni ödenen/hazırlanan en üstte)
const compareOrders = (a, b) => {
  if (a.newItemsAdded && !b.newItemsAdded) return -1;
  if (!a.newItemsAdded && b.newItemsAdded) return 1;

  if (a.status === "Hazır" && b.status === "Hazır") {
    return (b.readyAt?.seconds || 0) - (a.readyAt?.seconds || 0);
  }

  const aTime = a.updatedAt?.seconds || a.paymentAt?.seconds || 0;
  const bTime = b.updatedAt?.seconds || b.paymentAt?.seconds || 0;
  return bTime - aTime;
};

// -------------------------------------------------------------------

export default function Admin() {
  const [view, setView] = useState("dashboard"); // 'dashboard', 'menu', 'tables', 'users'
  const [orders, setOrders] = useState([]);
  
  // 🚀 YENİ ANALİZLER HOOK'TAN ÇEKİLİYOR
  const { stats, paidOrders, completedOrders, topProducts, topPrepTimeMeals, topPrepTimeDesserts } = useAdminAnalytics(orders);
  
  // ---------------- Firestore Dinleme (Aynı kalır) ----------------
  useEffect(() => {
    // Aktif siparişleri dinle
    const unsubOrders = onSnapshot(collectionGroup(db, "orders"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOrders((prev) => [
        ...prev.filter((o) => o.source !== "orders"),
        ...data.map((d) => ({ ...d, source: "orders" })),
      ]);
    });
    
    // Geçmiş (ödenmiş) siparişleri dinle
    const unsubPast = onSnapshot(collectionGroup(db, "pastOrders"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOrders((prev) => [
        ...prev.filter((o) => o.source !== "pastOrders"),
        ...data.map((d) => ({ ...d, source: "pastOrders" })),
      ]);
    });

    return () => {
      unsubOrders();
      unsubPast();
    };
  }, []);
  
  // ---------------- VIEW YÖNETİMİ (Aynı kalır) ----------------
  if (view === "menu") {
    return <MenuPanel onBack={() => setView("dashboard")} />;
  }
  if (view === "tables") {
    return <TablePanel onBack={() => setView("dashboard")} />;
  }
  if (view === "users") {
    return <UserPanel onBack={() => setView("dashboard")} />;
  }

  // ---------------- Ana Dashboard (view === "dashboard") ----------------
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold mb-6 text-center">🧑‍💼 Yönetim Paneli (Ana)</h2>

      {/* Navigasyon Butonları */}
      <div className="flex justify-center gap-4 mb-8 p-4 border rounded-lg shadow">
        <button
          onClick={() => setView("menu")} 
          className="bg-pink-600 text-white px-4 py-2 rounded hover:bg-pink-700 transition"
        >
          🍔 Menü Yönetimi
        </button>
        <button
          onClick={() => setView("tables")} 
          className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition"
        >
          🪑 Masa & QR Yönetimi
        </button>
        <button
          onClick={() => setView("users")} 
          className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition"
        >
          👤 Kullanıcı Yönetimi
        </button>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-blue-100 p-4 rounded shadow text-center">
          <h3 className="text-lg font-semibold">Toplam Sipariş</h3>
          <p className="text-2xl font-bold text-blue-700">{stats.totalOrders}</p>
        </div>
        <div className="bg-green-100 p-4 rounded shadow text-center">
          <h3 className="text-lg font-semibold">Ödemesi Alınanlar</h3>
          <p className="text-2xl font-bold text-green-700">{stats.paidCount}</p>
        </div>
        <div className="bg-yellow-100 p-4 rounded shadow text-center">
          <h3 className="text-lg font-semibold">Ortalama Hazırlık Süresi</h3>
          <p className="text-2xl font-bold text-yellow-700">{stats.avgPrepTime} dk</p>
        </div>
      </div>
      
      {/* 1. SATIR: EN ÇOK SATANLAR GRAFİĞİ */}
      <div className="border p-4 rounded-lg shadow mb-8 bg-white">
        <h3 className="text-xl font-semibold mb-4 text-gray-700">
          🏆 En Çok Satan 5 Ürün (Son 7 Gün)
        </h3>
        {topProducts.length > 0 ? (
          <TopProductsChart data={topProducts} /> 
        ) : (
          <p className="text-gray-500">Henüz yeterli ödeme alınmış sipariş yok.</p>
        )}
      </div>

      {/* 🚀 2. SATIR: EN UZUN HAZIRLANMA SÜRELERİ (YAN YANA - TOP 10) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        
        {/* YEMEK KATEGORİSİ */}
        <div className="border p-4 rounded-lg shadow bg-white">
          <h3 className="text-xl font-semibold mb-4 text-gray-700">
            ⏰ En Uzun Hazırlanan Yemekler (Son 7 Gün - Top 10)
          </h3>
          {topPrepTimeMeals.length > 0 ? (
            <ul className="space-y-3 max-h-96 overflow-y-auto">
              {topPrepTimeMeals.map((o, index) => (
                <li key={o.orderId} className="flex justify-between items-center text-sm p-2 border-b last:border-b-0 bg-red-50 rounded">
                  <div>
                    {/* 🚀 GÜNCELLENDİ: Sipariş Numarası ve Saati */}
                    <span className="font-semibold text-gray-800">
                      #{index + 1} - {new Date(o.orderDateTimestamp * 1000).toLocaleTimeString('tr-TR')}
                    </span>
                    <p className="text-xs text-gray-600 mt-1">
                      Ürünler: {o.itemsList}
                    </p>
                  </div>
                  <span className="font-bold text-red-600 text-lg flex-shrink-0 ml-4">
                    {o.time.minutes} dk {o.time.seconds} sn
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">Son 7 günde hazırlanan Yemekler siparişi bulunamadı.</p>
          )}
        </div>
        
        {/* TATLILAR KATEGORİSİ */}
        <div className="border p-4 rounded-lg shadow bg-white">
          <h3 className="text-xl font-semibold mb-4 text-gray-700">
            🍰 En Uzun Hazırlanan Tatlılar (Son 7 Gün - Top 10)
          </h3>
          {topPrepTimeDesserts.length > 0 ? (
            <ul className="space-y-3 max-h-96 overflow-y-auto">
              {topPrepTimeDesserts.map((o, index) => (
                <li key={o.orderId} className="flex justify-between items-center text-sm p-2 border-b last:border-b-0 bg-red-50 rounded">
                  <div>
                    {/* 🚀 GÜNCELLENDİ: Sipariş Numarası ve Saati */}
                    <span className="font-semibold text-gray-800">
                      #{index + 1} - {new Date(o.orderDateTimestamp * 1000).toLocaleTimeString('tr-TR')}
                    </span>
                    <p className="text-xs text-gray-600 mt-1">
                      Ürünler: {o.itemsList}
                    </p>
                  </div>
                  <span className="font-bold text-red-600 text-lg flex-shrink-0 ml-4">
                    {o.time.minutes} dk {o.time.seconds} sn
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">Son 7 günde hazırlanan Tatlılar siparişi bulunamadı.</p>
          )}
        </div>
        
      </div>

      {/* Ödemesi Alınan Siparişler Tablosu (Aynı kalır) */}
      <h3 className="text-xl font-semibold mb-3 text-gray-700">
        💰 Ödemesi Alınan Siparişler
      </h3>
      <table className="w-full border-collapse border border-gray-300 text-sm shadow mb-8">
        <thead className="bg-gray-100">
          <tr>
            <th className="border p-2 text-left">Masa</th>
            <th className="border p-2 text-left">Ödeme Türü</th>
            <th className="border p-2 text-left">Ürünler</th>
            <th className="border p-2 text-left">Hazırlık Süresi</th>
            <th className="border p-2 text-left">Ödeme Tarihi</th>
            <th className="border p-2 text-left">Toplam (₺)</th>
          </tr>
        </thead>
        <tbody>
          {[...paidOrders].sort(compareOrders).map((o) => {
            // CookingTime'ı hook'tan gelen completedOrders'ı kullanarak bul
            const completed = completedOrders.find(co => co.id === o.id);
            const cookingTime = completed?.cookingTime;
            
            const productList = o.items
              ? o.items.map((it) => `${it.name} ×${it.qty || 1}`).join(", ")
              : "-";
              
            // Ödeme tarihi düzeltmesi
            const paymentTimestamp = o.paymentAt?.seconds 
                                     ? o.paymentAt.seconds 
                                     : o.movedAt?.seconds;
                                       
            return (
              <tr key={`${o.id}-${o.tableId}`} className="hover:bg-gray-50">
                <td className="border p-2">{o.tableId || "-"}</td>
                <td className="border p-2 font-medium text-green-700">
                  {o.paymentMethod || "-"}
                </td>
                <td className="border p-2 text-sm text-gray-800">{productList}</td>
                <td className="border p-2 text-center">
                  {cookingTime
                    ? `${cookingTime.minutes} dk ${cookingTime.seconds} sn`
                    : "-"}
                </td>
                <td className="border p-2">
                  {paymentTimestamp
                    ? new Date(paymentTimestamp * 1000).toLocaleString("tr-TR")
                    : "-"}
                </td>
                <td className="border p-2 font-semibold text-right">
                  {o.total ? `${o.total} ₺` : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}