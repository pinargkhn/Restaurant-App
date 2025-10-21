// src/pages/AdminDashboard.js
import React, { useEffect, useState, useMemo } from "react";
import {
  db,
  collectionGroup,
  onSnapshot,
} from "../lib/firebase";
import MenuPanel from "./MenuPanel";
import TablePanel from "./TablePanel";
import UserPanel from "./UserPanel";
import useAdminAnalytics from "../hooks/useAdminAnalytics"; 
import TopProductsChart from "../components/TopProductsChart";
import './AdminDashboard.css'; // 👈 YENİ CSS İÇE AKTAR

// 🔹 Siparişleri özel kurala göre sırala
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

export default function Admin() {
  const [view, setView] = useState("dashboard"); // 'dashboard', 'menu', 'tables', 'users'
  const [orders, setOrders] = useState([]);
  
  const { stats, paidOrders, completedOrders, topProducts, topPrepTimeMeals, topPrepTimeDesserts } = useAdminAnalytics(orders);
  
  // ---------------- Firestore Dinleme ----------------
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
  
  // ---------------- VIEW YÖNETİMİ ----------------
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
    <div className="admin-container">
      <h2 className="admin-title">🧑‍💼 Yönetim Paneli (Ana)</h2>

      {/* Navigasyon Butonları */}
      <nav className="admin-nav">
        <button
          onClick={() => setView("menu")} 
          className="button nav-button-menu"
        >
          🍔 Menü Yönetimi
        </button>
        <button
          onClick={() => setView("tables")} 
          className="button nav-button-tables"
        >
          🪑 Masa & QR Yönetimi
        </button>
        <button
          onClick={() => setView("users")} 
          className="button nav-button-users"
        >
          👤 Kullanıcı Yönetimi
        </button>
      </nav>

      {/* İstatistik Kartları */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3 className="stat-title">Toplam Sipariş</h3>
          <p className="stat-value">{stats.totalOrders}</p>
        </div>
        <div className="stat-card">
          <h3 className="stat-title">Ödemesi Alınanlar</h3>
          <p className="stat-value paid">{stats.paidCount}</p>
        </div>
        <div className="stat-card">
          <h3 className="stat-title">Ortalama Hazırlık Süresi</h3>
          <p className="stat-value prep-time">{stats.avgPrepTime} dk</p>
        </div>
      </div>
      
      {/* 1. SATIR: EN ÇOK SATANLAR GRAFİĞİ */}
      <div className="chart-container-wrapper">
        <h3 className="section-title">
          🏆 En Çok Satan 5 Ürün (Son 7 Gün)
        </h3>
        {topProducts.length > 0 ? (
          <TopProductsChart data={topProducts} /> 
        ) : (
          <p className="empty-text">Henüz yeterli ödeme alınmış sipariş yok.</p>
        )}
      </div>

      {/* 2. SATIR: EN UZUN HAZIRLANMA SÜRELERİ */}
      <div className="prep-time-grid">
        
        {/* YEMEK KATEGORİSİ */}
        <div className="prep-time-list-container">
          <h3 className="section-title">
            ⏰ En Uzun Hazırlanan Yemekler (Son 7 Gün - Top 10)
          </h3>
          {topPrepTimeMeals.length > 0 ? (
            <ul className="prep-time-list">
              {topPrepTimeMeals.map((o, index) => (
                <li key={o.orderId} className="prep-time-item">
                  <div>
                    <span className="prep-time-header">
                      #{index + 1} - {new Date(o.orderDateTimestamp * 1000).toLocaleTimeString('tr-TR')}
                    </span>
                    <p className="prep-time-items">
                      Ürünler: {o.itemsList}
                    </p>
                  </div>
                  <span className="prep-time-duration">
                    {o.time.minutes} dk {o.time.seconds} sn
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-text">Son 7 günde hazırlanan Yemekler siparişi bulunamadı.</p>
          )}
        </div>
        
        {/* TATLILAR KATEGORİSİ */}
        <div className="prep-time-list-container">
          <h3 className="section-title">
            🍰 En Uzun Hazırlanan Tatlılar (Son 7 Gün - Top 10)
          </h3>
          {topPrepTimeDesserts.length > 0 ? (
            <ul className="prep-time-list">
              {topPrepTimeDesserts.map((o, index) => (
                <li key={o.orderId} className="prep-time-item">
                  <div>
                    <span className="prep-time-header">
                      #{index + 1} - {new Date(o.orderDateTimestamp * 1000).toLocaleTimeString('tr-TR')}
                    </span>
                    <p className="prep-time-items">
                      Ürünler: {o.itemsList}
                    </p>
                  </div>
                  <span className="prep-time-duration">
                    {o.time.minutes} dk {o.time.seconds} sn
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-text">Son 7 günde hazırlanan Tatlılar siparişi bulunamadı.</p>
          )}
        </div>
        
      </div>

      {/* Ödemesi Alınan Siparişler Tablosu */}
      <h3 className="section-title">
        💰 Ödemesi Alınan Siparişler
      </h3>
      <div className="table-responsive-wrapper">
        <table className="data-table">
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
              const completed = completedOrders.find(co => co.id === o.id);
              const cookingTime = completed?.cookingTime;
              
              const productList = o.items
                ? o.items.map((it) => `${it.name} ×${it.qty || 1}`).join(", ")
                : "-";
                
              const paymentTimestamp = o.paymentAt?.seconds 
                                       ? o.paymentAt.seconds 
                                       : o.movedAt?.seconds;
                                         
              return (
                <tr key={`${o.id}-${o.tableId}`}>
                  <td className="cell-tableId">{o.tableId || "-"}</td>
                  <td className="cell-payment">
                    {o.paymentMethod || "-"}
                  </td>
                  <td className="cell-products">{productList}</td>
                  <td className="cell-prep-time">
                    {cookingTime
                      ? `${cookingTime.minutes} dk ${cookingTime.seconds} sn`
                      : "-"}
                  </td>
                  <td className="cell-date">
                    {paymentTimestamp
                      ? new Date(paymentTimestamp * 1000).toLocaleString("tr-TR")
                      : "-"}
                  </td>
                  <td className="cell-total">
                    {o.total ? `${o.total} ₺` : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}