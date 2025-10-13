import React, { useState, useEffect, useMemo } from "react";
import {
  collection,
  collectionGroup,
  doc,
  updateDoc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { submitOrder, updateOrderStatus, moveToPastOrders } from "../lib/orders";

function Waiter() {
  // ---------------- STATE ----------------
  const [orders, setOrders] = useState([]);
  const [pastPaid, setPastPaid] = useState([]);
  const [activeTab, setActiveTab] = useState("active");
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [cart, setCart] = useState([]);
  const [tableIdInput, setTableIdInput] = useState("");

  const [showEditModal, setShowEditModal] = useState(false);
  const [editOrder, setEditOrder] = useState(null);
  const [editCart, setEditCart] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("");

  // ---------------- STATIC PRODUCTS ----------------
  const products = useMemo(
    () => [
      { id: 1, name: "Pizza", price: 120 },
      { id: 2, name: "Hamburger", price: 100 },
      { id: 3, name: "Kola", price: 30 },
      { id: 4, name: "Ayran", price: 25 },
    ],
    []
  );

  const total = (arr) => arr.reduce((s, p) => s + p.price * p.qty, 0);

  // ---------------- YARDIMCI VE BİRLEŞTİRME (MERGE) LOGİĞİ ----------------
  
  // Sipariş ürünlerini birleştirir (aynı ürünlerin miktarlarını toplar)
  const mergeItems = (orders) => {
    const combinedItems = {};
    orders.forEach(order => {
        (order.items || []).forEach(item => {
            const key = item.id;
            if (combinedItems[key]) {
                combinedItems[key].qty += item.qty;
            } else {
                combinedItems[key] = { ...item };
            }
        });
    });
    return Object.values(combinedItems);
  };

  // Birleştirilmiş siparişin durumunu belirler (Hazır > Hazırlanıyor > Teslim Edildi > Yeni)
  const getMergedStatus = (orders) => {
    if (orders.some(o => o.status === "Hazır")) return "Hazır";
    if (orders.some(o => o.status === "Hazırlanıyor")) return "Hazırlanıyor";
    if (orders.some(o => o.status === "Teslim Edildi")) return "Teslim Edildi";
    return "Yeni";
  };

  // Birleştirilmiş siparişte yeni ürün eklenmiş mi kontrolü
  const getMergedNewItemsAdded = (orders) => {
    return orders.some(o => o.newItemsAdded === true);
  };

  /**
   * Aynı masa ID'sine sahip ve ÖDENMEMİŞ siparişleri tek bir satırda birleştirir.
   */
  const mergeOrdersByTable = (allOrders) => {
    // 1. Sadece ödenmemiş (paymentStatus !== "Alındı") siparişleri al
    const nonPaidOrders = allOrders.filter(o => o.paymentStatus !== "Alındı");

    // 2. Masa ID'sine göre grupla
    const groupedOrders = nonPaidOrders.reduce((acc, order) => {
        acc[order.tableId] = acc[order.tableId] || [];
        acc[order.tableId].push(order);
        return acc;
    }, {});

    // 3. Her grubu tek bir birleştirilmiş sipariş nesnesine dönüştür
    return Object.entries(groupedOrders).map(([tableId, tableOrders]) => {
        // En son güncellenen belgeyi bul (sıralama için)
        const latestOrder = tableOrders.sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0))[0];

        return {
            tableId,
            // 🚨 Önemli: id artık tüm alt belge ID'lerinin dizisidir
            id: tableOrders.map(o => o.id), 
            orderDocuments: tableOrders, // Eylemler için orijinal belgeler

            total: tableOrders.reduce((sum, o) => sum + (o.total || 0), 0),
            items: mergeItems(tableOrders),
            status: getMergedStatus(tableOrders),
            newItemsAdded: getMergedNewItemsAdded(tableOrders),

            createdAt: latestOrder.createdAt,
            updatedAt: latestOrder.updatedAt,
            readyAt: latestOrder.readyAt,
            deliveredAt: latestOrder.deliveredAt,
            paymentStatus: "Bekleniyor",
        };
    });
  };

  // ---------------- SIRALAMA ----------------
  const compareOrders = (a, b) => {
    if (a.status === "Hazır" && b.status === "Hazır")
      return (b.readyAt?.seconds || 0) - (a.readyAt?.seconds || 0);
    if (a.status === "Hazır" && b.status !== "Hazır") return -1;
    if (b.status === "Hazır" && a.status !== "Hazır") return 1;
    const aTime = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
    const bTime = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
    return bTime - aTime;
  };

  // ---------------- FIRESTORE ----------------
  useEffect(() => {
    const tablesRef = collection(db, "tables");
    const unsubTables = onSnapshot(tablesRef, (tablesSnap) => {
      const unsubscribers = [];
      let allOrders = [];
      tablesSnap.forEach((tableDoc) => {
        const ordersRef = collection(db, "tables", tableDoc.id, "orders");
        const unsubOrders = onSnapshot(ordersRef, (ordersSnap) => {
          allOrders = allOrders
            .filter((o) => o.tableId !== tableDoc.id)
            .concat(
              ordersSnap.docs.map((d) => ({
                id: d.id,
                tableId: tableDoc.id,
                ...d.data(),
              }))
            );
          setOrders([...allOrders]);
        });
        unsubscribers.push(unsubOrders);
      });
      return () => unsubscribers.forEach((unsub) => unsub());
    });

    return () => unsubTables();
  }, []);

  useEffect(() => {
    const unsubPast = onSnapshot(collectionGroup(db, "pastOrders"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPastPaid(data || []);
    });
    return () => unsubPast();
  }, []);

  // ---------------- FİLTRELER ----------------
  const mergedOrders = useMemo(() => mergeOrdersByTable(orders), [orders]);

  const activeOrders = useMemo(
    () =>
      mergedOrders
        .filter((o) => o.status !== "Teslim Edildi")
        .sort(compareOrders),
    [mergedOrders]
  );
  
  const deliveredOrders = useMemo(
    () =>
      mergedOrders
        .filter((o) => o.status === "Teslim Edildi")
        .sort(compareOrders),
    [mergedOrders]
  );

  const paidOrders = useMemo(() => {
    // Ödenenler birleştirilmez, ayrı ayrı listelenir.
    const fromCurrent = orders.filter((o) => o.paymentStatus === "Alındı");
    const fromPast = pastPaid.filter((o) => o.paymentStatus === "Alındı");
    const all = [...fromPast, ...fromCurrent];
    return all.sort((a, b) => (b.paymentAt?.seconds || 0) - (a.paymentAt?.seconds || 0));
  }, [orders, pastPaid]);

  // 🔍 Arama filtresi
  const filteredList = useMemo(() => {
    const list =
      activeTab === "active"
        ? activeOrders
        : activeTab === "delivered"
        ? deliveredOrders
        : paidOrders;

    if (!search.trim()) return list;
    const query = search.trim().toLowerCase();
    return list.filter((o) => o.tableId?.toLowerCase().includes(query));
  }, [activeTab, activeOrders, deliveredOrders, paidOrders, search]);

  // ---------------- YARDIMCI ----------------
  const getBgColor = (s) =>
    s === "Hazır"
      ? "bg-green-100"
      : s === "Teslim Edildi"
      ? "bg-yellow-100"
      : s === "Hazırlanıyor"
      ? "bg-yellow-100"
      : "bg-white";

  // ---------------- ACTIONS (GÜNCELLENDİ) ----------------
  
  // 🚨 openEditModal: Birleştirilmiş siparişin tüm ürünleriyle modalı açar.
  const openEditModal = (mergedOrder) => {
    // Düzenlenecek sipariş için en son oluşturulan belgeyi bul (Güncelleme hedefi)
    const latestOrderDoc = mergedOrder.orderDocuments.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))[0];

    // Modal state'ini ayarla
    setEditOrder({
        tableId: mergedOrder.tableId,
        id: latestOrderDoc.id // Güncelleme için tek bir ID kullanılır
    });
    setEditCart(mergedOrder.items || []); // Birleştirilmiş ürün listesini düzenleme için kullan
    setShowEditModal(true);
  };

  // 🚨 markDelivered: Birleştirilmiş siparişe ait TÜM alt siparişleri 'Teslim Edildi' yapar.
  const markDelivered = async (mergedOrder) => {
    try {
        // Tüm alt sipariş ID'leri üzerinde döngü
        for (const orderId of mergedOrder.id) {
            const orderRef = doc(db, "tables", mergedOrder.tableId, "orders", orderId);
            await updateDoc(orderRef, {
                status: "Teslim Edildi",
                deliveredAt: new Date(),
            });
        }
    } catch {
        alert("❌ Güncelleme başarısız");
    }
  };

  // 🚨 openPayment: Birleştirilmiş sipariş nesnesini seçer
  const openPayment = (mergedOrder) => {
    setSelectedOrder(mergedOrder); // mergedOrder nesnesi artık seçili sipariş
    setPaymentMethod("");
    setShowPaymentModal(true);
  };

  // 🚨 confirmPayment: Birleştirilmiş siparişe ait TÜM alt siparişlerin ödemesini alır.
  const confirmPayment = async () => {
    if (!selectedOrder || !paymentMethod) return alert("⚠️ Lütfen ödeme yöntemi seçin.");

    try {
        // Tüm alt sipariş belgeleri üzerinde döngü
        for (const order of selectedOrder.orderDocuments) {
            const { tableId, id } = order;
            const orderRef = doc(db, "tables", tableId, "orders", id);

            // 1. Durumu 'Alındı' olarak güncelle
            await updateDoc(orderRef, {
                paymentStatus: "Alındı",
                paymentMethod,
                paymentAt: new Date(),
            });

            // 2. Geçmiş siparişlere taşı
            await moveToPastOrders(tableId, id, {
                ...order,
                paymentStatus: "Alındı",
                paymentMethod,
                paymentAt: new Date(),
            });
        }

        // 3. Masanın sepetini sıfırla
        const tableRef = doc(db, "tables", selectedOrder.tableId);
        await updateDoc(tableRef, { cart: { items: [], total: 0 } });

        alert(`✅ ${paymentMethod} ile ödeme alındı ve masa sıfırlandı!`);
    } catch (e) {
        console.error(e);
        alert("❌ Ödeme kaydedilemedi veya masa sıfırlanamadı.");
    } finally {
        setShowPaymentModal(false);
        setSelectedOrder(null);
    }
  };


  // ---------------- YENİ SİPARİŞ MODAL ----------------
  const addToCart = (p) => {
    const ex = cart.find((x) => x.id === p.id);
    ex
      ? setCart(cart.map((x) => (x.id === p.id ? { ...x, qty: x.qty + 1 } : x)))
      : setCart([...cart, { ...p, qty: 1 }]);
  };
  const removeFromCart = (id) => setCart(cart.filter((p) => p.id !== id));
  const inc = (id) =>
    setCart(cart.map((p) => (p.id === id ? { ...p, qty: p.qty + 1 } : p)));
  const dec = (id) =>
    setCart(
      cart.map((p) => (p.id === id ? { ...p, qty: Math.max(1, p.qty - 1) } : p))
    );
  const clearCart = () => setCart([]);

  const handleSubmitOrder = async () => {
    const tableId = (tableIdInput || "").trim();
    if (!tableId) return alert("Lütfen masa ID girin (örn: masa_3)");
    if (!cart.length) return alert("Sepet boş!");
    try {
      const ref = doc(db, "tables", tableId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return alert("❌ Bu masa sistemde kayıtlı değil.");
      
      await submitOrder({ tableId, items: cart, total: total(cart) });
      
      alert(`✅ Sipariş gönderildi (${tableId})`);
      clearCart();
      setTableIdInput("");
      setShowModal(false);
    } catch (e) {
      alert("⚠️ Sipariş gönderilemedi: " + e.message);
    }
  };

  // ---------------- DÜZENLE MODAL ----------------
  const addToEditCart = (p) => {
    const ex = editCart.find((x) => x.id === p.id);
    ex
      ? setEditCart(
          editCart.map((x) =>
            x.id === p.id ? { ...x, qty: x.qty + 1 } : x
          )
        )
      : setEditCart([...editCart, { ...p, qty: 1 }]);
  };
  const increaseQty = (id) =>
    setEditCart(
      editCart.map((p) => (p.id === id ? { ...p, qty: p.qty + 1 } : p))
    );
  const decreaseQty = (id) =>
    setEditCart(
      editCart
        .map((p) =>
          p.id === id ? { ...p, qty: Math.max(1, p.qty - 1) } : p
        )
        .filter((p) => p.qty > 0)
    );
  const removeFromEditCart = (id) =>
    setEditCart(editCart.filter((p) => p.id !== id));

  const saveEditedOrder = async () => {
    if (!editOrder) return;
    if (!editCart.length) return alert("Sipariş boş olamaz!");
    setIsSaving(true);
    try {
      // editOrder.id tek bir sipariş belgesinin ID'sidir (latestOrderDoc.id)
      const ref = doc(db, "tables", editOrder.tableId, "orders", editOrder.id);
      await updateDoc(ref, {
        items: editCart,
        total: total(editCart),
        updatedAt: new Date(),
        newItemsAdded: true,
      });
      alert("✅ Sipariş güncellendi!");
      setShowEditModal(false);
      setEditOrder(null);
      setEditCart([]);
    } catch {
      alert("❌ Güncelleme hatası.");
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------- RENDER ----------------
  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* ÜST BAR */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3 border-b pb-2">
        <h2 className="text-2xl font-bold">🧑‍🍳 Garson Paneli</h2>
        <div className="flex gap-3 w-full sm:w-auto">
          {/* Yeni Sipariş Butonu */}
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition font-semibold whitespace-nowrap"
          >
            + Yeni Sipariş
          </button>
          
          <input
            type="text"
            placeholder="Masa numarası ara (örn: 5)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded px-3 py-2 w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* SEKME BUTONLARI */}
      <div className="flex border-b border-gray-300 mb-4">
        <button
          onClick={() => setActiveTab("active")}
          className={`relative px-4 py-2 text-sm font-medium ${
            activeTab === "active"
              ? "text-blue-700 border-b-2 border-blue-700"
              : "text-gray-500 hover:text-blue-600"
          }`}
        >
          📋 Aktif Siparişler
        </button>
        <button
          onClick={() => setActiveTab("delivered")}
          className={`relative px-4 py-2 text-sm font-medium ${
            activeTab === "delivered"
              ? "text-blue-700 border-b-2 border-blue-700"
              : "text-gray-500 hover:text-blue-600"
          }`}
        >
          🚚 Teslim Edilenler
        </button>
        <button
          onClick={() => setActiveTab("paid")}
          className={`relative px-4 py-2 text-sm font-medium ${
            activeTab === "paid"
              ? "text-blue-700 border-b-2 border-blue-700"
              : "text-gray-500 hover:text-blue-600"
          }`}
        >
          💰 Ödenenler
        </button>
      </div>

      {/* LİSTE */}
      {filteredList.map((o) => (
        <div
          // Birleştirilmiş siparişler için sadece tableId'yi kullan
          // Ödenenler için ID+paid kullanılır, çünkü bunlar birleştirilmez.
          key={o.paymentAt ? o.id + "paid" : o.tableId} 
          className={`p-3 border rounded mb-3 ${getBgColor(o.status)}`}
        >
          <div className="flex justify-between items-center">
            <p className="font-semibold">
              Masa: {o.tableId}{" "}
              <span className="text-sm text-gray-500">
                ({o.status || (o.paymentStatus === "Alındı" ? "Ödendi" : "—")})
              </span>
            </p>
            <p className="font-semibold">{o.total} ₺</p>
          </div>
          <p className="text-sm text-gray-700 mt-1">
            <strong>Ürünler:</strong>{" "}
            {o.items?.map((i) => `${i.name} x${i.qty}`).join(", ")}
          </p>

          {/* Aktif ve Teslim Edilen sekmeleri (Birleştirilmiş Siparişler) */}
          {(activeTab === "active" || activeTab === "delivered") && (
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

          {/* Ödenen sekme (Tekil Siparişler) */}
          {activeTab === "paid" && (
            <div className="mt-2 text-sm text-gray-700">
              <div>
                <strong>Ödeme:</strong> {o.paymentMethod || "-"}
              </div>
              <div>
                <strong>Tarih:</strong>{" "}
                {o.paymentAt?.seconds
                  ? new Date(o.paymentAt.seconds * 1000).toLocaleString("tr-TR")
                  : "-"}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Yeni Sipariş Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 overflow-y-auto">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl relative flex flex-col max-h-[92vh]">
            <button
              onClick={() => {
                setShowModal(false);
                clearCart();
                setTableIdInput("");
              }}
              className="absolute top-2 right-3 text-gray-600 hover:text-black text-2xl"
            >
              ✕
            </button>

            <h3 className="text-xl font-bold mb-4">🍽️ Yeni Sipariş Oluştur</h3>

            <div className="overflow-y-auto flex-1 pr-1 pb-4">
              <label className="block text-sm font-medium mb-1">Masa ID</label>
              <input
                type="text"
                placeholder="örn: masa_3"
                value={tableIdInput}
                onChange={(e) => setTableIdInput(e.target.value)}
                className="border p-2 rounded w-full mb-4"
              />

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="border rounded p-3 flex flex-col justify-between bg-gray-50 shadow-sm"
                  >
                    <div>
                      <h4 className="font-semibold">{p.name}</h4>
                      <p className="text-gray-600 text-sm">{p.price} ₺</p>
                    </div>
                    <button
                      onClick={() => addToCart(p)}
                      className="mt-2 bg-blue-600 text-white py-1 rounded hover:bg-blue-700"
                    >
                      Ekle
                    </button>
                  </div>
                ))}
              </div>

              <div className="border-t pt-3">
                <h4 className="font-semibold mb-2">🧺 Sepet</h4>
                {cart.length === 0 ? (
                  <p className="text-gray-500 text-sm">Sepet boş.</p>
                ) : (
                  cart.map((p) => (
                    <div
                      key={p.id}
                      className="flex justify-between items-center mb-2 text-sm"
                    >
                      <span>
                        {p.name} × {p.qty}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => dec(p.id)}
                          className="bg-gray-200 px-2 rounded"
                        >
                          −
                        </button>
                        <span>{p.qty}</span>
                        <button
                          onClick={() => inc(p.id)}
                          className="bg-gray-200 px-2 rounded"
                        >
                          +
                        </button>
                        <button
                          onClick={() => removeFromCart(p.id)}
                          className="text-red-600 text-xs"
                        >
                          Sil
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-between items-center mt-3 border-t pt-3 bg-white sticky bottom-0">
              <strong>Toplam: {total(cart)} ₺</strong>
              <button
                onClick={handleSubmitOrder}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Siparişi Gönder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Düzenle Modal */}
      {showEditModal && editOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl relative">
            <button
              onClick={() => setShowEditModal(false)}
              className="absolute top-2 right-3 text-gray-600 hover:text-black text-xl"
            >
              ✕
            </button>
            <h3 className="text-xl font-bold mb-4">✏️ Siparişi Düzenle</h3>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {products.map((p) => (
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

            <div className="border-t pt-3">
              <h4 className="font-semibold mb-2">Sepet</h4>
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

            <div className="flex justify-between items-center mt-4 border-t pt-3">
              <strong>Toplam: {total(editCart)} ₺</strong>
              <button
                onClick={saveEditedOrder}
                disabled={isSaving}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-60"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ödeme Modal */}
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

export default Waiter;