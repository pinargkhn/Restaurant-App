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

// -------------------------------------------------------------------
// 🔹 İstatistik hesaplama fonksiyonları (COMPONENT DIŞINDA TANIMLANDI)
//    Bu, "nextCreate is not a function" hatasını çözmek için önemlidir.
// -------------------------------------------------------------------

const calculateCookingTime = (startCookingAt, readyAt) => {
  if (!startCookingAt?.seconds || !readyAt?.seconds) return null;
  const diff = readyAt.seconds - startCookingAt.seconds;
  if (diff <= 0) return null;
  const minutes = Math.floor(diff / 60);
  const seconds = diff % 60;
  return { minutes, seconds, totalSec: diff };
};

const average = (values) => {
  if (!values.length) return 0;
  return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
};

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
  
  // ---------------- useMemo Blokları ----------------
  
  // Ödemesi Alınmış Siparişler
  const paidOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.paymentStatus === "Alındı" ||
          (o.source === "pastOrders" && o.paymentStatus === "Alındı")
      ),
    [orders]
  );

  // Hazırlanma Süresi Hesaplanan Siparişler
  const completedOrders = useMemo(
    () =>
      orders
        .filter((o) => o.startCookingAt?.seconds && o.readyAt?.seconds)
        .map((o) => ({
          ...o,
          cookingTime: calculateCookingTime(o.startCookingAt, o.readyAt),
        }))
        .filter((o) => o.cookingTime),
    [orders]
  );

  // Genel İstatistikler
  const stats = useMemo(() => {
    const durations = completedOrders.map((o) => o.cookingTime.totalSec);
    return {
      totalOrders: orders.length,
      paidCount: paidOrders.length,
      avgPrepTime: (average(durations) / 60).toFixed(1),
    };
  }, [orders, completedOrders, paidOrders]);


  // ---------------- VIEW YÖNETİMİ ----------------
  // Butona basıldığında ilgili paneli gösterir
  if (view === "menu") {
    // MenuPanel'e onBack prop'u ile ana panele dönme fonksiyonu gönderilir
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

      {/* Ödemesi Alınan Siparişler Tablosu */}
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
            const cookingTime = calculateCookingTime(o.startCookingAt, o.readyAt);
            const productList = o.items
              ? o.items.map((it) => `${it.name} ×${it.qty || 1}`).join(", ")
              : "-";
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
                  {o.paymentAt?.seconds
                    ? new Date(o.paymentAt.seconds * 1000).toLocaleString("tr-TR")
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