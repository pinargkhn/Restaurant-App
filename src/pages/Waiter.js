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
import useProducts from "../hooks/useProducts"; // ✅ Hook kullanılıyor

// -------------------------------------------------------------
// 🔹 HELPER FONKSİYONLAR (Aynı kalır)
// -------------------------------------------------------------
const mergeItems = (orders) => {
    const combined = {};
    orders.forEach((o) =>
      (o.items || []).forEach((it) => {
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
        items: mergeItems(list),
        status: getMergedStatus(list),
        newItemsAdded: getMergedNewItemsAdded(list),
        total: list.reduce((sum, o) => sum + (o.total || 0), 0),
        createdAt: latest.createdAt,
        updatedAt: latest.updatedAt,
      };
    });
};

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

// -------------------------------------------------------------

export default function Waiter() {
  const [orders, setOrders] = useState([]);
  const [pastPaid, setPastPaid] = useState([]);
  const [activeTab, setActiveTab] = useState("active");
  const [search, setSearch] = useState("");

  // 🔹 useProducts Hook'u (Menü verisi)
  const { allProducts: menuProducts, loading: loadingProducts, products: groupedProducts, categories: CATEGORIES } = useProducts(); 

  // Modal State'leri
  const [showEditModal, setShowEditModal] = useState(false);
  const [editOrder, setEditOrder] = useState(null);
  const [editCart, setEditCart] = useState([]); 
  const [isSaving, setIsSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState(""); 

  // Yeni Sipariş State'leri
  const [showTableInputModal, setShowTableInputModal] = useState(false);
  const [newOrderTableId, setNewTableId] = useState("");
  const [newOrderCart, setNewOrderCart] = useState([]); 

  // Ödeme State'leri
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("");
  
  // ---------------- FIRESTORE DİNLEME (Aynı kalır) ----------------
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

  // ---------------- VERİ BİRLEŞTİRME VE FİLTRELEME (Aynı kalır) ----------------
  const mergedOrders = useMemo(() => mergeOrdersByTable(orders), [orders]);

  const deliveredOrders = useMemo(
    () => mergedOrders.filter((o) => o.status === "Teslim Edildi"),
    [mergedOrders]
  );
  const activeOrders = useMemo(
    () => mergedOrders.filter((o) => o.status !== "Teslim Edildi"),
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
  
  // ---------------- Yeni Sipariş / Düzenleme Fonksiyonları (Menü ile uyumlu) ----------------
  
  const calculateTotal = (arr) =>
      arr.reduce((acc, item) => acc + (Number(item.qty) || 0) * (Number(item.price) || 0), 0);

  // 🔹 Yeni sipariş sepetine ürün ekle
  const addNewItemToCart = (item) => {
    const existing = newOrderCart.find(p => p.id === item.id);
    const newItems = existing
      ? newOrderCart.map(p => p.id === item.id ? { ...p, qty: Number(p.qty) + 1, price: Number(p.price) } : p)
      : [...newOrderCart, { ...item, qty: 1, price: Number(item.price), name: item.name }]; // name, price eklendi
    setNewOrderCart(newItems);
  };
  
  // 🔹 Düzenleme sepetine ürün ekle
  const addEditItemToCart = (item) => {
    const existing = editCart.find(p => p.id === item.id);
    const newItems = existing
      ? editCart.map(p => p.id === item.id ? { ...p, qty: Number(p.qty) + 1, price: Number(p.price) } : p)
      : [...editCart, { ...item, qty: 1, price: Number(item.price), name: item.name }]; // name, price eklendi
    setEditCart(newItems);
  };
  
  const newOrderTotal = useMemo(() => calculateTotal(newOrderCart), [newOrderCart]);
  const editOrderTotal = useMemo(() => calculateTotal(editCart), [editCart]);

  const handleNewOrderSubmit = async () => {
    if (!newOrderTableId || newOrderCart.length === 0) return;
    
    try {
        const tableRef = doc(db, "tables", newOrderTableId);
        const tableSnap = await getDoc(tableRef);
        if (!tableSnap.exists()) {
             alert(`❌ Hata: ${newOrderTableId} adlı masa sistemde kayıtlı değil.`);
             return;
        }

        await submitOrder({ 
            tableId: newOrderTableId, 
            items: newOrderCart, 
            total: newOrderTotal 
        });
        setNewOrderCart([]);
        setNewTableId("");
        setShowTableInputModal(false);
        alert(`✅ ${newOrderTableId} için sipariş başarıyla oluşturuldu!`);
    } catch (e) {
        console.error("Yeni sipariş hatası:", e);
        alert("❌ Yeni sipariş oluşturulamadı.");
    }
  };

  const handleEditOrderSave = async () => {
      if (!editOrder || editCart.length === 0) return;

      setIsSaving(true);
      try {
          // Önceki tüm alt belgeleri sil ve yeni, güncellenmiş tek bir sipariş belgesi gönder
          for (const sub of editOrder.orderDocuments) {
              const ref = doc(db, "tables", editOrder.tableId, "orders", sub.id);
              await deleteDoc(ref);
          }
          
          await submitOrder({
              tableId: editOrder.tableId,
              items: editCart,
              total: editOrderTotal,
              isModification: true, 
          });

          setShowEditModal(false);
          setEditOrder(null);
          setEditCart([]);
          alert("✅ Sipariş başarıyla düzenlendi ve mutfağa gönderildi.");

      } catch (e) {
          console.error("Sipariş düzenleme hatası:", e);
          alert("❌ Sipariş düzenlenirken bir hata oluştu.");
      } finally {
          setIsSaving(false);
      }
  };
  
  // ---------------- Diğer Garson İşlevleri (Teslim Etme/Ödeme) ----------------
  
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
  
  // ---------------- Modal Açılış Fonksiyonları ----------------
  
  const openTableInputModal = () => {
    setNewTableId("");
    setNewOrderCart([]);
    setActiveCategory(CATEGORIES[0] || "");
    setShowTableInputModal(true);
  };
  
  const openEditModal = (order) => {
    setEditOrder(order);
    // Mevcut sipariş öğelerini price ve qty'yi Number yaparak yüklüyoruz
    setEditCart(order.items?.map(p => ({ ...p, qty: Number(p.qty), price: Number(p.price) })) || []);
    setActiveCategory(CATEGORIES[0] || "");
    setShowEditModal(true);
  };
  
  // ---------------- RENDER ----------------
  
  if (loadingProducts) {
      return (
        <div className="flex items-center justify-center h-screen text-lg font-semibold text-gray-600">
          Menü verileri yükleniyor...
        </div>
      );
  }
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3 border-b pb-2">
            <h2 className="text-2xl font-bold">🧑‍🍳 Garson Paneli</h2>
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

        {/* Sekmeler (Aktif, Teslim Edilenler, Ödemesi Alınanlar) */}
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

        {/* Sipariş Listesi */}
        {filteredList.map((o) => (
            <div 
                key={o.tableId} 
                className={`p-3 border rounded mb-3 ${getBgColor(o)}`} 
            >
                <div className="flex justify-between items-center">
                    <p className="font-semibold">
                        Masa: {o.tableId}
                        {activeTab !== 'paid' && (
                            <span className="text-sm text-gray-500 ml-2">
                                ({o.status})
                            </span>
                        )}
                    </p>
                    <p className="font-semibold">{o.total} ₺</p>
                </div>
                
                {/* UYARI ÖZELLİĞİ */}
                {o.newItemsAdded && activeTab !== 'paid' && (
                    <p className="text-red-600 text-sm font-semibold mt-1 animate-pulse">
                        ⚠️ Yeni ürün eklendi – Mutfaktan onay bekleniyor
                    </p>
                )}

                <p className="text-sm text-gray-700 mt-1">
                    <strong>Ürünler:</strong>{" "}
                    {o.items?.map((i) => `${i.name} ×${i.qty}`).join(", ")}
                </p>

                {/* Butonlar */}
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


        {/* Yeni Sipariş Oluşturma Modalı - Table Input */}
        {showTableInputModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md max-h-[90vh] flex flex-col">
              <h3 className="text-xl font-bold mb-4">Yeni Sipariş Oluştur</h3>
              <input
                type="text"
                placeholder="Masa ID (Örn: masa_7)"
                value={newOrderTableId}
                onChange={(e) => setNewTableId(e.target.value)}
                className="w-full border p-2 rounded mb-4"
              />
              
              {/* Kategori Sekmeleri */}
              <div className="flex overflow-x-auto border-b mb-3">
                {CATEGORIES.map(category => (
                  <button key={category} 
                          onClick={() => setActiveCategory(category)}
                          className={`px-3 py-1 text-sm font-semibold ${activeCategory === category ? 'border-b-2 border-blue-600' : 'text-gray-600'}`}>
                    {category}
                  </button>
                ))}
              </div>

              {/* ÜRÜN SEÇİM ALANI */}
              <div className="flex-1 overflow-y-auto mb-4 border p-2 rounded">
                <h4 className="font-semibold mb-2">Ürün Ekle ({activeCategory})</h4>
                <div className="space-y-1">
                    {(groupedProducts[activeCategory] || []).map((item) => (
                      <div key={item.id} className="flex justify-between items-center py-1 border-b last:border-b-0">
                        <span>{item.name} ({item.price} ₺)</span>
                        <button
                          onClick={() => addNewItemToCart(item)}
                          className="bg-blue-500 text-white text-xs px-2 py-1 rounded hover:bg-blue-600"
                        >
                          + Ekle
                        </button>
                      </div>
                    ))}
                </div>
              </div>
              
              {/* Sepet ve Toplam */}
              <div className="flex-shrink-0 border-t pt-3">
                <h4 className="font-semibold mb-2">Sepet ({newOrderTotal.toFixed(2)} ₺)</h4>
                <ul className="list-disc ml-5 text-sm max-h-20 overflow-y-auto">
                    {newOrderCart.map(item => (
                        <li key={item.id}>{item.name} x{item.qty}</li>
                    ))}
                </ul>
                
                <div className="flex gap-2 mt-4">
                  <button
                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-60"
                    onClick={handleNewOrderSubmit}
                    disabled={!newOrderTableId || newOrderCart.length === 0}
                  >
                    Siparişi Oluştur
                  </button>
                  <button
                    className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
                    onClick={() => setShowTableInputModal(false)}
                  >
                    Kapat
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Sipariş Düzenleme Modalı */}
        {showEditModal && editOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
             <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl relative max-h-[90vh] flex flex-col">
                <button
                    onClick={() => setShowEditModal(false)}
                    className="absolute top-2 right-3 text-gray-600 hover:text-black text-xl z-30"
                >
                    ✕
                </button>
                <h3 className="text-xl font-bold mb-4">Sipariş Düzenle: {editOrder.tableId}</h3>
                
                {/* Kategori Sekmeleri */}
                <div className="flex overflow-x-auto border-b mb-3">
                    {CATEGORIES.map(category => (
                      <button key={category} 
                              onClick={() => setActiveCategory(category)}
                              className={`px-3 py-1 text-sm font-semibold ${activeCategory === category ? 'border-b-2 border-blue-600' : 'text-gray-600'}`}>
                        {category}
                      </button>
                    ))}
                </div>

                {/* ÜRÜN SEÇİM ALANI (Kaydırılabilir) */}
                <div className="flex-1 overflow-y-auto mb-4 border p-2 rounded">
                    <h4 className="font-semibold mb-2">Menüden Ürün Ekle ({activeCategory})</h4>
                    <div className="space-y-1">
                        {(groupedProducts[activeCategory] || []).map((item) => (
                          <div key={item.id} className="flex justify-between items-center py-1 border-b last:border-b-0">
                            <span>{item.name} ({item.price} ₺)</span>
                            <button
                              onClick={() => addEditItemToCart(item)}
                              className="bg-blue-500 text-white text-xs px-2 py-1 rounded hover:bg-blue-600"
                            >
                              + Ekle
                            </button>
                          </div>
                        ))}
                    </div>

                    {/* MEVCUT SEPET DURUMU */}
                    <h4 className="font-semibold mt-4 mb-2 border-t pt-2">Düzenlenen Sepet ({editOrderTotal.toFixed(2)} ₺)</h4>
                    <ul className="space-y-2 max-h-40 overflow-y-auto border p-2 rounded text-sm">
                      {editCart.map(item => (
                        <li key={item.id} className="flex justify-between items-center">
                          <span>{item.name} x{item.qty} ({item.qty * item.price} ₺)</span>
                          <div>
                            <button className="bg-gray-200 px-2 rounded" 
                                onClick={() => setEditCart(prev => prev.map(p => p.id === item.id ? {...p, qty: p.qty - 1} : p).filter(p => p.qty > 0))}>-</button>
                            <button className="bg-gray-200 px-2 rounded ml-1" 
                                onClick={() => setEditCart(prev => prev.map(p => p.id === item.id ? {...p, qty: p.qty + 1} : p))}>+</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                </div>
                
                {/* Alt Bilgi (Sabit) */}
                <div className="flex gap-2 mt-4 flex-shrink-0">
                    <button
                        className="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-60"
                        onClick={handleEditOrderSave}
                        disabled={editCart.length === 0 || isSaving}
                    >
                        {isSaving ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
                    </button>
                    <button
                        className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
                        onClick={() => setShowEditModal(false)}
                    >
                        İptal
                    </button>
                </div>
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