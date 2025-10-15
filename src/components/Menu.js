import React, { useState, useEffect, useMemo } from "react";
import {
  collection,
  collectionGroup,
  doc,
  updateDoc,
  onSnapshot,
  deleteDoc,
  getDoc, 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { submitOrder, moveToPastOrders } from "../lib/orders";

// 🔹 Güncellenmiş ve kategorize edilmiş menü listesi (Menu.js ile senkronize)
const MENU_ITEMS = {
  Yemekler: [
    { id: 1, name: "Pizza (Büyük)", price: 120 },
    { id: 2, name: "Hamburger Menü", price: 100 },
    { id: 3, name: "Lahmacun", price: 60 },
    { id: 6, name: "Izgara Tavuk", price: 140 },
    { id: 7, name: "Çiftlik Salatası", price: 75 },
    { id: 14, name: "Makarna Çeşitleri", price: 85 }, 
    { id: 15, name: "Sote", price: 130 }, 
  ],
  İçecekler: [
    { id: 4, name: "Ayran", price: 20 },
    { id: 5, name: "Kola", price: 25 },
    { id: 8, name: "Şeftali Suyu", price: 35 }, 
    { id: 9, name: "Su (Şişe)", price: 10 }, 
    { id: 16, name: "Soda", price: 15 }, 
    { id: 17, name: "Limonata", price: 40 }, 
  ],
  Tatlılar: [
    { id: 10, name: "Sufle", price: 55 },
    { id: 11, name: "Kazandibi", price: 45 },
    { id: 12, name: "Sütlaç", price: 40 }, 
    { id: 13, name: "Trileçe", price: 65 }, 
  ],
};
const CATEGORIES = Object.keys(MENU_ITEMS);

// Garsonun kullanacağı tekil ürün listesini oluştur
const allProducts = Object.values(MENU_ITEMS).flat();


export default function Waiter() {
  const [orders, setOrders] = useState([]);
  const [pastPaid, setPastPaid] = useState([]);
  const [activeTab, setActiveTab] = useState("active");
  const [search, setSearch] = useState("");

  // modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editOrder, setEditOrder] = useState(null);
  const [editCart, setEditCart] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  // 🔹 Aktif kategori state'i
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);

  // Yeni Sipariş Modal State'i
  const [showTableInputModal, setShowTableInputModal] = useState(false);
  const [newOrderTableId, setNewOrderTableId] = useState("");

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("");

  // 🔹 Ürünler artık tekil listeden alınıyor
  const products = useMemo(() => allProducts, []);

  // Toplam fiyat artık matematiksel olarak doğru hesaplanıyor
  const total = (arr) =>
    arr.reduce((sum, p) => sum + Number(p.price) * Number(p.qty), 0);

  // ---------------- Firestore ----------------
  useEffect(() => {
    const tablesRef = collection(db, "tables");
    const unsubTables = onSnapshot(tablesRef, (tablesSnap) => {
      const unsubscribers = [];
      let allOrders = [];
      tablesSnap.forEach((t) => {
        const ordersRef = collection(db, "tables", t.id, "orders");
        const unsub = onSnapshot(ordersRef, (snap) => {
          allOrders = allOrders
            .filter((o) => o.tableId !== t.id)
            .concat(
              snap.docs.map((d) => ({
                id: d.id,
                tableId: t.id,
                ...d.data(),
              }))
            );
          setOrders([...allOrders]);
        });
        unsubscribers.push(unsub);
      });
      return () => unsubscribers.forEach((u) => u());
    });
    return () => unsubTables();
  }, []);

  useEffect(() => {
    const unsubPast = onSnapshot(collectionGroup(db, "pastOrders"), (snap) => {
      setPastPaid(snap.docs.map((d) => ({ id: d.id, ...d.data() })) || []);
    });
    return () => unsubPast();
  }, []);

  // ---------------- Merge helpers ----------------
  const mergeItems = (orders) => {
    const combined = {};
    orders.forEach((o) =>
      (o.items || []).forEach((it) => {
        // Miktar toplarken her zaman sayıya çevir
        const qty = Number(it.qty) || 0;
        if (combined[it.id]) combined[it.id].qty += qty;
        else combined[it.id] = { ...it, qty };
      })
    );
    return Object.values(combined);
  };

  const getMergedStatus = (orders) => {
    if (orders.every((o) => o.status === "Teslim Edildi")) return "Teslim Edildi";
    if (orders.some((o) => o.status === "Hazır")) return "Hazır";
    if (orders.some((o) => o.status === "Hazırlanıyor")) return "Hazırlanıyor";
    return "Yeni";
  };

  const getMergedNewItemsAdded = (orders) =>
    orders.some((o) => o.newItemsAdded === true);

  const mergeOrdersByTable = (all) => {
    const nonPaid = all.filter((o) => o.paymentStatus !== "Alındı");
    const grouped = nonPaid.reduce((a, o) => {
      (a[o.tableId] ||= []).push(o);
      return a;
    }, {});
    return Object.entries(grouped).map(([tableId, list]) => {
      const latest = list.sort(
        (a, b) =>
          (b.updatedAt?.seconds || b.createdAt?.seconds || 0) -
          (a.updatedAt?.seconds || a.createdAt?.seconds || 0)
      )[0];
      return {
        tableId,
        id: list.map((x) => x.id),
        orderDocuments: list,
        items: mergeItems(list), // MergeItems artık güvenli sayı döndürüyor
        status: getMergedStatus(list),
        newItemsAdded: getMergedNewItemsAdded(list),
        total: list.reduce((sum, o) => sum + (o.total || 0), 0),
        createdAt: latest.createdAt,
        updatedAt: latest.updatedAt,
      };
    });
  };

  const mergedOrders = useMemo(() => mergeOrdersByTable(orders), [orders]);

  const activeOrders = useMemo(
    () => mergedOrders.filter((o) => o.status !== "Teslim Edildi"),
    [mergedOrders]
  );
  const deliveredOrders = useMemo(
    () => mergedOrders.filter((o) => o.status === "Teslim Edildi"),
    [mergedOrders]
  );
  const paidOrders = useMemo(
    () => pastPaid.filter((o) => o.paymentStatus === "Alındı"),
    [pastPaid]
  );

  const filteredList = useMemo(() => {
    const list =
      activeTab === "active"
        ? activeOrders
        : activeTab === "delivered"
        ? deliveredOrders
        : paidOrders;
    if (!search.trim()) return list;
    return list.filter((o) =>
      o.tableId?.toLowerCase().includes(search.trim().toLowerCase())
    );
  }, [activeTab, search, activeOrders, deliveredOrders, paidOrders]);

  // ---------------- Colors ----------------
  const getBgColor = (o) => {
    if (o.newItemsAdded) return "bg-red-100";
    switch (o.status) {
      case "Hazır":
        return "bg-green-100";
      case "Hazırlanıyor":
        return "bg-yellow-100";
      default:
        return "bg-white";
    }
  };

  // ---------------- Edit Modal İşlemleri ----------------
  const openEditModal = (order) => {
    setEditOrder(order);
    // Mevcut siparişin ürünlerini yüklüyoruz ve miktar güvenliğini sağlıyoruz.
    setEditCart(order.items?.map(p => ({ ...p, qty: Number(p.qty) })) || []);
    setShowEditModal(true);
    setActiveCategory(CATEGORIES[0]); // Modalı açarken ilk kategoriye dön
  };
  
  // YENİ SİPARİŞ İŞLEMLERİ: Masa Doğrulama
  const checkTableValidity = async () => {
    if (!newOrderTableId.trim()) return alert("Masa ID'si boş olamaz.");

    try {
      const idToValidate = newOrderTableId.trim();
      const ref = doc(db, "tables", idToValidate);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        alert(`❌ Hata: ${idToValidate} adlı masa sistemde kayıtlı değil.`);
        return;
      }
      
      // Masa geçerliyse, sipariş modalını aç
      openNewOrderModal(idToValidate);
    } catch (e) {
      console.error("Masa doğrulama hatası:", e);
      alert("Sunucu hatası oluştu. Lütfen tekrar deneyin.");
    }
  };

  const openTableInputModal = () => {
    setNewOrderTableId("");
    setShowTableInputModal(true);
  };

  const openNewOrderModal = (tableId) => {
    setEditOrder({ tableId: tableId, orderDocuments: [], isNewOrder: true });
    setEditCart([]); // Sepeti boş başlat
    setShowTableInputModal(false);
    setShowEditModal(true);
    setActiveCategory(CATEGORIES[0]); // Modalı açarken ilk kategoriye dön
  };

  const addToEditCart = (product) => {
    setEditCart((prev) => {
      const existing = prev.find((p) => p.id === product.id);
      
      return existing
        ? prev.map((p) =>
            p.id === product.id
              ? { ...p, qty: Number(p.qty) + 1 } 
              : p
          )
        : [...prev, { ...product, qty: 1 }];
    });
  };

  const increaseQty = (id) =>
    setEditCart((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, qty: Number(p.qty) + 1 } 
          : p
      )
    );

  const decreaseQty = (id) =>
    setEditCart((prev) =>
      prev
        .map((p) =>
          p.id === id
            ? { ...p, qty: Math.max(0, Number(p.qty) - 1) } 
            : p
        )
        .filter((p) => p.qty > 0)
    );

  const removeFromEditCart = (id) =>
    setEditCart((prev) => prev.filter((p) => p.id !== id));

  const saveEditedOrder = async () => {
    if (!editOrder || editCart.length === 0) return;
    setIsSaving(true);
    
    // Yeni Sipariş ise: Sadece submit et
    if (editOrder.isNewOrder) {
        try {
            await submitOrder({
                tableId: editOrder.tableId,
                items: editCart,
                total: total(editCart),
                // isModification: false, // İlk sipariş olduğu için zorlamaya gerek yok
            });
            alert(`✅ ${editOrder.tableId} için yeni sipariş başarıyla oluşturuldu!`);
        } catch (e) {
            console.error("❌ Yeni sipariş oluşturma başarısız:", e);
            alert("❌ Yeni sipariş oluşturma başarısız!");
        } finally {
            setIsSaving(false);
            setShowEditModal(false);
            return;
        }
    }

    // Mevcut Sipariş Düzenlemesi ise: Sil ve yeniden kaydet (Uyarıyı tetikle)
    try {
      // 1. ADIM: Mevcut aktif alt sipariş belgelerini sil
      for (const sub of editOrder.orderDocuments) {
        const ref = doc(db, "tables", editOrder.tableId, "orders", sub.id);
        await deleteDoc(ref);
      }
      
      // 2. ADIM: Güncel sepet içeriğini tek BİR YENİ sipariş belgesi olarak kaydet
      await submitOrder({
        tableId: editOrder.tableId,
        items: editCart,
        total: total(editCart),
        isModification: true, // ✅ KRİTİK: Düzenleme yapıldığını belirtiyoruz
      });

      alert(`✅ ${editOrder.tableId} masasının siparişi başarıyla güncellendi (Azaltma/Silme dahil).`);
    } catch (e) {
      console.error("❌ Güncelleme başarısız:", e);
      alert("❌ Güncelleme başarısız! Console'u kontrol et.");
    } finally {
      setIsSaving(false);
      setShowEditModal(false);
    }
  };

  // ---------------- Teslim Edildi ----------------
  const markDelivered = async (o) => {
    try {
      for (const sub of o.orderDocuments) {
        const ref = doc(db, "tables", o.tableId, "orders", sub.id);
        await updateDoc(ref, { status: "Teslim Edildi" });
      }
      alert(`🚚 ${o.tableId} masası 'Teslim Edildi' olarak işaretlendi.`);
    } catch (err) {
      console.error("❌ Teslim Edildi güncellemesi hatası:", err);
      alert("Güncelleme başarısız!");
    }
  };

  // ---------------- Ödeme ----------------
  const openPayment = (o) => {
    setSelectedOrder(o);
    setShowPaymentModal(true);
  };

  const confirmPayment = async () => {
    if (!selectedOrder || !paymentMethod) return;
    try {
      for (const sub of selectedOrder.orderDocuments) {
        const ref = doc(db, "tables", selectedOrder.tableId, "orders", sub.id);
        await updateDoc(ref, {
          paymentStatus: "Alındı",
          paymentAt: new Date(),
          paymentMethod,
        });
      }
      await moveToPastOrders(selectedOrder.tableId, selectedOrder.id[0], {
        ...selectedOrder,
        paymentStatus: "Alındı",
      });
      alert("💰 Ödeme kaydedildi!");
    } catch (err) {
      console.error(err);
      alert("❌ Ödeme kaydedilemedi.");
    } finally {
      setShowPaymentModal(false);
      setSelectedOrder(null);
      setPaymentMethod("");
    }
  };

  // ---------------- Render ----------------
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3 border-b pb-2">
        <h2 className="text-2xl font-bold">🧑‍🍳 Garson Paneli</h2>
        
        {/* Yeni Sipariş Butonu */}
        <button 
            onClick={openTableInputModal}
            className="bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700 font-semibold transition"
        >
            ➕ Yeni Sipariş Başlat
        </button>

        <input
          type="text"
          placeholder="Masa ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-3 py-2 w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* Sekmeler */}
      <div className="flex border-b border-gray-300 mb-4">
        <button
          onClick={() => setActiveTab("active")}
          className={`px-4 py-2 font-semibold ${
            activeTab === "active" ? "border-b-2 border-blue-600" : ""
          }`}
        >
          Aktif Siparişler
        </button>
        <button
          onClick={() => setActiveTab("delivered")}
          className={`px-4 py-2 font-semibold ${
            activeTab === "delivered" ? "border-b-2 border-blue-600" : ""
          }`}
        >
          Teslim Edilenler
        </button>
        <button
          onClick={() => setActiveTab("paid")}
          className={`px-4 py-2 font-semibold ${
            activeTab === "paid" ? "border-b-2 border-blue-600" : ""
          }`}
        >
          Ödemesi Alınanlar
        </button>
      </div>

      {filteredList.map((o) => (
        <div
          key={o.tableId}
          className={`p-3 border rounded mb-3 ${getBgColor(o)}`}
        >
          <div className="flex justify-between items-center">
            <p className="font-semibold">
              Masa: {o.tableId}
              {/* Ödemesi alınanlar sekmesinde sipariş durumu göstermiyoruz */}
              {activeTab !== 'paid' && (
                <span className="text-sm text-gray-500 ml-2">
                  ({o.status})
                </span>
              )}
            </p>
            <p className="font-semibold">{o.total} ₺</p>
          </div>

          {/* Uyarı sadece Aktif/Teslim Edilenler sekmesinde görünür */}
          {o.newItemsAdded && activeTab !== 'paid' && (
            <p className="text-red-600 text-sm font-semibold mt-1 animate-pulse">
              ⚠️ Yeni ürün eklendi – Mutfaktan onay bekleniyor
            </p>
          )}

          <p className="text-sm text-gray-700 mt-1">
            <strong>Ürünler:</strong>{" "}
            {o.items?.map((i) => `${i.name} ×${i.qty}`).join(", ")}
          </p>

          {/* Butonları sadece Aktif ve Teslim Edilenler sekmesinde göster */}
          {activeTab !== 'paid' && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => openEditModal(o)}
                className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
              >
                ✏️ Düzenle
              </button>
              {o.status !== "Teslim Edildi" && (
                <button
                  onClick={() => markDelivered(o)}
                  className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                >
                  🚚 Teslim Edildi
                </button>
              )}
              {o.status === "Teslim Edildi" && (
                <button
                  onClick={() => openPayment(o)}
                  className="bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700"
                >
                  💰 Ödeme Al
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Düzenleme/Yeni Sipariş Modalı */}
      {showEditModal && editOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setShowEditModal(false)}
              className="absolute top-2 right-3 text-gray-600 hover:text-black text-xl z-30"
            >
              ✕
            </button>
            
            {/* Modal Başlık ve Sepet Bilgisi (Sabit Kısım - I) */}
            <div className="flex-shrink-0 border-b pb-3 mb-3">
                <h3 className="text-xl font-bold">
                {editOrder.isNewOrder ? "➕ Yeni Sipariş Oluştur" : "✏️ Siparişi Düzenle"} ({editOrder.tableId})
                </h3>
            </div>

            {/* 🔹 KATEGORİ SEKMELERİ (Sabit Kısım - II) */}
            <div className="flex-shrink-0 border-b border-gray-300 mb-4 overflow-x-auto whitespace-nowrap sticky top-0 bg-white z-20 pt-1 -mx-2 px-2">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`px-3 py-2 text-sm font-semibold transition-colors ${
                    activeCategory === category
                      ? "border-b-2 border-blue-600 text-blue-600"
                      : "text-gray-600 hover:text-blue-500"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            {/* 🔹 KAYDIRILABİLİR İÇERİK ALANI */}
            <div className="overflow-y-auto flex-1 pb-4 pr-1"> {/* pr-1 kaydırma çubuğu için boşluk sağlar */}
                {/* YENİ ÜRÜN EKLEME ALANI (Aktif Kategoriye Göre Filtrelenir) */}
                <h4 className="font-semibold mb-2">Ürün Ekle ({activeCategory})</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 border-b pb-4">
                {/* Sadece aktif kategoriye ait ürünleri göster */}
                {MENU_ITEMS[activeCategory]?.map((p) => (
                    <div
                    key={p.id}
                    className="border rounded p-3 flex flex-col justify-between bg-gray-50 shadow-sm"
                    >
                    <div>
                        <h4 className="font-semibold">{p.name}</h4>
                        <p className="text-gray-600 text-sm">{p.price} ₺</p>
                    </div>
                    <button
                        onClick={() => addToEditCart(p)}
                        className="mt-2 bg-blue-600 text-white py-1 rounded hover:bg-blue-700"
                    >
                        Ekle
                    </button>
                    </div>
                ))}
                </div>

                <div className="pt-3">
                <h4 className="font-semibold mb-2">Sepet ({editOrder.isNewOrder ? "Yeni Sipariş" : "Mevcut + Yeni Ürünler"})</h4>
                {editCart.length === 0 ? (
                    <p className="text-gray-500 text-sm">Sepet boş.</p>
                ) : (
                    editCart.map((p) => (
                    <div
                        key={p.id}
                        className="flex justify-between items-center mb-2 text-sm"
                    >
                        <span>
                        {p.name} × {p.qty}
                        </span>
                        <div className="flex items-center gap-2">
                        <button
                            onClick={() => decreaseQty(p.id)}
                            className="bg-gray-200 px-2"
                        >
                            −
                        </button>
                        <button
                            onClick={() => increaseQty(p.id)}
                            className="bg-gray-200 px-2"
                        >
                            +
                        </button>
                        <button
                            onClick={() => removeFromEditCart(p.id)}
                            className="text-red-600"
                        >
                            Sil
                        </button>
                        </div>
                    </div>
                    ))
                )}
                </div>
            </div>
            
            {/* TOPLAM ve KAYDET Butonu (Sabit Kısım - III) */}
            <div className="flex-shrink-0 flex justify-between items-center mt-4 border-t pt-3 sticky bottom-0 bg-white z-20">
              <strong>Toplam: {total(editCart)} ₺</strong>
              <button
                onClick={saveEditedOrder}
                disabled={isSaving || editCart.length === 0}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-60"
              >
                {editOrder.isNewOrder ? "Siparişi Oluştur" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Masa ID Giriş Modalı */}
      {showTableInputModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-sm relative">
            <h3 className="text-xl font-bold mb-4 text-center">Yeni Sipariş Masa ID</h3>
            
            <input
                type="text"
                placeholder="Masa ID girin (Örn: masa_1, A1)"
                value={newOrderTableId}
                onChange={(e) => setNewOrderTableId(e.target.value)}
                className="border p-2 rounded w-full mb-4 text-center"
            />
            
            <button
                onClick={checkTableValidity}
                disabled={!newOrderTableId.trim()}
                className="w-full bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-60 mb-2"
            >
                Siparişi Başlat
            </button>
            
            <button
              className="w-full text-gray-500 hover:text-black mt-2"
              onClick={() => setShowTableInputModal(false)}
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {/* Ödeme Modalı */}
      {showPaymentModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-96 text-center">
            <h3 className="text-xl font-bold mb-4">💰 Ödeme Yöntemi Seç</h3>
            <p className="mb-4 text-gray-700">
              Masa: <strong>{selectedOrder.tableId}</strong>
              <br />
              Toplam: <strong>{selectedOrder.total} ₺</strong>
            </p>
            <div className="flex flex-col gap-3">
              <button
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                onClick={() => {
                  setPaymentMethod("Kart");
                  confirmPayment();
                }}
              >
                💳 Kredi/Banka Kartı
              </button>
              <button
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                onClick={() => {
                  setPaymentMethod("Nakit");
                  confirmPayment();
                }}
              >
                💵 Nakit
              </button>
            </div>
            <button
              className="mt-4 text-gray-500 hover:text-black"
              onClick={() => {
                setShowPaymentModal(false);
                setSelectedOrder(null);
              }}
            >
              İptal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}