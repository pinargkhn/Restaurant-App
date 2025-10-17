// src/pages/TablePanel.js
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  db,
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from "../lib/firebase";
import { QRCodeCanvas } from "qrcode.react";

export default function TablePanel({ onBack }) { // onBack prop'u eklendi
  const [tables, setTables] = useState([]);
  const [newTableId, setNewTableId] = useState("");
  const baseUrl = window.location.origin;

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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6 border-b pb-2">
        <h2 className="text-3xl font-bold">🪑 Masa & QR Yönetim Paneli</h2>
        <button
          onClick={onBack}
          className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition"
        >
          ← Ana Panele Dön
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