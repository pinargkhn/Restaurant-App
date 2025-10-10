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
import { QRCodeCanvas } from "qrcode.react";

// 🔹 Gerçek pişirme süresi hesaplama (startCookingAt → readyAt)
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

export default function AdminDashboard() {
  const [view, setView] = useState("dashboard");
  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [newTableId, setNewTableId] = useState("");
  const navigate = useNavigate();
  const baseUrl = window.location.origin;

  // 🔹 Siparişleri dinle (hem aktif hem geçmiş)
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

  // 🔹 Masaları dinle
  useEffect(() => {
    const unsubTables = onSnapshot(collection(db, "tables"), (snap) => {
      setTables(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
      );
    });
    return () => unsubTables();
  }, []);

  // 🔹 Masa işlemleri
  const handleAddTable = async () => {
    if (!newTableId.trim()) return;
    const ref = doc(db, "tables", newTableId);
    await setDoc(ref, { createdAt: new Date(), cart: { items: [], total: 0 } }, { merge: true });
    setNewTableId("");
  };

  const handleDeleteTable = async (id) => {
    if (window.confirm(`${id} adlı masayı silmek istiyor musun?`)) {
      await deleteDoc(doc(db, "tables", id));
    }
  };

  // 🔹 Ödemesi alınan siparişler
  const paidOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.paymentStatus === "Alındı" ||
          (o.source === "pastOrders" && o.paymentStatus === "Alındı")
      ),
    [orders]
  );

  // 🔹 Ortalama süre istatistikleri
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

  const stats = useMemo(() => {
    const durations = completedOrders.map((o) => o.cookingTime.totalSec);
    return {
      totalOrders: orders.length,
      paidCount: paidOrders.length,
      avgPrepTime: (average(durations) / 60).toFixed(1),
    };
  }, [orders, completedOrders, paidOrders]);

  // ============================================================
  // ============ DASHBOARD GÖRÜNÜMÜ ============================
  // ============================================================

  if (view === "dashboard") {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold mb-6 text-center">🧑‍💼 Yönetici Paneli</h2>

        {/* Görünüm değiştirme */}
        <div className="flex justify-end mb-6">
          <button
            onClick={() => setView("tables")}
            className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition"
          >
            Masa & QR Yönetimine Geç
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
            <p className="text-2xl font-bold text-yellow-700">
              {stats.avgPrepTime} dk
            </p>
          </div>
        </div>

        {/* 💰 Ödemesi Alınan Siparişler Tablosu */}
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
            {[...paidOrders]
              .sort((a, b) => {
                const aTime = a.paymentAt?.seconds || 0;
                const bTime = b.paymentAt?.seconds || 0;
                return bTime - aTime;
              })
              .map((o) => {
                const cookingTime = calculateCookingTime(
                  o.startCookingAt,
                  o.readyAt
                );
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

  // ============================================================
  // ============ MASA & QR YÖNETİMİ ============================
  // ============================================================

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold mb-6 text-center">🪑 Masa ve QR Kod Yönetimi</h2>

      <div className="flex justify-end mb-6">
        <button
          onClick={() => setView("dashboard")}
          className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition"
        >
          ← Yönetici Paneline Dön
        </button>
      </div>

      <div className="flex gap-2 mb-6">
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

      <div className="grid md:grid-cols-3 sm:grid-cols-2 gap-6">
        {tables.map((t) => {
          const qrUrl = `${baseUrl}/?table=${t.id}`;
          return (
            <div
              key={t.id}
              className="border rounded-lg shadow p-4 bg-white flex flex-col items-center justify-between"
            >
              <h3 className="font-semibold text-lg mb-2">Masa: {t.id}</h3>
              <QRCodeCanvas value={qrUrl} size={140} />
              <p className="text-sm text-gray-600 mt-2 break-all">{qrUrl}</p>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleDeleteTable(t.id)}
                  className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                >
                  Sil
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!tables.length && (
        <p className="text-gray-500 text-center mt-10">Henüz masa eklenmemiş.</p>
      )}
    </div>
  );
}
