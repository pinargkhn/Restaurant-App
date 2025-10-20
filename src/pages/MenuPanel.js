// src/pages/MenuPanel.js

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
  // 🚀 EKLENDİ: updateDoc, query, orderBy
  updateDoc,
  query,
  orderBy, 
  storage, ref, uploadBytes, getDownloadURL, deleteObject 
} from "../lib/firebase";

// ... [Kalan kod aynı kalır]

// 🚀 CATEGORIES LİSTESİ KALDIRILDI. ARTIK FIRESTORE'DAN ÇEKİLECEK.

// -------------------------------------------------------------------
// 🔹 Kategori Yönetim Paneli Alt Bileşeni
// -------------------------------------------------------------------

function CategoryPanel({ firestoreCategories }) {
    const [newCategoryName, setNewCategoryName] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const handleAddCategory = async (e) => {
        e.preventDefault();
        const name = newCategoryName.trim();
        if (!name) return;

        // Benzersizlik kontrolü
        if (firestoreCategories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            alert("Bu kategori zaten mevcut!");
            return;
        }

        setIsSaving(true);
        try {
            const categoriesRef = collection(db, "categories");
            await addDoc(categoriesRef, { 
                name: name,
                // Otomatik sıra numarası (en sonuncunun +1'i)
                order: firestoreCategories.length > 0 ? Math.max(...firestoreCategories.map(c => c.order || 0)) + 1 : 1,
            });
            setNewCategoryName("");
            alert(`✅ Yeni kategori '${name}' başarıyla eklendi.`);
        } catch (error) {
            console.error("🔥 Kategori ekleme hatası:", error);
            alert("❌ Kategori eklenemedi.");
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleDeleteCategory = async (id, name) => {
        if (!window.confirm(`⚠️ ${name} kategorisini silmek istediğinizden emin misiniz? Bu kategoriye ait ürünler menüde görünebilir ancak kategori başlığı olmayacaktır.`)) {
            return;
        }
        try {
            await deleteDoc(doc(db, "categories", id));
            alert(`🗑️ Kategori '${name}' silindi.`);
        } catch (error) {
            console.error("🔥 Kategori silme hatası:", error);
            alert("❌ Kategori silinemedi.");
        }
    };
    
    // 🔹 Sıralama güncelleme (Basitçe, yeni bir array oluşturup order'ı set ediyoruz)
    const handleReorder = async (id, direction) => {
        const index = firestoreCategories.findIndex(c => c.id === id);
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        
        if (newIndex < 0 || newIndex >= firestoreCategories.length) return; // Sınır kontrolü

        // Kategorilerin kopyasını oluşturup yerlerini değiştir
        const newOrder = [...firestoreCategories];
        const [movedCategory] = newOrder.splice(index, 1);
        newOrder.splice(newIndex, 0, movedCategory);
        
        setIsSaving(true);
        try {
            // Firestore'da tüm kategorilerin order alanlarını yeni index değerleriyle güncelliyoruz
            await Promise.all(newOrder.map((cat, idx) => 
                updateDoc(doc(db, "categories", cat.id), { order: idx + 1 })
            ));
        } catch (error) {
            console.error("🔥 Sıralama hatası:", error);
            alert("❌ Sıralama güncellenemedi.");
        } finally {
            setIsSaving(false);
        }
    };


    return (
        <div className="p-4 border rounded-lg shadow mt-4 bg-white">
            <h4 className="text-lg font-semibold mb-3">Kategori Ekle</h4>
            <form onSubmit={handleAddCategory} className="flex gap-2 mb-6">
                <input
                    type="text"
                    placeholder="Yeni Kategori Adı (örn: Spesiyaller)"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="border p-2 rounded flex-1"
                    disabled={isSaving}
                    required
                />
                <button
                    type="submit"
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
                    disabled={isSaving || newCategoryName.trim() === ""}
                >
                    {isSaving ? "Ekleniyor..." : "Ekle"}
                </button>
            </form>

            <h4 className="text-lg font-semibold mb-3">Mevcut Kategoriler ({firestoreCategories.length})</h4>
            <p className="text-sm text-gray-500 mb-3">Kategoriler sırası, menüde görünecek sırayı belirler.</p>
            <ul className="space-y-2">
                {firestoreCategories.map((cat, index) => (
                    <li key={cat.id} className="flex justify-between items-center p-3 bg-gray-50 border rounded">
                        <span className="font-medium">
                            {index + 1}. {cat.name}
                        </span>
                        <div className="flex gap-2 items-center">
                            {/* Sıralama butonları */}
                            <button
                                onClick={() => handleReorder(cat.id, 'up')}
                                disabled={isSaving || index === 0}
                                className="text-sm px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                            >
                                ↑
                            </button>
                            <button
                                onClick={() => handleReorder(cat.id, 'down')}
                                disabled={isSaving || index === firestoreCategories.length - 1}
                                className="text-sm px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                            >
                                ↓
                            </button>
                            <button
                                onClick={() => handleDeleteCategory(cat.id, cat.name)}
                                className="text-sm px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                                disabled={isSaving}
                            >
                                Sil
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// -------------------------------------------------------------------
// 🔹 Ana MenuPanel Bileşeni
// -------------------------------------------------------------------

export default function MenuPanel({ onBack }) {
  const [activeTab, setActiveTab] = useState("products"); // 🚀 Sekme durumu
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]); // 🚀 Yeni kategori listesi
  const [newProduct, setNewProduct] = useState({
    name: "",
    price: "",
    category: "", // İlk yüklemede Firestore'dan gelen ilk kategori
    imageUrl: "", 
  });
  const [editingId, setEditingId] = useState(null);
  
  const [file, setFile] = useState(null); 
  const [uploading, setUploading] = useState(false); 

  // ---------------- Firestore Dinleme ----------------
  useEffect(() => {
    // 1. Ürünleri Dinle (Aynı kalır)
    const unsubProducts = onSnapshot(collection(db, "products"), (snap) => {
      setProducts(
        snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            if (a.category < b.category) return -1;
            if (a.category > b.category) return 1;
            return a.name.localeCompare(b.name);
          })
      );
    });
    
    // 🚀 2. KATEGORİLERİ DİNLE (Yeni)
    const categoriesQuery = query(collection(db, "categories"), orderBy("order", "asc"));
    const unsubCategories = onSnapshot(categoriesQuery, (snap) => {
        const fetchedCategories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setCategories(fetchedCategories);
        
        // Formdaki varsayılan kategoriyi ayarla (sadece ilk yüklemede)
        setNewProduct(prev => {
            if (!prev.category && fetchedCategories.length > 0) {
                return { ...prev, category: fetchedCategories[0].name };
            }
            return prev;
        });
    });

    return () => {
        unsubProducts();
        unsubCategories();
    };
  }, []);

  // Kategori listesi (ürün formunda kullanılacak)
  const uniqueCategories = useMemo(() => categories.map(c => c.name), [categories]);

  // ---------------- HELPER: Eski Görseli Silme (Aynı kalır) ----------------
  const deleteOldImage = async (url) => {
      if (!url || !url.includes("firebasestorage")) return;
      try {
          const decodedUrl = decodeURIComponent(url.split("/o/")[1].split("?")[0]);
          const imageRef = ref(storage, decodedUrl);
          await deleteObject(imageRef);
          console.log("Eski görsel başarıyla silindi.");
      } catch (error) {
          console.warn("Eski görsel silinemedi (Dosya bulunamadı veya hata):", error);
      }
  };

  // ---------------- CRUD İşlemleri (Aynı kalır, category'ye bağlanacak) ----------------
  const handleSave = async (e) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.price || !newProduct.category) {
        alert("Lütfen tüm alanları doldurun.");
        return;
    }
    
    // Kategorinin varlığını kontrol et (Kullanıcı eski bir kategori seçip silmiş olabilir)
    if (!uniqueCategories.includes(newProduct.category)) {
         alert(`Seçtiğiniz kategori (${newProduct.category}) artık mevcut değil. Lütfen geçerli bir kategori seçin.`);
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

      // 2. YENİ DOSYA YÜKLE (Aynı kalır)
      if (file) {
        const filePath = `products/${newProduct.name}_${Date.now()}_${file.name}`;
        const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/restaurant-app-c4414/o?uploadType=media&name=${encodeURIComponent(filePath)}`;

        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": file.type,
          },
          body: file,
        });

        if (!response.ok) throw new Error("Yükleme başarısız oldu.");

        finalImageUrl = `https://storage.googleapis.com/restaurant-app-c4414/${filePath}`;
        
        if (editingId && oldImageUrl) {
            await deleteOldImage(oldImageUrl);
        }
      } 
      // 3. YÜKLEME VEYA GÜNCELLEME İŞLEMİ
      const productData = {
        name: newProduct.name,
        price: Number(newProduct.price),
        category: newProduct.category,
        imageUrl: finalImageUrl || "", 
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
      setNewProduct({ 
        name: "", 
        price: "", 
        category: uniqueCategories[0] || "",
        imageUrl: "" 
      }); 
      setFile(null);
      
    } catch (error) {
      console.error("🔥 Ürün kaydetme/yükleme hatası:", error);
      alert("❌ İşlem başarısız oldu. Konsolu kontrol edin.");
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (product) => {
    setEditingId(product.id);
    setNewProduct({
      name: product.name,
      price: product.price.toString(), 
      category: product.category,
      imageUrl: product.imageUrl || "", 
    });
    setFile(null);
  };

  const handleDelete = async (id, name, imageUrl) => {
    if (window.confirm(`${name} adlı ürünü silmek istediğinizden emin misiniz?`)) {
      try {
        await deleteDoc(doc(db, "products", id));
        
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
      
      {/* 🚀 YENİ: Sekme Navigasyonu */}
      <div className="flex border-b border-gray-300 mb-6">
        <button
          onClick={() => setActiveTab("products")}
          className={`px-4 py-2 font-semibold ${
            activeTab === "products" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"
          }`}
        >
          Ürünler
        </button>
        <button
          onClick={() => setActiveTab("categories")}
          className={`px-4 py-2 font-semibold ${
            activeTab === "categories" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"
          }`}
        >
          Kategoriler ({categories.length})
        </button>
      </div>

      {/* 🚀 ÜRÜNLER SEKMESİ */}
      {activeTab === "products" && (
        <>
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
              {/* 🚀 DİNAMİK KATEGORİ LİSTESİ */}
              <select
                value={newProduct.category}
                onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                className="border p-2 rounded bg-white"
                disabled={uploading || categories.length === 0}
              >
                {categories.length === 0 ? (
                    <option value="" disabled>Önce kategori ekleyin</option>
                ) : (
                    uniqueCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))
                )}
              </select>
              
              {/* GÖRSEL YÜKLEME ALANI (Aynı kalır) */}
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
              
              {/* YÜKLEME BUTONU/DURUMU (Aynı kalır) */}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className={`w-full text-white py-2 rounded font-semibold transition ${
                    editingId ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"
                  } ${uploading || !newProduct.name ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={uploading || !newProduct.name || categories.length === 0}
                >
                  {uploading ? 'Yükleniyor...' : editingId ? "Kaydet" : "Ekle"}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setNewProduct({ name: "", price: "", category: uniqueCategories[0] || "", imageUrl: "" });
                      setFile(null);
                    }}
                    className="bg-gray-400 text-white py-2 px-3 rounded hover:bg-gray-500"
                    disabled={uploading}
                  >
                    İptal
                  </button>
                )}
              </div>

              {/* Mevcut görseli göster (Aynı kalır) */}
              {editingId && newProduct.imageUrl && (
                <div className="md:col-span-3 mt-2">
                  <p className="text-sm text-gray-600 mb-1">Mevcut Görsel:</p>
                  <img src={newProduct.imageUrl} alt="Mevcut" className="w-20 h-20 object-cover rounded shadow" />
                </div>
              )}
              
            </form>
          </div>

          {/* Ürün Listesi (Aynı kalır) */}
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
        </>
      )}

      {/* 🚀 KATEGORİ YÖNETİM SEKMESİ */}
      {activeTab === "categories" && (
        <CategoryPanel firestoreCategories={categories} />
      )}

    </div>
  );
}