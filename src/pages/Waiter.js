import React, { useState, useEffect, useMemo } from "react";
import {
  collection,
  collectionGroup,
  doc,
  updateDoc,
  onSnapshot,
  deleteDoc,
  getDoc, 
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { submitOrder, moveToPastOrders } from "../lib/orders";
import useProducts from "../hooks/useProducts"; 

// -------------------------------------------------------------
// 🔹 HELPER FONKSİYONLAR
// -------------------------------------------------------------
// Hata Düzeltme: 'combined' değişkeni tanımlanarak 'no-undef' hatası giderildi.
const mergeItems = (orders) => {
    const combined = {}; // ✅ DÜZELTME: combined tanımlandı
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
        note: latest.note || "",
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

// Hata Düzeltme: 'at' ve 'bt' değişkenleri tanımlanarak 'no-undef' hatası giderildi.
const compareOrders = (a, b) => {
    if (a.newItemsAdded && !b.newItemsAdded) return -1;
    if (!a.newItemsAdded && b.newItemsAdded) return 1;
    
    // ✅ DÜZELTME: at ve bt değişkenleri tanımlandı
    const at = a.updatedAt?.seconds||a.createdAt?.seconds||0;
    const bt = b.updatedAt?.seconds||b.createdAt?.seconds||0; 
    
    return bt - at; // En yeniyi üste koy
};
// -------------------------------------------------------------

export default function Waiter() {
  const [orders, setOrders] = useState([]);
  const [pastPaid, setPastPaid] = useState([]);
  const [activeTab, setActiveTab] = useState("active");
  const [search, setSearch] = useState("");

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
  
  // ---------------- Hata Düzeltme: Toplam Hesaplama ----------------
  const calculateTotal = (arr) =>
      arr.reduce((acc, item) => acc + (Number(item.qty) || 0) * (Number(item.price) || 0), 0);

  const newOrderTotal = useMemo(() => calculateTotal(newOrderCart), [newOrderCart]);
  const editOrderTotal = useMemo(() => calculateTotal(editCart), [editCart]);

  // ---------------- FIRESTORE SİPARİŞ DİNLEME ----------------
  useEffect(() => {
    const tablesRef = collection(db, "tables");
    
    const unsubTables = onSnapshot(tablesRef, (tablesSnap) => {
      const unsubscribers = [];
      
      tablesSnap.forEach((t) => {
        const ordersRef = collection(db, "tables", t.id, "orders");
        
        const unsub = onSnapshot(ordersRef, (snap) => {
          
          const newTableOrders = snap.docs.map((d) => ({
            id: d.id,
            tableId: t.id,
            ...d.data(),
          }));

          setOrders(prev => {
              const otherOrders = prev.filter(o => o.tableId !== t.id);
              return [...otherOrders, ...newTableOrders];
          });
        });
        unsubscribers.push(unsub);
      });
      
      return () => unsubscribers.forEach((u) => u());
    });
    
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const pastOrdersRef = collectionGroup(db, "pastOrders");
    const pastOrdersQuery = query(
        pastOrdersRef
    );
    
    const unsubPast = onSnapshot(pastOrdersQuery, (snap) => {
      const allPastOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() })) || [];
      
      const filtered = allPastOrders.filter(o => 
          o.movedAt && o.movedAt.toDate() >= twentyFourHoursAgo
      );

      setPastPaid(filtered);
    });
    
    return () => {
        unsubTables();
        unsubPast();
    };
  }, []); 

  // ---------------- VERİ BİRLEŞTİRME VE FİLTRELEME ----------------
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
    if (!search.trim()) return list.sort(compareOrders);
    return list.filter((o) =>
      o.tableId?.toLowerCase().includes(search.trim().toLowerCase())
    ).sort(compareOrders);
  }, [activeTab, search, activeOrders, deliveredOrders, paidOrders]);
  
  // ---------------- Yeni Sipariş / Düzenleme Fonksiyonları (Aynı kalır) ----------------
  
  const addNewItemToCart = (item) => {
    const existing = newOrderCart.find(p => p.id === item.id);
    const newItems = existing
      ? newOrderCart.map(p => p.id === item.id ? { ...p, qty: Number(p.qty) + 1, price: Number(p.price) } : p)
      : [...newOrderCart, { ...item, qty: 1, price: Number(item.price), name: item.name }];
    setNewOrderCart(newItems);
  };
  
  const addEditItemToCart = (item) => {
    const existing = editCart.find(p => p.id === item.id);
    const newItems = existing
      ? editCart.map(p => p.id === item.id ? { ...p, qty: Number(p.qty) + 1, price: Number(p.price) } : p)
      : [...editCart, { ...item, qty: 1, price: Number(item.price), name: item.name }];
    setEditCart(newItems);
  };
  
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
          for (const sub of editOrder.orderDocuments) {
              const ref = doc(db, "tables", editOrder.tableId, "orders", sub.id);
              await deleteDoc(ref);
          }
          
          await submitOrder({
              tableId: editOrder.tableId,
              items: editCart,
              total: editOrderTotal,
              note: editOrder.note, 
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
  
  // ---------------- Diğer Garson İşlevleri (Aynı kalır) ----------------
  
  const markDelivered = async (o) => {
    if (!window.confirm(`${o.tableId} masası için siparişler teslim edildi mi?`)) return;
    try {
      for (const sub of o.orderDocuments) {
        const ref = doc(db, "tables", o.tableId, "orders", sub.id);
        await updateDoc(ref, { status: "Teslim Edildi", updatedAt: serverTimestamp(), newItemsAdded: false });
      }
      alert(`✅ ${o.tableId} masası teslim edildi olarak işaretlendi.`);
    } catch (err) {
      console.error("Teslim etme hatası:", err);
      alert("Hata oluştu, teslim edilemedi.");
    }
  };

  const openPayment = (o) => {
    setSelectedOrder(o);
    setPaymentMethod("");
    setShowPaymentModal(true);
  };

  const confirmPayment = async () => {
    if (!selectedOrder || !paymentMethod) return;

    try {
      for (const sub of selectedOrder.orderDocuments) {
        const docRef = doc(db, "tables", selectedOrder.tableId, "orders", sub.id);
        const docSnap = await getDoc(docRef);
        const orderData = { ...docSnap.data(), paymentMethod, paymentStatus: "Alındı" };

        await moveToPastOrders(selectedOrder.tableId, sub.id, orderData);
      }
      
      setShowPaymentModal(false);
      setSelectedOrder(null);
      alert(`✅ ${selectedOrder.tableId} masasının ödemesi (${paymentMethod}) alındı ve sipariş geçmişe taşındı.`);
    } catch (e) {
      console.error("Ödeme onaylama hatası:", e);
      alert("Ödeme alınırken bir hata oluştu.");
    }
  };

  const openTableInputModal = () => {
    setNewTableId("");
    setNewOrderCart([]);
    setActiveCategory(CATEGORIES[0] || "");
    setShowTableInputModal(true);
  };
  
  const openEditModal = (order) => {
    setEditOrder(order);
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
            <h2 className="text-2xl font-bold">🧑‍💼 Garson Paneli</h2>
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
                Ödemesi Alınanlar (Son 24 Saat)
            </button>
        </div>


        {/* Sipariş Listesi */}
        {filteredList.length === 0 && (
            <p className="text-gray-500 mt-4">Bu sekmede gösterilecek sipariş bulunmamaktadır.</p>
        )}
        {filteredList.map((o) => (
            <div 
                key={o.tableId + (activeTab === 'paid' ? o.updatedAt?.seconds || o.movedAt?.seconds : '')} 
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
                        {activeTab === 'paid' && (
                            <span className="text-sm text-gray-500 ml-2">
                                ({o.paymentMethod})
                            </span>
                        )}
                    </p>
                    <p className="font-semibold">{o.total.toFixed(2)} ₺</p>
                </div>
                
                {o.newItemsAdded && activeTab !== 'paid' && (
                    <p className="text-red-600 text-sm font-semibold mt-1 animate-pulse">
                        ⚠️ Yeni ürün eklendi – Mutfaktan onay bekleniyor
                    </p>
                )}
                
                {o.note && (
                    <div className="mt-2 p-2 bg-yellow-50 border-l-4 border-yellow-500 text-sm text-gray-800">
                        <strong>Not:</strong> {o.note}
                    </div>
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


        {/* Yeni Sipariş Oluşturma Modalı (Aynı kalır) */}
        {showTableInputModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
                <h3 className="text-xl font-bold mb-4">Yeni Sipariş Başlat: Masa Seçimi</h3>
                
                <div className="mb-4">
                    <input
                        type="text"
                        placeholder="Masa ID girin (örn: masa_1)"
                        value={newOrderTableId}
                        onChange={(e) => setNewTableId(e.target.value)}
                        className="border p-2 rounded w-full focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>

                <h4 className="font-semibold mb-2">Menü</h4>
                <div className="flex mb-4 overflow-x-auto border-b pb-1">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-3 py-1 text-sm rounded transition-all flex-shrink-0 ${
                                activeCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300 ml-1'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                <div className="mb-4 max-h-48 overflow-y-auto border p-2 rounded">
                    <ul className="space-y-2">
                        {(groupedProducts[activeCategory] || []).map(item => (
                            <li key={item.id} className="flex justify-between items-center p-2 border-b last:border-b-0">
                                <span>{item.name} ({item.price} ₺)</span>
                                <button
                                    onClick={() => addNewItemToCart(item)}
                                    className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
                                >
                                    Ekle
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>

                <h4 className="font-semibold mb-2">Sepet ({newOrderCart.length} ürün, Toplam: {newOrderTotal.toFixed(2)} ₺)</h4>
                <ul className="mb-4 space-y-2 max-h-48 overflow-y-auto border p-2 rounded bg-gray-50">
                    {newOrderCart.map(item => (
                        <li key={item.id} className="flex justify-between items-center text-sm">
                            <span>{item.name} x{item.qty}</span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setNewOrderCart(prev => prev.map(p => p.id === item.id ? {...p, qty: p.qty - 1} : p).filter(p => p.qty > 0))}
                                    className="px-2 bg-gray-300 rounded text-black"
                                >-</button>
                                <button
                                    onClick={() => setNewOrderCart(prev => prev.map(p => p.id === item.id ? {...p, qty: p.qty + 1} : p))}
                                    className="px-2 bg-gray-300 rounded text-black"
                                >+</button>
                            </div>
                        </li>
                    ))}
                </ul>

                <div className="flex justify-between gap-3 mt-4">
                    <button
                        onClick={() => setShowTableInputModal(false)}
                        className="bg-gray-500 text-white px-4 py-2 rounded flex-1 hover:bg-gray-600"
                    >
                        Kapat
                    </button>
                    <button
                        onClick={handleNewOrderSubmit}
                        disabled={!newOrderTableId || newOrderCart.length === 0}
                        className="bg-blue-600 text-white px-4 py-2 rounded flex-1 hover:bg-blue-700 disabled:bg-gray-400"
                    >
                        Siparişi Başlat
                    </button>
                </div>
            </div>
          </div>
        )}
        
        {/* Sipariş Düzenleme Modalı */}
        {showEditModal && editOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
             <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
                <h3 className="text-xl font-bold mb-4">Masa {editOrder.tableId} Siparişini Düzenle</h3>
                
                <h4 className="font-semibold mb-2">Menüden Ürün Ekle</h4>
                <div className="flex mb-4 overflow-x-auto border-b pb-1">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-3 py-1 text-sm rounded transition-all flex-shrink-0 ${
                                activeCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300 ml-1'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                <div className="mb-4 max-h-48 overflow-y-auto border p-2 rounded">
                    <ul className="space-y-2">
                        {(groupedProducts[activeCategory] || []).map(item => (
                            <li key={item.id} className="flex justify-between items-center p-2 border-b last:border-b-0">
                                <span>{item.name} ({item.price} ₺)</span>
                                <button
                                    onClick={() => addEditItemToCart(item)}
                                    className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
                                >
                                    Ekle
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>

                <h4 className="font-semibold mb-2">Güncel Sipariş ({editCart.length} ürün, Toplam: {editOrderTotal.toFixed(2)} ₺)</h4>
                <ul className="mb-4 space-y-2 max-h-48 overflow-y-auto border p-2 rounded bg-gray-50">
                    {editCart.map(item => (
                        <li key={item.id} className="flex justify-between items-center text-sm">
                            <span>{item.name} x{item.qty}</span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setEditCart(prev => prev.map(p => p.id === item.id ? {...p, qty: p.qty - 1} : p).filter(p => p.qty > 0))}
                                    className="px-2 bg-gray-300 rounded text-black"
                                >-</button>
                                <button
                                    onClick={() => setEditCart(prev => prev.map(p => p.id === item.id ? {...p, qty: p.qty + 1} : p))}
                                    className="px-2 bg-gray-300 rounded text-black"
                                >+</button>
                            </div>
                        </li>
                    ))}
                </ul>
                
                {editOrder.note && (
                    <div className="mt-2 p-2 bg-yellow-50 border-l-4 border-yellow-500 text-sm text-gray-800 mb-4">
                        <strong>Müşteri Notu:</strong> {editOrder.note}
                    </div>
                )}


                <div className="flex justify-between gap-3 mt-4">
                    <button
                        onClick={() => setShowEditModal(false)}
                        className="bg-gray-500 text-white px-4 py-2 rounded flex-1 hover:bg-gray-600"
                    >
                        Kapat
                    </button>
                    <button
                        onClick={handleEditOrderSave}
                        disabled={editCart.length === 0 || isSaving}
                        className="bg-red-600 text-white px-4 py-2 rounded flex-1 hover:bg-red-700 disabled:bg-gray-400"
                    >
                        {isSaving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet & Mutfağa Gönder'}
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
                Toplam: <strong>{selectedOrder.total.toFixed(2)} ₺</strong>
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