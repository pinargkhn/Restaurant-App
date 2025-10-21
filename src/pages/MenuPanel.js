// src/pages/MenuPanel.js
import { useState, useEffect, useMemo } from "react";
import {
  db,
  collection,
  onSnapshot,
  doc,
  setDoc, // setDoc yerine updateDoc kullanmak daha iyi olabilir ama orijinal kodda setDoc vardı
  deleteDoc,
  addDoc,
  getDoc,
  updateDoc, // updateDoc eklendi
  query,
  orderBy,
  writeBatch,
  storage, ref, uploadBytes, getDownloadURL, deleteObject // getDownloadURL eklendi
} from "../lib/firebase"; // writeBatch ve getDownloadURL'nin firebase.js'den export edildiğini varsayıyoruz
import './MenuPanel.css';

// --- CategoryPanel Alt Bileşeni (DEĞİŞİKLİK YOK) ---
function CategoryPanel({ firestoreCategories }) {
    const [newCategoryName, setNewCategoryName] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const handleAddCategory = async (e) => {
        e.preventDefault();
        const name = newCategoryName.trim();
        if (!name) return;
        if (firestoreCategories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            alert("Bu kategori zaten mevcut!"); return;
        }
        setIsSaving(true);
        try {
            const categoriesRef = collection(db, "categories");
            await addDoc(categoriesRef, {
                name: name,
                order: firestoreCategories.length > 0 ? Math.max(...firestoreCategories.map(c => c.order || 0)) + 1 : 1,
            });
            setNewCategoryName("");
            alert(`✅ Yeni kategori '${name}' başarıyla eklendi.`);
        } catch (error) { console.error("🔥 Kategori ekleme hatası:", error); alert("❌ Kategori eklenemedi."); }
        finally { setIsSaving(false); }
    };

    const handleDeleteCategory = async (id, name) => {
        if (!window.confirm(`⚠️ ${name} kategorisini silmek istediğinizden emin misiniz?`)) return;
        try { await deleteDoc(doc(db, "categories", id)); alert(`🗑️ Kategori '${name}' silindi.`); }
        catch (error) { console.error("🔥 Kategori silme hatası:", error); alert("❌ Kategori silinemedi."); }
    };

    const handleReorder = async (id, direction) => {
        const index = firestoreCategories.findIndex(c => c.id === id);
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= firestoreCategories.length) return;
        const newOrder = [...firestoreCategories];
        const [movedCategory] = newOrder.splice(index, 1);
        newOrder.splice(newIndex, 0, movedCategory);
        setIsSaving(true);
        try { await Promise.all(newOrder.map((cat, idx) => updateDoc(doc(db, "categories", cat.id), { order: idx + 1 }))); }
        catch (error) { console.error("🔥 Sıralama hatası:", error); alert("❌ Sıralama güncellenemedi."); }
        finally { setIsSaving(false); }
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
                <button type="submit" className="button button-green" disabled={isSaving || newCategoryName.trim() === ""}>
                    {isSaving ? "Ekleniyor..." : "Ekle"}
                </button>
            </form>
             <h4 className="section-title">Mevcut Kategoriler ({firestoreCategories.length})</h4>
            <p className="panel-note-small">Kategoriler sırası, menüde görünecek sırayı belirler.</p>
            <ul className="category-list">
                {firestoreCategories.map((cat, index) => (
                    <li key={cat.id} className="category-list-item">
                        <span className="category-name">{index + 1}. {cat.name}</span>
                        <div className="category-actions">
                            <button onClick={() => handleReorder(cat.id, 'up')} disabled={isSaving || index === 0} className="button button-icon">↑</button>
                            <button onClick={() => handleReorder(cat.id, 'down')} disabled={isSaving || index === firestoreCategories.length - 1} className="button button-icon">↓</button>
                            <button onClick={() => handleDeleteCategory(cat.id, cat.name)} className="button button-danger" disabled={isSaving}>Sil</button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
// --- CategoryPanel Bitiş ---


// -------------------------------------------------------------------
// 🔹 Ana MenuPanel Bileşeni (GÜNCELLENDİ)
// -------------------------------------------------------------------
export default function MenuPanel({ onBack }) {
  const [activeTab, setActiveTab] = useState("products");
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [newProduct, setNewProduct] = useState({
    name: "", price: "", category: "", imageUrl: "", categoryOrder: 0
  });
  const [editingId, setEditingId] = useState(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isReordering, setIsReordering] = useState(false);

  // Firestore Dinleme
  useEffect(() => {
    const categoriesQuery = query(collection(db, "categories"), orderBy("order", "asc"));
    const unsubCategories = onSnapshot(categoriesQuery, (snap) => {
        const fetchedCategories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setCategories(fetchedCategories);
        setNewProduct(prev => {
            if (!prev.category && fetchedCategories.length > 0) {
                return { ...prev, category: fetchedCategories[0].name };
            }
            if (editingId && !fetchedCategories.some(c => c.name === prev.category) && fetchedCategories.length > 0) {
                 return { ...prev, category: fetchedCategories[0].name };
            }
            return prev;
        });
    });
    const unsubProducts = onSnapshot(collection(db, "products"), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubProducts(); unsubCategories(); };
  }, [editingId]);

  const uniqueCategories = useMemo(() => categories.map(c => c.name), [categories]);

  const productsGroupedByCategory = useMemo(() => {
    const grouped = {};
    categories.forEach(cat => { grouped[cat.name] = []; });
    products.forEach(p => {
        const catName = p.category || "Diğer";
        if (!grouped[catName]) grouped[catName] = [];
        grouped[catName].push(p);
    });
    Object.values(grouped).forEach(group => group.sort((a,b) => (a.categoryOrder || 0) - (b.categoryOrder || 0)));
    return grouped;
  }, [products, categories]);

  const deleteOldImage = async (url) => {
      if (!url || !url.includes("firebasestorage")) return;
      try {
          // URL'den dosya yolunu çıkar (bucket adı olmadan)
          const filePath = decodeURIComponent(url.split("/o/")[1].split("?")[0]);
          const imageRef = ref(storage, filePath);
          await deleteObject(imageRef);
          console.log("Eski görsel başarıyla silindi:", filePath);
      } catch (error) {
          // Dosya zaten yoksa (not-found hatası) uyarı verme
          if (error.code !== 'storage/object-not-found') {
             console.warn("Eski görsel silinemedi:", error);
          }
      }
  };

  // --- CRUD İşlemleri (handleSave GÜNCELLENDİ) ---
  const handleSave = async (e) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.price || !newProduct.category) return alert("Alanları doldurun");
    if (!uniqueCategories.includes(newProduct.category)) return alert("Geçersiz kategori");

    setUploading(true);
    let finalImageUrl = newProduct.imageUrl;
    let oldImageUrl = "";

    try {
      if (editingId) {
        const docSnap = await getDoc(doc(db, "products", editingId));
        oldImageUrl = docSnap.data()?.imageUrl;
      }

      // --- YENİ YÜKLEME MANTIĞI ---
      if (file) {
        console.log("Yeni dosya yükleniyor...");
        const filePath = `products/${newProduct.name}_${Date.now()}_${file.name}`;
        const storageRef = ref(storage, filePath); // Storage referansı oluştur

        console.log("Yükleme referansı:", storageRef);
        const snapshot = await uploadBytes(storageRef, file); // Dosyayı yükle
        console.log('Dosya yüklendi:', snapshot);

        finalImageUrl = await getDownloadURL(snapshot.ref); // Yüklenen dosyanın URL'sini al
        console.log('Alınan URL:', finalImageUrl);

        if (editingId && oldImageUrl) {
          console.log("Eski görsel siliniyor:", oldImageUrl);
          await deleteOldImage(oldImageUrl); // Eski görseli sil
        }
      }
      // --- YENİ YÜKLEME MANTIĞI BİTİŞ ---

      let finalCategoryOrder = newProduct.categoryOrder;
      if (!editingId || typeof finalCategoryOrder !== 'number' || finalCategoryOrder === 0) { // categoryOrder 0 ise de yeniden hesapla
           const productsInCategory = products.filter(p => p.category === newProduct.category && p.id !== editingId); // Kendisi hariç
           finalCategoryOrder = productsInCategory.length > 0
                ? Math.max(0, ...productsInCategory.map(p => p.categoryOrder || 0)) + 1
                : 1;
      }

      const productData = {
        name: newProduct.name,
        price: Number(newProduct.price),
        category: newProduct.category,
        imageUrl: finalImageUrl || "",
        categoryOrder: finalCategoryOrder,
      };

      console.log("Firestore'a kaydedilecek veri:", productData);

      if (editingId) {
        await updateDoc(doc(db, "products", editingId), productData);
        alert(`✅ Ürün güncellendi.`);
        setEditingId(null);
      } else {
        await addDoc(collection(db, "products"), productData);
        alert(`✅ Yeni ürün eklendi.`);
      }

      setNewProduct({ name: "", price: "", category: uniqueCategories[0] || "", imageUrl: "", categoryOrder: 0 });
      setFile(null);

    } catch (error) {
      console.error("🔥 Ürün kaydetme/yükleme hatası:", error);
      alert(`❌ İşlem başarısız oldu. Hata: ${error.message}`);
    } finally {
      console.log("Yükleme durumu false yapılıyor.");
      setUploading(false); // Her durumda yükleme durumunu false yap
    }
  };

  const handleEdit = (product) => {
    setEditingId(product.id);
    setNewProduct({
      name: product.name,
      price: product.price.toString(),
      category: product.category,
      imageUrl: product.imageUrl || "",
      categoryOrder: product.categoryOrder || 0,
    });
    setFile(null); // Düzenlemeye başlarken dosya seçimini temizle
  };

  const handleDelete = async (id, name, imageUrl) => {
    if (window.confirm(`${name} adlı ürünü silmek istediğinizden emin misiniz?`)) {
      try {
        await deleteDoc(doc(db, "products", id));
        if (imageUrl) {
            await deleteOldImage(imageUrl);
        }
        alert(`🗑️ ${name} silindi.`);
        // Eğer silinen ürün düzenleniyorsa, formu temizle
        if (editingId === id) {
            setEditingId(null);
            setNewProduct({ name: "", price: "", category: uniqueCategories[0] || "", imageUrl: "", categoryOrder: 0 });
            setFile(null);
        }
      } catch (error) { console.error("🔥 Ürün silme hatası:", error); alert("❌ Ürün silinemedi."); }
    }
  };

  const handleProductReorder = async (categoryName, productId, direction) => {
      const productsInCategory = productsGroupedByCategory[categoryName] || [];
      const index = productsInCategory.findIndex(p => p.id === productId);
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= productsInCategory.length) return;

      setIsReordering(true);
      try {
          const reorderedProducts = [...productsInCategory];
          const [movedProduct] = reorderedProducts.splice(index, 1);
          reorderedProducts.splice(newIndex, 0, movedProduct);
          const batch = writeBatch(db);
          reorderedProducts.forEach((product, idx) => {
              batch.update(doc(db, "products", product.id), { categoryOrder: idx + 1 });
          });
          await batch.commit();
      } catch (error) { console.error("🔥 Ürün sıralama hatası:", error); alert("❌ Ürün sıralaması güncellenemedi."); }
      finally { setIsReordering(false); }
  };

  // Render
  return (
    <div className="admin-subpanel-container">
      <div className="subpanel-header">
        <h2 className="subpanel-title">🍔 Menü Yönetim Paneli</h2>
        <button onClick={onBack} className="button button-secondary"> ← Ana Panele Dön </button>
      </div>
      <div className="tab-nav">
         <button onClick={() => setActiveTab("products")} className={`tab-button ${activeTab === "products" ? "active" : ""}`}> Ürünler </button>
         <button onClick={() => setActiveTab("categories")} className={`tab-button ${activeTab === "categories" ? "active" : ""}`}> Kategoriler ({categories.length}) </button>
      </div>

      {activeTab === "products" && (
        <>
          {/* Ürün Ekle/Düzenle Formu */}
          <div className="form-container product-form-container">
             <h3 className="form-title">{editingId ? "✏️ Ürün Düzenle" : "➕ Yeni Ürün Ekle"}</h3>
             <form onSubmit={handleSave} className="product-form">
                 <input type="text" placeholder="Ürün Adı" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} className="form-input" disabled={uploading} required/>
                 <input type="number" placeholder="Fiyat (₺)" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} className="form-input" disabled={uploading} required step="0.01"/>
                 <select value={newProduct.category} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })} className="form-select" disabled={uploading || categories.length === 0} required>
                     {categories.length === 0 ? <option value="" disabled>Önce kategori ekleyin</option> : uniqueCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                 </select>
                 <div className="form-input-file-wrapper">
                     <label className="form-label-inline">Görsel:</label>
                     <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} disabled={uploading} />
                 </div>
                 <div className="form-actions">
                     <button type="submit" className={`button ${editingId ? "button-blue" : "button-green"}`} disabled={uploading || !newProduct.name || !newProduct.price || !newProduct.category}>
                         {uploading ? 'İşleniyor...' : editingId ? "Değişiklikleri Kaydet" : "Yeni Ürün Ekle"}
                     </button>
                     {editingId && (
                         <button type="button" onClick={() => { setEditingId(null); setNewProduct({ name: "", price: "", category: uniqueCategories[0] || "", imageUrl: "", categoryOrder: 0 }); setFile(null); }} className="button button-secondary" disabled={uploading}>
                             İptal
                         </button>
                     )}
                 </div>
                 {editingId && newProduct.imageUrl && !file && ( // Yeni dosya seçilmediyse mevcut görseli göster
                     <div className="image-preview-wrapper">
                         <p className="image-preview-label">Mevcut Görsel:</p>
                         <img src={newProduct.imageUrl} alt="Mevcut" className="image-preview" />
                     </div>
                 )}
                 {file && ( // Yeni dosya seçildiyse önizlemesini göster
                     <div className="image-preview-wrapper">
                         <p className="image-preview-label">Yeni Görsel Önizleme:</p>
                         <img src={URL.createObjectURL(file)} alt="Önizleme" className="image-preview" />
                     </div>
                 )}
             </form>
          </div>

          {/* Kategorilere Göre Gruplanmış Ürün Listesi */}
          <h3 className="section-title">Tüm Menü Ürünleri (Kategoriye Göre Sıralı)</h3>
          {Object.entries(productsGroupedByCategory).map(([categoryName, categoryProducts]) => (
            <div key={categoryName} className="category-group">
                <h4 className="category-group-title">{categoryName} ({categoryProducts.length})</h4>
                {categoryProducts.length === 0 ? (
                    <p className="empty-text-small">Bu kategoride ürün yok.</p>
                ) : (
                    <div className="product-list">
                        {categoryProducts.map((p, index) => (
                          <div key={p.id} className="product-list-item">
                            <div className="product-info">
                                {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="product-item-image" />}
                                <div>
                                    <span className="product-item-name">{index + 1}. {p.name}</span>
                                    <span className="product-item-details">{p.price} ₺</span>
                                </div>
                            </div>
                            <div className="product-actions">
                              <button onClick={() => handleProductReorder(categoryName, p.id, 'up')} disabled={isReordering || index === 0} className="button button-icon" title="Yukarı Taşı"> ↑ </button>
                              <button onClick={() => handleProductReorder(categoryName, p.id, 'down')} disabled={isReordering || index === categoryProducts.length - 1} className="button button-icon" title="Aşağı Taşı"> ↓ </button>
                              <button onClick={() => handleEdit(p)} className="button button-yellow-outline" disabled={isReordering}> Düzenle </button>
                              <button onClick={() => handleDelete(p.id, p.name, p.imageUrl)} className="button button-danger-outline" disabled={isReordering}> Sil </button>
                            </div>
                          </div>
                        ))}
                    </div>
                )}
            </div>
          ))}
          {!products.length && !categories.length && (
              <p className="empty-text">Henüz menüye ürün veya kategori eklenmemiş.</p>
          )}
        </>
      )}

      {activeTab === "categories" && (
        <CategoryPanel firestoreCategories={categories} />
      )}
    </div>
  );
}