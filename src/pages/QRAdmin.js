import { useState } from "react";
import { QRCodeCanvas } from "qrcode.react"; // ✅ named import

export default function QRAdmin() {
  const [tableId, setTableId] = useState("");

  const baseUrl = window.location.origin;
  const qrUrl = `${baseUrl}/?table=${tableId}`;

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">QR Kod Üretici</h2>

      <input
        type="text"
        value={tableId}
        onChange={(e) => setTableId(e.target.value)}
        placeholder="Masa ID girin"
        className="border p-2 rounded w-full mb-4"
      />

      {tableId && (
        <div className="flex flex-col items-center gap-4">
          {/* 🔹 Canvas tabanlı QR bileşeni */}
          <QRCodeCanvas value={qrUrl} size={200} /> 
          <p className="text-gray-700">URL: {qrUrl}</p>
        </div>
      )}
    </div>
  );
}
