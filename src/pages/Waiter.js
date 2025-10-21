// src/pages/Waiter.js
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
import './Waiter.css'; // 👈 YENİ CSS İÇE AKTAR

// -------------------------------------------------------------
// 🔹 HELPER FONKSİYONLAR
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
        note: latest.note || "",
      };
    });
};

// 🔹 CSS Sınıfı döndüren helper
const getCardClass = (o) => {
    if (o.newItemsAdded) return "status-new-items";
    switch (o.status) {
      case "Hazır":
        return "status-ready";
      case "Hazırlanıyor":
        return "status-preparing";
      default:
        return "status-new";
    }
};

const compareOrders = (a, b) => {
    if (a.newItemsAdded && !b.newItemsAdded) return -1;
    if (!a.newItemsAdded && b.newItemsAdded) return 1;
    
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
  
  // ---------------- Yeni Sipariş / Düzenleme Fonksiyonları ----------------
  
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
  
  // ---------------- Diğer Garson İşlevleri ----------------
  
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
        <div className="menu-loading-screen">
          Menü verileri yükleniyor...
        </div>
      );
  }
  
  return (
    <div className="waiter-container">
        <div className="waiter-header">
            <h2 className="waiter-title">🧑‍💼 Garson Paneli</h2>
            <button 
                onClick={openTableInputModal}
                className="button button-green"
            >
                ➕ Yeni Sipariş Başlat
            </button>
            <input
                type="text"
                placeholder="Masa ara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="form-input search-input"
            />
        </div>

        {/* Sekmeler */}
        <div className="tab-nav">
            <button
                onClick={() => setActiveTab("active")}
                className={`tab-button ${activeTab === "active" ? "active" : ""}`}
            >
                Aktif Siparişler
            </button>
            <button
                onClick={() => setActiveTab("delivered")}
                className={`tab-button ${activeTab === "delivered" ? "active" : ""}`}
            >
                Teslim Edilenler
            </button>
            <button
                onClick={() => setActiveTab("paid")}
                className={`tab-button ${activeTab === "paid" ? "active" : ""}`}
            >
                Ödemesi Alınanlar (Son 24 Saat)
            </button>
        </div>


        {/* Sipariş Listesi */}
        <div className="waiter-order-list">
            {filteredList.length === 0 && (
                <p className="empty-text">Bu sekmede gösterilecek sipariş bulunmamaktadır.</p>
            )}
            {filteredList.map((o) => (
                <div 
                    key={o.tableId + (activeTab === 'paid' ? o.updatedAt?.seconds || o.movedAt?.seconds : '')} 
                    className={`waiter-order-card ${activeTab !== 'paid' ? getCardClass(o) : 'status-paid'}`} 
                >
                    <div className="card-header">
                        <p className="table-id">
                            Masa: {o.tableId}
                            {activeTab !== 'paid' && (
                                <span className="order-status">({o.status})</span>
                            )}
                            {activeTab === 'paid' && (
                                <span className="order-status">({o.paymentMethod})</span>
                            )}
                        </p>
                        <p className="order-total">{o.total.toFixed(2)} ₺</p>
                    </div>
                    
                    {o.newItemsAdded && activeTab !== 'paid' && (
                        <p className="new-item-alert">
                            ⚠️ Yeni ürün eklendi – Mutfaktan onay bekleniyor
                        </p>
                    )}
                    
                    {o.note && (
                        <div className="order-note">
                            <strong>Not:</strong> {o.note}
                        </div>
                    )}

                    <p className="order-items-text">
                        <strong>Ürünler:</strong>{" "}
                        {o.items?.map((i) => `${i.name} ×${i.qty}`).join(", ")}
                    </p>

                    {/* Butonlar */}
                    {activeTab !== 'paid' && (
                        <div className="card-actions">
                            <button
                                onClick={() => openEditModal(o)}
                                className="button button-blue"
                            >
                                ✏️ Düzenle
                            </button>
                            {o.status !== "Teslim Edildi" && (
                                <button
                                    onClick={() => markDelivered(o)}
                                    className="button button-green"
                                >
                                    🚚 Teslim Edildi
                                </button>
                            )}
                            {o.status === "Teslim Edildi" && (
                                <button
                                    onClick={() => openPayment(o)}
                                    className="button"
                                    style={{backgroundColor: 'var(--primary-purple)', color: 'white'}}
                                >
                                    💰 Ödeme Al
                                </button>
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>


        {/* Yeni Sipariş Oluşturma Modalı */}
        {showTableInputModal && (
          <div className="modal-overlay">
            <div className="modal-content modal-order-edit">
                <h3 className="modal-title">Yeni Sipariş Başlat: Masa Seçimi</h3>
                
                <div className="form-group">
                    <input
                        type="text"
                        placeholder="Masa ID girin (örn: masa_1)"
                        value={newOrderTableId}
                        onChange={(e) => setNewTableId(e.target.value)}
                        className="form-input"
                    />
                </div>

                <h4 className="modal-subtitle">Menü</h4>
                <div className="modal-category-nav">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`modal-cat-button ${activeCategory === cat ? 'active' : ''}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                <div className="modal-menu-items">
                    <ul className="modal-items-list">
                        {(groupedProducts[activeCategory] || []).map(item => (
                            <li key={item.id} className="menu-item">
                                <span>{item.name} ({item.price} ₺)</span>
                                <button
                                    onClick={() => addNewItemToCart(item)}
                                    className="button button-green"
                                >
                                    Ekle
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>

                <h4 className="modal-subtitle">Sepet ({newOrderCart.length} ürün, Toplam: {newOrderTotal.toFixed(2)} ₺)</h4>
                <ul className="modal-cart-preview">
                    {newOrderCart.map(item => (
                        <li key={item.id} className="cart-preview-item">
                            <span>{item.name} x{item.qty}</span>
                            <div className="cart-preview-controls">
                                <button
                                    onClick={() => setNewOrderCart(prev => prev.map(p => p.id === item.id ? {...p, qty: p.qty - 1} : p).filter(p => p.qty > 0))}
                                    className="qty-button"
                                >-</button>
                                <button
                                    onClick={() => setNewOrderCart(prev => prev.map(p => p.id === item.id ? {...p, qty: p.qty + 1} : p))}
                                    className="qty-button"
                                >+</button>
                            </div>
                        </li>
                    ))}
                </ul>

                <div className="modal-actions">
                    <button
                        onClick={() => setShowTableInputModal(false)}
                        className="button button-secondary"
                    >
                        Kapat
                    </button>
                    <button
                        onClick={handleNewOrderSubmit}
                        disabled={!newOrderTableId || newOrderCart.length === 0}
                        className="button button-blue"
                    >
                        Siparişi Başlat
                    </button>
                </div>
            </div>
          </div>
        )}
        
        {/* Sipariş Düzenleme Modalı */}
        {showEditModal && editOrder && (
          <div className="modal-overlay">
             <div className="modal-content modal-order-edit">
                <h3 className="modal-title">Masa {editOrder.tableId} Siparişini Düzenle</h3>
                
                <h4 className="modal-subtitle">Menüden Ürün Ekle</h4>
                <div className="modal-category-nav">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`modal-cat-button ${activeCategory === cat ? 'active' : ''}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                <div className="modal-menu-items">
                    <ul className="modal-items-list">
                        {(groupedProducts[activeCategory] || []).map(item => (
                            <li key={item.id} className="menu-item">
                                <span>{item.name} ({item.price} ₺)</span>
                                <button
                                    onClick={() => addEditItemToCart(item)}
                                    className="button button-green"
                                >
                                    Ekle
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>

                <h4 className="modal-subtitle">Güncel Sipariş ({editCart.length} ürün, Toplam: {editOrderTotal.toFixed(2)} ₺)</h4>
                <ul className="modal-cart-preview">
                    {editCart.map(item => (
                        <li key={item.id} className="cart-preview-item">
                            <span>{item.name} x{item.qty}</span>
                            <div className="cart-preview-controls">
                                <button
                                    onClick={() => setEditCart(prev => prev.map(p => p.id === item.id ? {...p, qty: p.qty - 1} : p).filter(p => p.qty > 0))}
                                    className="qty-button"
                                >-</button>
                                <button
                                    onClick={() => setEditCart(prev => prev.map(p => p.id === item.id ? {...p, qty: p.qty + 1} : p))}
                                    className="qty-button"
                                >+</button>
                            </div>
                        </li>
                    ))}
                </ul>
                
                {editOrder.note && (
                    <div className="order-note" style={{margin: '1rem 0'}}>
                        <strong>Müşteri Notu:</strong> {editOrder.note}
                    </div>
                )}


                <div className="modal-actions">
                    <button
                        onClick={() => setShowEditModal(false)}
                        className="button button-secondary"
                    >
                        Kapat
                    </button>
                    <button
                        onClick={handleEditOrderSave}
                        disabled={editCart.length === 0 || isSaving}
                        className="button button-danger"
                    >
                        {isSaving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet & Mutfağa Gönder'}
                    </button>
                </div>
            </div>
          </div>
        )}
        
        {/* Ödeme Modalı */}
        {showPaymentModal && selectedOrder && (
          <div className="modal-overlay">
            <div className="modal-content modal-payment">
              <h3 className="modal-title">💰 Ödeme Yöntemi Seç</h3>
              <p className="payment-details">
                Masa: <strong>{selectedOrder.tableId}</strong>
                <br />
                Toplam: <strong>{selectedOrder.total.toFixed(2)} ₺</strong>
              </p>
              <div className="payment-actions">
                <button
                  className="button button-blue"
                  onClick={() => {
                    setPaymentMethod("Kart");
                    confirmPayment();
                  }}
                >
                  💳 Kredi/Banka Kartı
                </button>
                <button
                  className="button button-green"
                  onClick={() => {
                    setPaymentMethod("Nakit");
                    confirmPayment();
                  }}
                >
                  💵 Nakit
                </button>
              </div>
              <button
                className="payment-cancel-button"
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