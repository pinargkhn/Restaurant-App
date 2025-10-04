import { useState, useEffect } from "react";
import { db, collection, onSnapshot, doc, setDoc, deleteDoc } from "../lib/firebase";
import { QRCodeCanvas } from "qrcode.react";
import { useNavigate } from "react-router-dom";

export default function TableManager() {
  const [tables, setTables] = useState([]);
  const [newTableId, setNewTableId] = useState("");
  const navigate = useNavigate();

  const baseUrl = window.location.origin; // örnek: http://localhost:3000

  // 🔹 Tüm masaları dinle
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "tables"), (snap) => {
      setTables(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
      );
    });
    return () => unsub();
  }, []);

  // 🔹 Yeni masa ekle
  const handleAddTable = async () => {
    if (!newTableId.trim()) return;
    const ref = doc(db, "tables", newTableId);
    await setDoc(ref, { createdAt: new Date(), cart: { items: [], total: 0 } }, { merge: true });
    setNewTableId("");
  };

  // 🔹 Masa sil
  const handleDeleteTable = async (id) => {
    if (window.confirm(`${id} adlı masayı silmek istiyor musun?`)) {
      await deleteDoc(doc(db, "tables", id));
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold mb-6 text-center">🪑 Masa ve QR Kod Yönetimi</h2>

      {/* Geri Dön */}
      <div className="flex justify-end mb-6">
        <button
          onClick={() => navigate("/dashboard")}
          className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition"
        >
          ← Yönetici Paneline Dön
        </button>
      </div>

      {/* Masa Ekleme Alanı */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={newTableId}
          onChange={(e) => setNewTableId(e.target.value)}
          placeholder="masa_7"
          className="border p-2 rounded flex-1"
        />
        <button
          onClick={handleAddTable}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Masa Ekle
        </button>
      </div>

      {/* Masa + QR Listeleme */}
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
                <a
                  href={document.createElement("canvas").toDataURL()}
                  download={`QR_${t.id}.png`}
                  onClick={(e) => {
                    // QR verisini indirilebilir hale getir
                    const canvas = document.querySelector("canvas");
                    e.target.href = canvas.toDataURL();
                  }}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                >
                  QR İndir
                </a>
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

      {/* Hiç masa yoksa */}
      {!tables.length && (
        <p className="text-gray-500 text-center mt-10">Henüz masa eklenmemiş.</p>
      )}
    </div>
  );
}
