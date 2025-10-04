import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  db,
  collection,
  collectionGroup,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from "../lib/firebase";

// Süre hesaplama yardımcı fonksiyonları
const calculateDuration = (createdAt, readyAt) => {
  if (!createdAt?.seconds || !readyAt?.seconds) return null;
  const diff = readyAt.seconds - createdAt.seconds;
  if (diff < 0) return null;
  const minutes = Math.floor(diff / 60);
  const seconds = diff % 60;
  return { minutes, seconds, totalSec: diff };
};

const average = (values) => {
  if (!values.length) return 0;
  return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
};

export default function AdminDashboard() {
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [newTableId, setNewTableId] = useState("");
  const navigate = useNavigate();

  // 🔹 Siparişleri (aktif + geçmiş) dinle
  useEffect(() => {
    const unsubOrders = onSnapshot(collectionGroup(db, "orders"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOrders((prev) => [
        ...prev.filter((o) => o.source !== "orders"),
        ...data.map((d) => ({ ...d, source: "orders" })),
      ]);
    });

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

  // 🔹 Masaları dinle (tables koleksiyonu)
  useEffect(() => {
    const unsubTables = onSnapshot(collection(db, "tables"), (snap) => {
      setTables(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubTables();
  }, []);

  // 🔹 Masa oluştur
  const handleAddTable = async () => {
    if (!newTableId.trim()) return;
    const ref = doc(db, "tables", newTableId);
    await setDoc(
      ref,
      { createdAt: new Date(), cart: { items: [], total: 0 } },
      { merge: true }
    );
    setNewTableId("");
  };

  // 🔹 Masa sil
  const handleDeleteTable = async (id) => {
    if (window.confirm(`${id} adlı masayı silmek istiyor musun?`)) {
      await deleteDoc(doc(db, "tables", id));
    }
  };

  // 🔹 İstatistik hesaplama
  const completedOrders = useMemo(
    () =>
      orders
        .filter((o) => o.status === "Hazır" && o.readyAt?.seconds)
        .map((o) => ({
          ...o,
          duration: calculateDuration(o.createdAt, o.readyAt),
        }))
        .filter((o) => o.duration),
    [orders]
  );

  const stats = useMemo(() => {
    const durations = completedOrders.map((o) => o.duration.totalSec);
    return {
      totalOrders: orders.length,
      completed: completedOrders.length,
      avgPrepTime: average(durations) / 60,
    };
  }, [orders, completedOrders]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold mb-6 text-center">
        🧑‍💼 Yönetici Paneli
      </h2>

      {/* QR Kod Yönetimine Git butonu */}
      <div className="flex justify-end mb-6">
        <button
          onClick={() => navigate("/qr")}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
        >
          QR Kod Yönetimine Git
        </button>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-blue-100 p-4 rounded shadow text-center">
          <h3 className="text-lg font-semibold">Toplam Sipariş</h3>
          <p className="text-2xl font-bold text-blue-700">
            {stats.totalOrders}
          </p>
        </div>
        <div className="bg-green-100 p-4 rounded shadow text-center">
          <h3 className="text-lg font-semibold">Hazır Sipariş</h3>
          <p className="text-2xl font-bold text-green-700">
            {stats.completed}
          </p>
        </div>
        <div className="bg-yellow-100 p-4 rounded shadow text-center">
          <h3 className="text-lg font-semibold">Ortalama Süre</h3>
          <p className="text-2xl font-bold text-yellow-700">
            {stats.avgPrepTime.toFixed(1)} dk
          </p>
        </div>
      </div>

      {/* 🔹 Sipariş Tablosu */}
      {/* 🔹 Sipariş Tablosu */}
{/* 🔹 Sipariş Tablosu */}
{/* 🔹 Sipariş Tablosu */}
<table className="w-full border-collapse border border-gray-300 text-sm shadow mb-8">
  <thead className="bg-gray-100">
    <tr>
      <th className="border p-2 text-left">Masa</th>
      <th className="border p-2 text-left">Durum</th>
      <th className="border p-2 text-left">Ürünler</th>
      <th className="border p-2 text-left">Hazırlanma Süresi</th>
      <th className="border p-2 text-left">Oluşturulma</th>
      <th className="border p-2 text-left">Toplam Fiyat (₺)</th>
    </tr>
  </thead>

  <tbody>
    {[...orders]
      .sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime; // ✅ En yeni sipariş en üstte
      })
      .map((o) => {
        const duration =
          o.readyAt && o.createdAt
            ? o.readyAt.seconds - o.createdAt.seconds
            : null;

        // 🔹 Ürünleri formatla: "Pizza ×2, Kola ×1"
        const productList = o.items
          ? o.items.map((it) => `${it.name} ×${it.qty || 1}`).join(", ")
          : "-";

        return (
          <tr key={`${o.id}-${o.tableId}`} className="hover:bg-gray-50">
            <td className="border p-2">{o.tableId || "-"}</td>
            <td
              className={`border p-2 font-medium ${
                o.status === "Hazır"
                  ? "text-green-700"
                  : o.status === "Hazırlanıyor"
                  ? "text-yellow-700"
                  : "text-gray-700"
              }`}
            >
              {o.status}
            </td>
            <td className="border p-2 text-sm text-gray-800">{productList}</td>
            <td className="border p-2">
              {duration
                ? `${Math.floor(duration / 60)} dk ${duration % 60} sn`
                : "-"}
            </td>
            <td className="border p-2">
              {o.createdAt?.seconds
                ? new Date(o.createdAt.seconds * 1000).toLocaleString("tr-TR")
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




      {/* 🔹 Masa Yönetimi */}
      <div className="bg-gray-100 p-4 rounded shadow">
        <h3 className="text-xl font-semibold mb-2">🍽️ Masa Yönetimi</h3>

        {/* Masa Ekleme Alanı */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newTableId}
            onChange={(e) => setNewTableId(e.target.value)}
            placeholder="masa_5"
            className="border p-2 rounded flex-1"
          />
          <button
            onClick={handleAddTable}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Masa Ekle
          </button>
        </div>

        {/* Masa Listesi */}
        <ul>
          {tables.map((t) => (
            <li
              key={t.id}
              className="flex justify-between items-center bg-white p-2 mb-2 rounded border"
            >
              <span className="font-medium">{t.id}</span>
              <button
                onClick={() => handleDeleteTable(t.id)}
                className="text-red-600 hover:text-red-800"
              >
                Sil
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
