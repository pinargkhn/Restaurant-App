// src/pages/MenuPanel.js
import { useState, useEffect, useMemo } from "react";
import { 
  db, 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  addDoc 
} from "../lib/firebase";

export default function MenuPanel({ onBack }) { // onBack prop'u eklendi
  const [products, setProducts] = useState([]);
  const [newProduct, setNewProduct] = useState({
    name: "",
    price: "",
    category: "Yemekler",
    imageUrl: "", 
  });
  const [editingId, setEditingId] = useState(null);

  // Kategorileri dinamik olarak çekmek için mevcut ürünlerden faydalanıyoruz
  const uniqueCategories = useMemo(() => {
    const categories = new Set(products.map(p => p.category));
    if (!categories.has("Yemekler")) categories.add("Yemekler");
    if (!categories.has("İçecekler")) categories.add("İçecekler");
    if (!categories.has("Tatlılar")) categories.add("Tatlılar");
    return Array.from(categories).sort();
  }, [products]);

  // ---------------- Firestore Dinleme ----------------
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

  // ---------------- CRUD İşlemleri (Aynı kalır) ----------------
  const handleSave = async (e) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.price || !newProduct.category) {
        alert("Lütfen tüm alanları doldurun.");
        return;
    }
    try {
      const productData = {
        name: newProduct.name,
        price: Number(newProduct.price),
        category: newProduct.category,
        imageUrl: newProduct.imageUrl || "", 
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
      setNewProduct({ name: "", price: "", category: uniqueCategories[0] || "Yemekler", imageUrl: "" });
    } catch (error) {
      console.error("🔥 Ürün kaydetme hatası:", error);
      alert("❌ İşlem başarısız oldu. Konsolu kontrol edin.");
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
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`${name} adlı ürünü silmek istediğinizden emin misiniz?`)) {
      try {
        await deleteDoc(doc(db, "products", id));
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

      {/* Ürün Ekle/Düzenle Formu (Aynı kalır) */}
      <div className="border p-4 rounded-lg shadow mb-8 bg-gray-50">
        <h3 className="text-xl font-semibold mb-4">
          {editingId ? "✏️ Ürün Düzenle" : "➕ Yeni Ürün Ekle"}
        </h3>
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* ... (Form inputları aynı kalır) */}
          <input
            type="text"
            placeholder="Ürün Adı"
            value={newProduct.name}
            onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
            className="border p-2 rounded"
          />
          <input
            type="number"
            placeholder="Fiyat (₺)"
            value={newProduct.price}
            onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
            className="border p-2 rounded"
          />
          <select
            value={newProduct.category}
            onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
            className="border p-2 rounded bg-white"
          >
            {uniqueCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          
          <input
            type="text"
            placeholder="Görsel URL (Şimdilik Manuel)"
            value={newProduct.imageUrl}
            onChange={(e) => setNewProduct({ ...newProduct, imageUrl: e.target.value })}
            className="border p-2 rounded md:col-span-2"
          />
          
          <div className="flex gap-2">
            <button
              type="submit"
              className={`w-full text-white py-2 rounded font-semibold transition ${
                editingId ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {editingId ? "Kaydet" : "Ekle"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setNewProduct({ name: "", price: "", category: uniqueCategories[0] || "Yemekler", imageUrl: "" });
                }}
                className="bg-gray-400 text-white py-2 px-3 rounded hover:bg-gray-500"
              >
                İptal
              </button>
            )}
          </div>
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
                onClick={() => handleDelete(p.id, p.name)}
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