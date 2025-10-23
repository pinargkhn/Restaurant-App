// src/pages/TablePanel.js
import { useEffect, useState } from "react";
// 👈 serverTimestamp import edildi
import {
  db,
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from "../lib/firebase"; // serverTimestamp'ın lib/firebase'dan export edildiğini varsayıyoruz
import { QRCodeCanvas } from "qrcode.react";
import './TablePanel.css'; // Stil dosyası (varsa)

// onBack prop'u AdminDashboard'dan geliyor
export default function TablePanel({ onBack }) {
  const [tables, setTables] = useState([]);
  const [newTableId, setNewTableId] = useState("");
  const baseUrl = window.location.origin; // Uygulamanın temel URL'si

  // Masaları dinle
  useEffect(() => {
    const unsubTables = onSnapshot(collection(db, "tables"), (snap) => {
      setTables(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          // ID'ye göre numerik sıralama
          .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
      );
    });
    return () => unsubTables(); // Cleanup
  }, []);

  // Yeni masa ekle
  const handleAddTable = async () => {
    const trimmedId = newTableId.trim(); // Boşlukları temizle
    if (!trimmedId) return; // Boş ID ekleme
    // ID'nin geçerli olup olmadığını kontrol et (Firebase kısıtlamaları)
    if (trimmedId.includes('/') || trimmedId === '.' || trimmedId === '..') {
        alert("Geçersiz masa ID'si. '/' , '.' veya '..' içeremez.");
        return;
    }
    // Masa zaten var mı kontrolü (isteğe bağlı ama önerilir)
    if (tables.some(t => t.id === trimmedId)) {
        alert(`'${trimmedId}' adlı masa zaten mevcut!`);
        return;
    }

    const ref = doc(db, "tables", trimmedId);
    try {
        // Yeni masa için başlangıç verisi (boş sepet ve oluşturma zamanı)
        await setDoc(ref, {
             createdAt: serverTimestamp(), // 👈 serverTimestamp kullanıldı
             cart: { items: [], total: 0, note: "" }
        }, { merge: true }); // Merge true, varolan dokümanın üzerine yazmayı engeller (genelde gereksiz ama zararsız)
        setNewTableId(""); // Input'u temizle
    } catch (error) {
        console.error("Masa ekleme hatası:", error);
        alert("Masa eklenirken bir hata oluştu.");
    }
  };

  // Masa sil
  const handleDeleteTable = async (id) => {
    if (window.confirm(`'${id}' adlı masayı silmek istediğinizden emin misiniz? Bu masaya ait tüm sipariş verileri kaybolabilir!`)) {
      try {
        await deleteDoc(doc(db, "tables", id));
        alert(`Masa '${id}' başarıyla silindi.`);
      } catch (error) {
         console.error("Masa silme hatası:", error);
         alert("Masa silinirken bir hata oluştu.");
      }
    }
  };

  // QR İndirme Fonksiyonu
  const downloadQR = (e, id) => {
    // En yakın .table-card içindeki canvas'ı bul
    const canvas = e.target.closest('.table-card')?.querySelector('canvas');
    if (canvas) {
        try {
            // Canvas içeriğini PNG data URL'ine çevir
            const pngUrl = canvas.toDataURL("image/png");
            // Geçici bir link elementi oluştur
            const link = document.createElement("a");
            link.href = pngUrl;
            link.download = `QR_${id}.png`; // İndirilecek dosya adı
            // Linki DOM'a ekle, tıkla ve kaldır
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error("QR indirme hatası:", error);
            alert("QR kod indirilirken bir hata oluştu.");
        }
    } else {
        console.error("QR indirme hatası: Canvas elementi bulunamadı.");
        alert("QR kod indirilemedi.");
    }
  };


  return (
    // admin-subpanel-container global stili kullanılıyor
    <div className="admin-subpanel-container">
      {/* Başlık ve Geri Butonu */}
      <div className="subpanel-header">
        <h2 className="subpanel-title">🪑 Masa & QR Yönetim Paneli</h2>
        <button
          onClick={onBack} // AdminDashboard'a geri dön
          className="button button-secondary" // Global stil
        >
          ← Ana Panele Dön
        </button>
      </div>

      {/* Masa Ekleme Formu */}
      <div className="add-table-form">
        <input
          type="text"
          value={newTableId}
          onChange={(e) => setNewTableId(e.target.value)}
          placeholder="Yeni Masa ID (örn: masa_5 veya A1)"
          className="form-input" // Global stil
        />
        <button
          onClick={handleAddTable}
          className="button button-green" // Global stil
        >
          Masa Ekle
        </button>
      </div>

      {/* Masa Grid'i */}
      <div className="table-grid">
        {tables.map((t) => {
          // QR KODU URL'Sİ /welcome sayfasına yönlendiriyor
          const qrUrl = `${baseUrl}/welcome?table=${t.id}`;
          return (
            <div
              key={t.id}
              className="table-card" // TablePanel.css stili
            >
              <h3 className="table-card-title">Masa: {t.id}</h3>
              {/* QR Kodu */}
              <QRCodeCanvas value={qrUrl} size={140} level={"H"} />
              <p className="table-card-url">{qrUrl}</p>

              {/* Butonlar */}
              <div className="table-card-actions">
                <button
                  onClick={(e) => downloadQR(e, t.id)}
                  className="button button-blue-outline" // Global stil
                >
                  QR İndir
                </button>
                <button
                  onClick={() => handleDeleteTable(t.id)}
                  className="button button-danger" // Global stil
                >
                  Sil
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Masa Yoksa */}
      {!tables.length && (
        <p className="empty-text">Henüz masa eklenmemiş.</p> // Global stil
      )}
    </div>
  );
}