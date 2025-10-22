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
  where, // 'where' sorgu filtresi için
  orderBy, // Sıralama için
  Timestamp // Zaman damgası karşılaştırması için
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { submitOrder, moveToPastOrders, updateCart } from "../lib/orders";
import useProducts from "../hooks/useProducts";
import './Waiter.css'; // Stil dosyası

// -------------------------------------------------------------
// 🔹 HELPER FONKSİYONLAR
// -------------------------------------------------------------
// Ürünleri birleştirir
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

// Siparişlerin birleştirilmiş durumunu alır
const getMergedStatus = (orders) => {
    if (orders.every((o) => o.status === "Teslim Edildi")) return "Teslim Edildi";
    if (orders.some((o) => o.status === "Hazır")) return "Hazır";
    if (orders.some((o) => o.status === "Hazırlanıyor")) return "Hazırlanıyor";
    return "Yeni";
};

// Yeni ürün eklenip eklenmediğini kontrol eder
const getMergedNewItemsAdded = (orders) =>
    orders.some((o) => o.newItemsAdded === true);

// Siparişleri masaya göre birleştirir (ödenmemiş olanları)
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
        id: list.map((x) => x.id), // Alt sipariş ID'leri
        orderDocuments: list, // Orijinal sipariş belgeleri
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

// Sipariş kartının CSS sınıfını belirler
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

// Siparişleri sıralamak için karşılaştırma fonksiyonu
const compareOrders = (a, b) => {
    // Yeni eklenenler her zaman en üstte
    if (a.newItemsAdded && !b.newItemsAdded) return -1;
    if (!a.newItemsAdded && b.newItemsAdded) return 1;

    // Diğerlerini güncelleme/oluşturma zamanına göre (en yeni üste)
    const at = a.updatedAt?.seconds||a.createdAt?.seconds||0;
    const bt = b.updatedAt?.seconds||b.createdAt?.seconds||0;

    return bt - at;
};
// -------------------------------------------------------------


