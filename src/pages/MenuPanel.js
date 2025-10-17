// src/pages/MenuPanel.js
import { useState, useEffect, useMemo } from "react";
import { 
  db, 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  addDoc,
  getDoc,
  // 🚀 YENİ İMPORTLAR: Storage
  storage, ref, uploadBytes, getDownloadURL, deleteObject 
} from "../lib/firebase";

export default function MenuPanel({ onBack }) {
  const [products, setProducts] = useState([]);
  const [newProduct, setNewProduct] = useState({
    name: "",
    price: "",
    category: "Yemekler",
    imageUrl: "", 
  });
  const [editingId, setEditingId] = useState(null);
  
  // 🚀 YENİ STATE'LER
  const [file, setFile] = useState(null); // Yüklenecek dosya
  const [uploading, setUploading] = useState(false); // Yükleme durumu
  const [uploadProgress, setUploadProgress] = useState(0); // Yükleme ilerlemesi

  // Kategorileri dinamik olarak çekmek için mevcut ürünlerden faydalanıyoruz
  const uniqueCategories = useMemo(() => {
    const categories = new Set(products.map(p => p.category));
    if (!categories.has("Yemekler")) categories.add("Yemekler");
    if (!categories.has("İçecekler")) categories.add("İçecekler");
    if (!categories.has("Tatlılar")) categories.add("Tatlılar");
    return Array.from(categories).sort();
  }, [products]);

  // ---------------- Firestore Dinleme (Aynı kalır) ----------------
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "products"), (snap) => {
      setProducts(
        snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            if (a.category < b.category) return -1;
            if (a.category > b.category) return 1;
            return a.name.localeCompare(b.name);
          })
      );
    });
    return () => unsub();
  }, []);

  // ---------------- HELPER: Eski Görseli Silme ----------------
  const deleteOldImage = async (url) => {
      if (!url || !url.includes("firebasestorage")) return;
      try {
          // URL'den dosya yolunu (reference path) çıkar
          const decodedUrl = decodeURIComponent(url.split("/o/")[1].split("?")[0]);
          const imageRef = ref(storage, decodedUrl);
          await deleteObject(imageRef);
          console.log("Eski görsel başarıyla silindi.");
      } catch (error) {
          console.warn("Eski görsel silinemedi (Dosya bulunamadı veya hata):", error);
          // Hata olsa bile devam et
      }
  };

  // ---------------- CRUD İşlemleri (Güncellendi) ----------------
  const handleSave = async (e) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.price || !newProduct.category) {
        alert("Lütfen tüm alanları doldurun.");
        return;
    }

    setUploading(true);
    let finalImageUrl = newProduct.imageUrl;
    let oldImageUrl = "";

    try {
      // 1. DÜZENLEME İSE ESKİ URL'Yİ KAYDET
      if (editingId) {
        const docSnap = await getDoc(doc(db, "products", editingId));
        oldImageUrl = docSnap.data()?.imageUrl;
      }

      // 2. YENİ DOSYA YÜKLE
      if (file) {
        // Yükleme referansını oluştur (products/urun_adi_timestamp)
        // 🔹 1. Dosya yolunu oluştur
        const filePath = `products/${newProduct.name}_${Date.now()}_${file.name}`;

        // 🔹 2. Yükleme URL’sini hazırla (Google Cloud Storage API)
        const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/restaurant-app-c4414/o?uploadType=media&name=${encodeURIComponent(filePath)}`;

        // 🔹 3. Yükleme isteğini gönder (fetch ile)
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": file.type,
            // Eğer bucket private olsaydı, buraya Authorization eklenirdi
          },
          body: file,
        });

        // 🔹 4. Başarılıysa public URL’yi oluştur
        if (!response.ok) throw new Error("Yükleme başarısız oldu.");

        finalImageUrl = `https://storage.googleapis.com/restaurant-app-c4414/${filePath}`;
        
        // Yükleme tamamlandıysa eski görseli sil
        if (editingId && oldImageUrl) {
            await deleteOldImage(oldImageUrl);
        }
      } 
      // 3. YÜKLEME VEYA GÜNCELLEME İŞLEMİ
      const productData = {
        name: newProduct.name,
        price: Number(newProduct.price),
        category: newProduct.category,
        imageUrl: finalImageUrl || "", // Yeni URL veya mevcut URL
      };

      if (editingId) {
        const ref = doc(db, "products", editingId);
        await setDoc(ref, productData);
        alert(`✅ Ürün başarıyla güncellendi.`);
        setEditingId(null);
      } else {
        await addDoc(collection(db, "products"), productData);
        alert(`✅ Yeni ürün başarıyla eklendi.`);
      }

      // Formu sıfırla
      setNewProduct({ name: "", price: "", category: uniqueCategories[0] || "Yemekler", imageUrl: "" });
      setFile(null);
      
    } catch (error) {
      console.error("🔥 Ürün kaydetme/yükleme hatası:", error);
      alert("❌ İşlem başarısız oldu. Konsolu kontrol edin.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleEdit = (product) => {
    setEditingId(product.id);
    setNewProduct({
      name: product.name,
      price: product.price.toString(), 
      category: product.category,
      imageUrl: product.imageUrl || "", // Mevcut URL'yi koru
    });
    setFile(null); // Düzenlemeye başlarken dosyayı sıfırla
  };

  const handleDelete = async (id, name, imageUrl) => {
    if (window.confirm(`${name} adlı ürünü silmek istediğinizden emin misiniz?`)) {
      try {
        await deleteDoc(doc(db, "products", id));
        
        // 🚀 GÖRSELİ DE SİL
        if (imageUrl) {
            await deleteOldImage(imageUrl);
        }

        alert(`🗑️ ${name} silindi.`);
      } catch (error) {
        console.error("🔥 Ürün silme hatası:", error);
        alert("❌ Ürün silinemedi.");
      }
    }
  };
  
  // ---------------- Render ----------------
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6 border-b pb-2">
        <h2 className="text-3xl font-bold">🍔 Menü Yönetim Paneli</h2>
        <button
          onClick={onBack}
          className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition"
        >
          ← Ana Panele Dön
        </button>
      </div>

      {/* Ürün Ekle/Düzenle Formu */}
      <div className="border p-4 rounded-lg shadow mb-8 bg-gray-50">
        <h3 className="text-xl font-semibold mb-4">
          {editingId ? "✏️ Ürün Düzenle" : "➕ Yeni Ürün Ekle"}
        </h3>
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* İsim ve Fiyat */}
          <input
            type="text"
            placeholder="Ürün Adı"
            value={newProduct.name}
            onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
            className="border p-2 rounded"
            disabled={uploading}
          />
          <input
            type="number"
            placeholder="Fiyat (₺)"
            value={newProduct.price}
            onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
            className="border p-2 rounded"
            disabled={uploading}
          />
          <select
            value={newProduct.category}
            onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
            className="border p-2 rounded bg-white"
            disabled={uploading}
          >
            {uniqueCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          
          {/* 🚀 GÖRSEL YÜKLEME ALANI (Dosya Inputu) */}
          <div className="md:col-span-2 border p-2 rounded bg-white flex items-center gap-3">
            <label className="text-gray-600 text-sm flex-shrink-0">Görsel Yükle:</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files[0])}
              className="flex-1"
              disabled={uploading}
            />
          </div>
          
          {/* YÜKLEME BUTONU/DURUMU */}
          <div className="flex gap-2">
            <button
              type="submit"
              className={`w-full text-white py-2 rounded font-semibold transition ${
                editingId ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"
              } ${uploading || !newProduct.name ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={uploading || !newProduct.name}
            >
              {uploading ? 'Yükleniyor...' : editingId ? "Kaydet" : "Ekle"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setNewProduct({ name: "", price: "", category: uniqueCategories[0] || "Yemekler", imageUrl: "" });
                  setFile(null);
                }}
                className="bg-gray-400 text-white py-2 px-3 rounded hover:bg-gray-500"
                disabled={uploading}
              >
                İptal
              </button>
            )}
          </div>

          {/* Mevcut görseli göster (Sadece düzenleme modunda) */}
          {editingId && newProduct.imageUrl && (
            <div className="md:col-span-3 mt-2">
              <p className="text-sm text-gray-600 mb-1">Mevcut Görsel:</p>
              <img src={newProduct.imageUrl} alt="Mevcut" className="w-20 h-20 object-cover rounded shadow" />
            </div>
          )}
          
        </form>
      </div>

      {/* Ürün Listesi */}
      <h3 className="text-xl font-semibold mb-3">Tüm Menü Ürünleri</h3>
      <div className="space-y-3">
        {products.map((p) => (
          <div
            key={p.id}
            className="flex justify-between items-center p-3 bg-white border rounded shadow-sm"
          >
            <div className="flex items-center gap-3">
                {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="w-10 h-10 object-cover rounded" />}
                <div>
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-sm text-gray-500 block">
                        {p.category} | {p.price} ₺
                    </span>
                </div>
            </div>
            
            <div className="flex gap-2 text-sm">
              <button
                onClick={() => handleEdit(p)}
                className="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600"
              >
                Düzenle
              </button>
              <button
                // 🚀 GÖRSEL URL'Sİ SİLME FONKSİYONUNA GÖNDERİLİYOR
                onClick={() => handleDelete(p.id, p.name, p.imageUrl)}
                className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
              >
                Sil
              </button>
            </div>
          </div>
        ))}
      </div>
      {!products.length && (
          <p className="text-gray-500 text-center mt-5">Henüz menüye ürün eklenmemiş.</p>
      )}
    </div>
  );
}