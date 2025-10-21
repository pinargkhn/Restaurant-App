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
  updateDoc,
  query,
  orderBy, 
  storage, ref, uploadBytes, getDownloadURL, deleteObject 
} from "../lib/firebase";
import './MenuPanel.css'; // 👈 YENİ CSS İÇE AKTAR

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
                // Otomatik sıra numarası
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
    
    // 🔹 Sıralama güncelleme
    const handleReorder = async (id, direction) => {
        const index = firestoreCategories.findIndex(c => c.id === id);
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        
        if (newIndex < 0 || newIndex >= firestoreCategories.length) return; // Sınır kontrolü

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
        <div className="form-container category-panel-container">
            <h4 className="form-title">Kategori Ekle</h4>
            <form onSubmit={handleAddCategory} className="category-add-form">
                <input
                    type="text"
                    placeholder="Yeni Kategori Adı (örn: Spesiyaller)"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="form-input"
                    disabled={isSaving}
                    required
                />
                <button
                    type="submit"
                    className="button button-green"
                    disabled={isSaving || newCategoryName.trim() === ""}
                >
                    {isSaving ? "Ekleniyor..." : "Ekle"}
                </button>
            </form>

            <h4 className="section-title">Mevcut Kategoriler ({firestoreCategories.length})</h4>
            <p className="panel-note-small">Kategoriler sırası, menüde görünecek sırayı belirler.</p>
            <ul className="category-list">
                {firestoreCategories.map((cat, index) => (
                    <li key={cat.id} className="category-list-item">
                        <span className="category-name">
                            {index + 1}. {cat.name}
                        </span>
                        <div className="category-actions">
                            <button
                                onClick={() => handleReorder(cat.id, 'up')}
                                disabled={isSaving || index === 0}
                                className="button button-icon"
                            >
                                ↑
                            </button>
                            <button
                                onClick={() => handleReorder(cat.id, 'down')}
                                disabled={isSaving || index === firestoreCategories.length - 1}
                                className="button button-icon"
                            >
                                ↓
                            </button>
                            <button
                                onClick={() => handleDeleteCategory(cat.id, cat.name)}
                                className="button button-danger"
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
    // 1. Ürünleri Dinle
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
        
        // Formdaki varsayılan kategoriyi ayarla
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

  // ---------------- HELPER: Eski Görseli Silme ----------------
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

  // ---------------- CRUD İşlemleri ----------------
  const handleSave = async (e) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.price || !newProduct.category) {
        alert("Lütfen tüm alanları doldurun.");
        return;
    }
    
    // Kategorinin varlığını kontrol et
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

      // 2. YENİ DOSYA YÜKLE
      if (file) {
        const filePath = `products/${newProduct.name}_${Date.now()}_${file.name}`;
        // Not: Orijinal kodunuzda özel bir uploadUrl kullanılmış. 
        // Firebase SDK'nın standart uploadBytes'ını kullanmak genellikle daha basittir
        // ancak orijinal mantığı korumak için fetch'li yapıyı varsayıyoruz.
        // Eğer firebase.js'den 'uploadBytes' import edildiyse, o kullanılmalıdır.
        // Burada orijinal koddaki fetch'i temel alıyoruz:
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
    <div className="admin-subpanel-container">
      <div className="subpanel-header">
        <h2 className="subpanel-title">🍔 Menü Yönetim Paneli</h2>
        <button
          onClick={onBack}
          className="button button-secondary"
        >
          ← Ana Panele Dön
        </button>
      </div>
      
      {/* 🚀 YENİ: Sekme Navigasyonu */}
      <div className="tab-nav">
        <button
          onClick={() => setActiveTab("products")}
          className={`tab-button ${activeTab === "products" ? "active" : ""}`}
        >
          Ürünler
        </button>
        <button
          onClick={() => setActiveTab("categories")}
          className={`tab-button ${activeTab === "categories" ? "active" : ""}`}
        >
          Kategoriler ({categories.length})
        </button>
      </div>

      {/* 🚀 ÜRÜNLER SEKMESİ */}
      {activeTab === "products" && (
        <>
          {/* Ürün Ekle/Düzenle Formu */}
          <div className="form-container product-form-container">
            <h3 className="form-title">
              {editingId ? "✏️ Ürün Düzenle" : "➕ Yeni Ürün Ekle"}
            </h3>
            <form onSubmit={handleSave} className="product-form">
              {/* İsim ve Fiyat */}
              <input
                type="text"
                placeholder="Ürün Adı"
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                className="form-input"
                disabled={uploading}
              />
              <input
                type="number"
                placeholder="Fiyat (₺)"
                value={newProduct.price}
                onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                className="form-input"
                disabled={uploading}
              />
              {/* 🚀 DİNAMİK KATEGORİ LİSTESİ */}
              <select
                value={newProduct.category}
                onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                className="form-select"
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
              
              {/* GÖRSEL YÜKLEME ALANI */}
              <div className="form-input-file-wrapper">
                <label className="form-label-inline">Görsel Yükle:</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files[0])}
                  disabled={uploading}
                />
              </div>
              
              {/* YÜKLEME BUTONU/DURUMU */}
              <div className="form-actions">
                <button
                  type="submit"
                  className={`button ${
                    editingId ? "button-blue" : "button-green"
                  }`}
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
                    className="button button-secondary"
                    disabled={uploading}
                  >
                    İptal
                  </button>
                )}
              </div>

              {/* Mevcut görseli göster */}
              {editingId && newProduct.imageUrl && (
                <div className="image-preview-wrapper">
                  <p className="image-preview-label">Mevcut Görsel:</p>
                  <img src={newProduct.imageUrl} alt="Mevcut" className="image-preview" />
                </div>
              )}
              
            </form>
          </div>

          {/* Ürün Listesi */}
          <h3 className="section-title">Tüm Menü Ürünleri</h3>
          <div className="product-list">
            {products.map((p) => (
              <div
                key={p.id}
                className="product-list-item"
              >
                <div className="product-info">
                    {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="product-item-image" />}
                    <div>
                        <span className="product-item-name">{p.name}</span>
                        <span className="product-item-details">
                            {p.category} | {p.price} ₺
                        </span>
                    </div>
                </div>
                
                <div className="product-actions">
                  <button
                    onClick={() => handleEdit(p)}
                    className="button button-yellow-outline"
                  >
                    Düzenle
                  </button>
                  <button
                    onClick={() => handleDelete(p.id, p.name, p.imageUrl)}
                    className="button button-danger-outline"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!products.length && (
              <p className="empty-text">Henüz menüye ürün eklenmemiş.</p>
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