export default function Waiter() {
  // State tanımlamaları
  const [orders, setOrders] = useState([]); // Aktif sipariş belgeleri
  const [pastPaid, setPastPaid] = useState([]); // Son 24 saatlik ödenmiş siparişler
  const [activeTab, setActiveTab] = useState("active"); // Gösterilen sekme
  const [search, setSearch] = useState(""); // Arama metni
  const { allProducts: menuProducts, loading: loadingProducts, products: groupedProducts, categories: CATEGORIES } = useProducts(); // Menü verileri

  // Modal State'leri
  const [showEditModal, setShowEditModal] = useState(false);
  const [editOrder, setEditOrder] = useState(null); // Düzenlenen sipariş (birleştirilmiş)
  const [editCart, setEditCart] = useState([]); // Düzenleme modalındaki sepet
  const [isSaving, setIsSaving] = useState(false); // Düzenleme kaydedilirken
  const [activeCategory, setActiveCategory] = useState(""); // Modal içindeki aktif kategori

  const [showTableInputModal, setShowTableInputModal] = useState(false);
  const [newOrderTableId, setNewTableId] = useState(""); // Yeni sipariş için masa ID
  const [newOrderCart, setNewOrderCart] = useState([]); // Yeni sipariş modalındaki sepet

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null); // Ödeme yapılacak sipariş (birleştirilmiş)
  const [paymentMethod, setPaymentMethod] = useState(""); // Seçilen ödeme yöntemi

  // Toplam Hesaplama
  const calculateTotal = (arr) => arr.reduce((acc, item) => acc + (Number(item.qty) || 0) * (Number(item.price) || 0), 0);
  const newOrderTotal = useMemo(() => calculateTotal(newOrderCart), [newOrderCart]);
  const editOrderTotal = useMemo(() => calculateTotal(editCart), [editCart]);

  // --- Firestore Sipariş Dinleme (GÜNCELLENMİŞ useEffect) ---
  useEffect(() => {
    // --- Aktif Siparişleri Dinleme ---
    const tablesRef = collection(db, "tables");
    const unsubTables = onSnapshot(tablesRef, (tablesSnap) => {
      const unsubscribers = [];
      tablesSnap.forEach((t) => {
        const ordersRef = collection(db, "tables", t.id, "orders");
        const unsub = onSnapshot(ordersRef, (snap) => {
          const newTableOrders = snap.docs.map((d) => ({ id: d.id, tableId: t.id, ...d.data() }));
          // Önceki siparişleri filtreleyip yenilerini ekleyerek state'i güncelle
          setOrders(prev => [...prev.filter(o => o.tableId !== t.id), ...newTableOrders]);
        }, (error) => console.error(`Error listening to orders for table ${t.id}:`, error)); // Hata loglama
        unsubscribers.push(unsub);
      });
      // Component unmount olduğunda tüm masa dinleyicilerini kapat
      return () => unsubscribers.forEach((u) => u());
    }, (error) => console.error("Error listening to tables collection:", error)); // Hata loglama

    // --- Ödenmiş Siparişleri Dinleme (Firestore Sorgusu ile) ---
    // 1. Son 24 saatin Firestore Timestamp'ını oluştur
    const twentyFourHoursAgoTimestamp = Timestamp.fromDate(
        new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    // 2. Firestore sorgusunu oluştur
    const pastOrdersRef = collectionGroup(db, "pastOrders");
    const pastOrdersQuery = query(
        pastOrdersRef,
        where("paymentStatus", "==", "Alındı"), // Sadece ödemesi alınanlar
        where("movedAt", ">=", twentyFourHoursAgoTimestamp), // Sadece son 24 saat
        orderBy("movedAt", "desc") // En yeniden eskiye sırala
    );
    console.log("Past orders query created for time after:", twentyFourHoursAgoTimestamp.toDate());

    // 3. Sorguyu dinle
    const unsubPast = onSnapshot(pastOrdersQuery, (snap) => {
      console.log("Past orders snapshot received, docs count:", snap.docs.length);
      const paidLast24h = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPastPaid(paidLast24h); // Gelen veriyi DOĞRUDAN state'e yaz
    }, (error) => {
        // Hata durumunda konsolu kontrol et (Index eksik olabilir!)
        console.error("🔥 Past orders listener error:", error);
        if (error.code === 'failed-precondition') {
            console.error("Firestore Index Hatası: Muhtemelen 'pastOrders' koleksiyon grubu için [paymentStatus(ASC), movedAt(DESC)] index'i eksik. Lütfen Firestore konsolundan oluşturun veya hata mesajındaki linki kullanın.");
            alert("Ödenmiş siparişler yüklenemedi. Gerekli Firestore index'i eksik olabilir. Lütfen konsolu kontrol edin.");
        }
        setPastPaid([]); // Hata durumunda listeyi boşalt
    });

    // --- Temizleme ---
    // Component unmount olduğunda tüm dinleyicileri kapat
    return () => {
        unsubTables();
        unsubPast();
    };
  }, []); // Bağımlılık dizisi boş, sadece mount/unmount'ta çalışır

  // --- Veri Birleştirme ve Filtreleme ---
  // Aktif siparişleri masaya göre birleştir
  const mergedOrders = useMemo(() => mergeOrdersByTable(orders), [orders]);
  // Teslim edilenleri ayır
  const deliveredOrders = useMemo(() => mergedOrders.filter((o) => o.status === "Teslim Edildi"), [mergedOrders]);
  // Aktif olanları ayır (Teslim edilmemişler)
  const activeOrders = useMemo(() => mergedOrders.filter((o) => o.status !== "Teslim Edildi"), [mergedOrders]);
  // Ödenenler state'i (Firestore'dan sıralı geliyor)
  const paidOrders = pastPaid;

  // Gösterilecek listeyi aktif sekmeye ve aramaya göre filtrele/sırala
  const filteredList = useMemo(() => {
    let list;
    if (activeTab === "active") {
        list = activeOrders.sort(compareOrders); // Aktifleri sırala
    } else if (activeTab === "delivered") {
        list = deliveredOrders.sort(compareOrders); // Teslim edilenleri sırala
    } else { // activeTab === "paid"
        list = paidOrders; // Ödenenler zaten Firestore'dan sıralı geldi
    }

    if (!search.trim()) return list; // Arama yoksa sıralı listeyi döndür

    // Arama varsa filtrele
    return list.filter((o) =>
      o.tableId?.toLowerCase().includes(search.trim().toLowerCase())
    );
    // Not: Arama sonrası tekrar sıralama isterseniz .sort(compareOrders) eklenebilir.
  }, [activeTab, search, activeOrders, deliveredOrders, paidOrders]);


  // --- Yeni Sipariş / Düzenleme Fonksiyonları ---

  // Yeni sipariş modalındaki sepete ürün ekler
  const addNewItemToCart = (item) => {
    const existing = newOrderCart.find(p => p.id === item.id);
    const newItems = existing
      ? newOrderCart.map(p => p.id === item.id ? { ...p, qty: (Number(p.qty) || 0) + 1, price: Number(item.price) } : p)
      : [...newOrderCart, { ...item, qty: 1, price: Number(item.price), name: item.name }];
    setNewOrderCart(newItems);
  };

  // Düzenleme modalındaki sepete ürün ekler
  const addEditItemToCart = (item) => {
    const existing = editCart.find(p => p.id === item.id);
    const newItems = existing
      ? editCart.map(p => p.id === item.id ? { ...p, qty: (Number(p.qty) || 0) + 1, price: Number(item.price) } : p)
      : [...editCart, { ...item, qty: 1, price: Number(item.price), name: item.name }];
    setEditCart(newItems);
  };

  // Yeni siparişi Firestore'a gönderir
  const handleNewOrderSubmit = async () => {
    if (!newOrderTableId || newOrderCart.length === 0) return;
    setIsSaving(true); // Butonu disable etmek için
    try {
        const tableRef = doc(db, "tables", newOrderTableId);
        const tableSnap = await getDoc(tableRef);
        if (!tableSnap.exists()) {
             alert(`❌ Hata: Masa '${newOrderTableId}' sistemde kayıtlı değil.`);
             setIsSaving(false);
             return;
        }

        // Siparişi 'orders' koleksiyonuna gönder
        await submitOrder({
            tableId: newOrderTableId,
            items: newOrderCart,
            total: newOrderTotal
        });
        // İsteğe bağlı: Müşteri sepetini de güncelle
        // await updateCart(newOrderTableId, newOrderCart, newOrderTotal, ""); // Notu boşaltır

        setNewOrderCart([]);
        setNewTableId("");
        setShowTableInputModal(false);
        alert(`✅ ${newOrderTableId} için sipariş başarıyla oluşturuldu!`);
    } catch (e) {
        console.error("Yeni sipariş hatası:", e);
        alert("❌ Yeni sipariş oluşturulamadı.");
    } finally {
        setIsSaving(false);
    }
  };

  // Düzenlenmiş siparişi kaydeder ve müşteri sepetini günceller
  const handleEditOrderSave = async () => {
      if (!editOrder || !editOrder.tableId) return;
      if (editCart.length === 0 && !window.confirm(`⚠️ Masa ${editOrder.tableId} için tüm ürünleri silmek istediğinize emin misiniz? Bu işlem mutfağa boş sipariş göndermez ancak müşteri sepetini boşaltır.`)) {
          return;
      }

      setIsSaving(true);
      try {
          // 1. Eski sipariş belgelerini sil
          for (const sub of editOrder.orderDocuments) {
              const ref = doc(db, "tables", editOrder.tableId, "orders", sub.id);
              await deleteDoc(ref);
          }
          console.log(`Eski sipariş belgeleri silindi: ${editOrder.tableId}`);

          // 2. Yeni sepette ürün varsa, yeni sipariş oluştur (mutfak için)
          if (editCart.length > 0) {
              await submitOrder({
                  tableId: editOrder.tableId,
                  items: editCart,
                  total: editOrderTotal,
                  note: editOrder.note,
                  isModification: true, // Mutfağa uyarı gitmesi için
              });
              console.log(`Yeni sipariş belgesi oluşturuldu: ${editOrder.tableId}`);
          } else {
              console.log(`Sepet boş olduğu için yeni sipariş belgesi oluşturulmadı: ${editOrder.tableId}`);
          }

          // 3. Müşterinin gördüğü ana sepeti (cart) GÜNCELLE
          // Notu da güncellemek için editOrder.note'u gönderelim (veya boş string)
          await updateCart(editOrder.tableId, editCart, editOrderTotal, editOrder.note || "");
          console.log(`Ana sepet (cart) güncellendi: ${editOrder.tableId}`);

          // 4. Modalı kapat ve state'i sıfırla
          setShowEditModal(false);
          setEditOrder(null);
          setEditCart([]);
          alert(`✅ Sipariş başarıyla düzenlendi ve müşteri sepeti güncellendi (${editCart.length > 0 ? 'mutfağa da gönderildi' : 'mutfağa gönderilmedi'}).`);

      } catch (e) {
          console.error("Sipariş düzenleme veya sepet güncelleme hatası:", e);
          alert("❌ Sipariş düzenlenirken veya müşteri sepeti güncellenirken bir hata oluştu.");
      } finally {
          setIsSaving(false);
      }
  };

  // --- Diğer Garson İşlevleri ---

  // Siparişleri 'Teslim Edildi' olarak işaretler
  const markDelivered = async (o) => {
    if (!o || !o.orderDocuments || o.orderDocuments.length === 0) return;
    if (!window.confirm(`${o.tableId} masası için siparişler teslim edildi mi?`)) return;
    setIsSaving(true); // Butonları disable etmek için
    try {
      // Toplu yazma (batch) kullanarak daha verimli hale getirebiliriz
      // const batch = writeBatch(db);
      for (const sub of o.orderDocuments) {
        const ref = doc(db, "tables", o.tableId, "orders", sub.id);
        // batch.update(ref, { status: "Teslim Edildi", updatedAt: serverTimestamp(), newItemsAdded: false });
         await updateDoc(ref, { status: "Teslim Edildi", updatedAt: serverTimestamp(), newItemsAdded: false });
      }
      // await batch.commit();
      alert(`✅ ${o.tableId} masası teslim edildi olarak işaretlendi.`);
    } catch (err) {
      console.error("Teslim etme hatası:", err);
      alert("Hata oluştu, teslim edilemedi.");
    } finally {
        setIsSaving(false);
    }
  };

  // Ödeme modalını açar
  const openPayment = (o) => {
    setSelectedOrder(o);
    setPaymentMethod("");
    setShowPaymentModal(true);
  };

  // Ödemeyi onaylar, siparişi geçmişe taşır ve ana sepeti temizler
  const confirmPayment = async () => {
    if (!selectedOrder || !paymentMethod) return;
    setIsSaving(true); // Butonları disable etmek için
    try {
      for (const sub of selectedOrder.orderDocuments) {
        const docRef = doc(db, "tables", selectedOrder.tableId, "orders", sub.id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const orderData = { ...docSnap.data(), paymentMethod, paymentStatus: "Alındı" };
            await moveToPastOrders(selectedOrder.tableId, sub.id, orderData);
        } else { console.warn(`Ödeme onayı: Sipariş belgesi bulunamadı ${selectedOrder.tableId}/${sub.id}`); }
      }

       // Ödeme alındıktan sonra ana sepeti (cart) temizle (notu da temizle)
      await updateCart(selectedOrder.tableId, [], 0, "");
      console.log(`Ödeme sonrası ana sepet temizlendi: ${selectedOrder.tableId}`);

      setShowPaymentModal(false);
      setSelectedOrder(null);
      alert(`✅ ${selectedOrder.tableId} masasının ödemesi (${paymentMethod}) alındı, sipariş geçmişe taşındı ve ana sepet temizlendi.`);
    } catch (e) {
      console.error("Ödeme onaylama hatası:", e);
      alert("Ödeme alınırken bir hata oluştu.");
    } finally {
        setIsSaving(false);
    }
  };

  // Yeni sipariş modalını açar
  const openTableInputModal = () => {
    setNewTableId("");
    setNewOrderCart([]);
    // İlk kategoriyi aktif yap
    setActiveCategory(CATEGORIES.length > 0 ? CATEGORIES[0] : "");
    setShowTableInputModal(true);
  };

  // Düzenleme modalını açar
  const openEditModal = (order) => {
    setEditOrder(order);
    // Ürünlerin fiyatını sayıya çevirerek al
    setEditCart(order.items?.map(p => ({ ...p, qty: Number(p.qty || 0), price: Number(p.price || 0) })) || []);
     // İlk kategoriyi aktif yap
    setActiveCategory(CATEGORIES.length > 0 ? CATEGORIES[0] : "");
    setShowEditModal(true);
  };

  // --- RENDER ---
  if (loadingProducts) {
      return (
        <div className="menu-loading-screen"> {/* Global stil kullanılabilir */}
          Menü verileri yükleniyor...
        </div>
      );
  }

  return (
    <div className="waiter-container">
        {/* Başlık, Buton, Arama */}
        <div className="waiter-header">
            <h2 className="waiter-title">🧑‍💼 Garson Paneli</h2>
            <button
                onClick={openTableInputModal}
                className="button button-green"
                disabled={isSaving} // Herhangi bir kaydetme işlemi sırasında disable
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
            <button onClick={() => setActiveTab("active")} className={`tab-button ${activeTab === "active" ? "active" : ""}`}> Aktif Siparişler </button>
            <button onClick={() => setActiveTab("delivered")} className={`tab-button ${activeTab === "delivered" ? "active" : ""}`}> Teslim Edilenler </button>
            <button onClick={() => setActiveTab("paid")} className={`tab-button ${activeTab === "paid" ? "active" : ""}`}> Ödemesi Alınanlar (Son 24 Saat) </button>
        </div>


        {/* Sipariş Listesi */}
        <div className="waiter-order-list">
            {filteredList.length === 0 && (
                <p className="empty-text">Bu sekmede gösterilecek sipariş bulunmamaktadır.</p>
            )}
            {filteredList.map((o) => (
                <div
                    // Ödenenler sekmesi için daha güvenilir key (movedAt yoksa id kullan)
                    key={o.tableId + (activeTab === 'paid' ? (o.movedAt?.seconds || o.id) : o.tableId)}
                    className={`waiter-order-card ${activeTab !== 'paid' ? getCardClass(o) : 'status-paid'}`}
                >
                    {/* Kart Başlığı */}
                    <div className="card-header">
                        <p className="table-id">
                            Masa: {o.tableId}
                            {activeTab !== 'paid' && <span className="order-status">({o.status})</span>}
                            {activeTab === 'paid' && <span className="order-status">({o.paymentMethod}) - {new Date((o.movedAt?.seconds || 0) * 1000).toLocaleTimeString('tr-TR')}</span>}
                        </p>
                        <p className="order-total">{o.total ? o.total.toFixed(2) : '0.00'} ₺</p>
                    </div>

                    {/* Uyarılar ve Not */}
                    {o.newItemsAdded && activeTab !== 'paid' && <p className="new-item-alert">⚠️ Yeni ürün eklendi – Mutfaktan onay bekleniyor</p>}
                    {o.note && <div className="order-note"><strong>Not:</strong> {o.note}</div>}

                    {/* Ürün Listesi */}
                    <p className="order-items-text">
                        <strong>Ürünler:</strong>{" "}
                        {o.items?.map((i) => `${i.name} ×${i.qty || 1}`).join(", ") || "Yok"}
                    </p>

                    {/* Butonlar (Sadece Aktif ve Teslim Edilenler için) */}
                    {activeTab !== 'paid' && (
                        <div className="card-actions">
                            <button onClick={() => openEditModal(o)} className="button button-blue" disabled={isSaving}> ✏️ Düzenle </button>
                            {o.status !== "Teslim Edildi" && <button onClick={() => markDelivered(o)} className="button button-green" disabled={isSaving}> 🚚 Teslim Edildi </button>}
                            {o.status === "Teslim Edildi" && <button onClick={() => openPayment(o)} className="button" style={{backgroundColor: 'var(--primary-purple)', color: 'white'}} disabled={isSaving}> 💰 Ödeme Al </button>}
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
                    <input type="text" placeholder="Masa ID girin (örn: masa_1)" value={newOrderTableId} onChange={(e) => setNewTableId(e.target.value)} className="form-input" disabled={isSaving}/>
                </div>
                <h4 className="modal-subtitle">Menü</h4>
                <div className="modal-category-nav">
                    {CATEGORIES.map(cat => <button key={cat} onClick={() => setActiveCategory(cat)} className={`modal-cat-button ${activeCategory === cat ? 'active' : ''}`}>{cat}</button>)}
                </div>
                <div className="modal-menu-items">
                    <ul className="modal-items-list">
                        {(groupedProducts[activeCategory] || []).map(item => <li key={item.id} className="menu-item"><span>{item.name} ({item.price} ₺)</span><button onClick={() => addNewItemToCart(item)} className="button button-green" disabled={isSaving}>Ekle</button></li>)}
                    </ul>
                </div>
                <h4 className="modal-subtitle">Sepet ({newOrderCart.length} ürün, Toplam: {newOrderTotal.toFixed(2)} ₺)</h4>
                <ul className="modal-cart-preview">
                    {newOrderCart.map(item => <li key={item.id} className="cart-preview-item"><span>{item.name} x{item.qty}</span><div className="cart-preview-controls"><button onClick={() => setNewOrderCart(prev => prev.map(p => p.id === item.id ? {...p, qty: p.qty - 1} : p).filter(p => p.qty > 0))} className="qty-button" disabled={isSaving}>-</button><button onClick={() => setNewOrderCart(prev => prev.map(p => p.id === item.id ? {...p, qty: p.qty + 1} : p))} className="qty-button" disabled={isSaving}>+</button></div></li>)}
                </ul>
                <div className="modal-actions">
                    <button onClick={() => setShowTableInputModal(false)} className="button button-secondary" disabled={isSaving}>Kapat</button>
                    <button onClick={handleNewOrderSubmit} disabled={!newOrderTableId || newOrderCart.length === 0 || isSaving} className="button button-blue">{isSaving ? 'Kaydediliyor...' : 'Siparişi Başlat'}</button>
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
                    {CATEGORIES.map(cat => <button key={cat} onClick={() => setActiveCategory(cat)} className={`modal-cat-button ${activeCategory === cat ? 'active' : ''}`}>{cat}</button>)}
                </div>
                <div className="modal-menu-items">
                    <ul className="modal-items-list">
                        {(groupedProducts[activeCategory] || []).map(item => <li key={item.id} className="menu-item"><span>{item.name} ({item.price} ₺)</span><button onClick={() => addEditItemToCart(item)} className="button button-green" disabled={isSaving}>Ekle</button></li>)}
                    </ul>
                </div>
                <h4 className="modal-subtitle">Güncel Sipariş ({editCart.length} ürün, Toplam: {editOrderTotal.toFixed(2)} ₺)</h4>
                <ul className="modal-cart-preview">
                    {editCart.map(item => <li key={item.id} className="cart-preview-item"><span>{item.name} x{item.qty}</span><div className="cart-preview-controls"><button onClick={() => setEditCart(prev => prev.map(p => p.id === item.id ? {...p, qty: p.qty - 1} : p).filter(p => p.qty > 0))} className="qty-button" disabled={isSaving}>-</button><button onClick={() => setEditCart(prev => prev.map(p => p.id === item.id ? {...p, qty: p.qty + 1} : p))} className="qty-button" disabled={isSaving}>+</button></div></li>)}
                </ul>
                {editOrder.note && <div className="order-note" style={{margin: '1rem 0'}}><strong>Müşteri Notu:</strong> {editOrder.note}</div>}
                <div className="modal-actions">
                    <button onClick={() => setShowEditModal(false)} className="button button-secondary" disabled={isSaving}>Kapat</button>
                    {/* Sepet boş olsa bile kaydetmeye izin ver (sepeti boşaltmak için) */}
                    <button onClick={handleEditOrderSave} disabled={isSaving} className="button button-danger">
                        {isSaving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
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
              <p className="payment-details">Masa: <strong>{selectedOrder.tableId}</strong><br />Toplam: <strong>{selectedOrder.total.toFixed(2)} ₺</strong></p>
              <div className="payment-actions">
                <button className="button button-blue" onClick={() => { setPaymentMethod("Kart"); confirmPayment(); }} disabled={isSaving}>💳 Kredi/Banka Kartı</button>
                <button className="button button-green" onClick={() => { setPaymentMethod("Nakit"); confirmPayment(); }} disabled={isSaving}>💵 Nakit</button>
              </div>
              <button className="payment-cancel-button" onClick={() => { setShowPaymentModal(false); setSelectedOrder(null); }} disabled={isSaving}>İptal</button>
            </div>
          </div>
        )}
    </div>
  );
}