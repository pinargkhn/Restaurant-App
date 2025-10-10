import React, { useState, useEffect, useMemo } from "react";
import { db, collection, onSnapshot, doc, updateDoc, getDoc } from "../lib/firebase";
import { submitOrder, updateOrderStatus, moveToPastOrders } from "../lib/orders";

function Waiter() {
  const [orders, setOrders] = useState([]);
  const [showDelivered, setShowDelivered] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editOrder, setEditOrder] = useState(null);
  const [editCart, setEditCart] = useState([]);
  const [cart, setCart] = useState([]);
  const [tableIdInput, setTableIdInput] = useState("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const products = useMemo(
    () => [
      { id: 1, name: "Pizza", price: 120 },
      { id: 2, name: "Hamburger", price: 80 },
      { id: 3, name: "Lahmacun", price: 60 },
      { id: 4, name: "Ayran", price: 20 },
      { id: 5, name: "Kola", price: 25 },
    ],
    []
  );

  const total = (arr) => arr.reduce((s, p) => s + p.price * p.qty, 0);

  // 🔹 Firestore siparişleri dinle
  useEffect(() => {
    const tablesRef = collection(db, "tables");
    const unsubTables = onSnapshot(tablesRef, (tablesSnap) => {
      const unsubscribers = [];
      tablesSnap.forEach((tableDoc) => {
        const tableId = tableDoc.id;
        const ordersRef = collection(db, "tables", tableId, "orders");
        const unsubOrders = onSnapshot(ordersRef, (ordersSnap) => {
          setOrders((prev) => {
            const filtered = prev.filter((o) => o.tableId !== tableId);
            const newOrders = ordersSnap.docs.map((d) => ({
              id: d.id,
              tableId,
              ...d.data(),
            }));
            return [...filtered, ...newOrders];
          });
        });
        unsubscribers.push(unsubOrders);
      });
      return () => unsubscribers.forEach((u) => u());
    });
    return () => unsubTables();
  }, []);

  // 🔹 Siparişleri filtrele
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const filteredActiveOrders = orders.filter((o) => o.status !== "Teslim Edildi");
  const filteredDeliveredOrders = orders.filter((o) => {
    if (o.status !== "Teslim Edildi") return false;
    const ts = o.deliveredAt?.seconds
      ? new Date(o.deliveredAt.seconds * 1000)
      : o.deliveredAt || o.updatedAt || o.createdAt;
    return ts && new Date(ts) > twentyFourHoursAgo;
  });
  const filteredList = showDelivered ? filteredDeliveredOrders : filteredActiveOrders;

  const getBgColor = (s) =>
    s === "Hazır"
      ? "bg-green-200"
      : s === "Hazırlanıyor"
      ? "bg-yellow-100"
      : s === "Teslim Edildi"
      ? "bg-blue-100"
      : "bg-white";

  // 🔹 Yeni sipariş işlemleri
  const addToCart = (p) => {
    const ex = cart.find((x) => x.id === p.id);
    ex
      ? setCart(cart.map((x) => (x.id === p.id ? { ...x, qty: x.qty + 1 } : x)))
      : setCart([...cart, { ...p, qty: 1 }]);
  };
  const removeFromCart = (id) => setCart(cart.filter((p) => p.id !== id));
  const inc = (id) => setCart(cart.map((p) => (p.id === id ? { ...p, qty: p.qty + 1 } : p)));
  const dec = (id) =>
    setCart(cart.map((p) => (p.id === id ? { ...p, qty: Math.max(1, p.qty - 1) } : p)));
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

  // 🔹 Teslim / Ödeme / Düzenleme
  const handleDelivered = async (o) => {
    try {
      await updateOrderStatus(o.tableId, o.id, "Teslim Edildi");
      await updateDoc(doc(db, "tables", o.tableId, "orders", o.id), {
        deliveredAt: new Date(),
      });
      alert(`✅ ${o.tableId} masası teslim edildi olarak işaretlendi`);
    } catch {
      alert("❌ Güncelleme başarısız");
    }
  };

  const handlePayment = async (method) => {
    try {
      const { tableId, id } = selectedOrder;
      const ref = doc(db, "tables", tableId, "orders", id);
      await updateDoc(ref, {
        paymentStatus: "Alındı",
        paymentMethod: method,
        paymentAt: new Date(),
      });
      await moveToPastOrders(tableId, id, {
        ...selectedOrder,
        paymentStatus: "Alındı",
        paymentMethod: method,
        paymentAt: new Date(),
      });
      alert(`✅ ${method} ile ödeme alındı! Masa ${tableId} boşaltıldı.`);
      setShowPaymentModal(false);
      setSelectedOrder(null);
    } catch {
      alert("❌ Ödeme kaydedilemedi.");
    }
  };

  const openEditModal = (order) => {
    setEditOrder(order);
    setEditCart(order.items || []);
    setShowEditModal(true);
  };

  const addToEditCart = (product) => {
    const ex = editCart.find((p) => p.id === product.id);
    ex
      ? setEditCart(editCart.map((p) => (p.id === product.id ? { ...p, qty: p.qty + 1 } : p)))
      : setEditCart([...editCart, { ...product, qty: 1 }]);
  };

  const increaseQty = (id) =>
    setEditCart(editCart.map((p) => (p.id === id ? { ...p, qty: p.qty + 1 } : p)));
  const decreaseQty = (id) =>
    setEditCart(editCart.map((p) => (p.id === id ? { ...p, qty: Math.max(1, p.qty - 1) } : p)));
  const removeFromEditCart = (id) => setEditCart(editCart.filter((p) => p.id !== id));

  const saveEditedOrder = async () => {
    if (isSaving) return;
    if (!editCart.length) return alert("Sipariş boş olamaz!");
    setIsSaving(true);
    try {
      const ref = doc(db, "tables", editOrder.tableId, "orders", editOrder.id);
      await updateDoc(ref, {
        items: editCart,
        total: total(editCart),
        newItemsAdded: true,
        updatedAt: new Date(),
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* ÜST BAR */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2 border-b pb-2">
        <h2 className="text-2xl font-bold">🧑‍🍳 Garson Paneli</h2>

        <div className="flex items-center gap-4">
          {/* Yeni Sipariş */}
          <button
            onClick={() => setShowModal(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 shadow-sm transition-all"
          >
            ➕ Yeni Sipariş
          </button>

          {/* Sekmeler */}
          <div className="flex border-b border-gray-300">
            <button
              onClick={() => setShowDelivered(false)}
              className={`relative px-4 py-2 text-sm font-medium transition-all ${
                !showDelivered
                  ? "text-blue-700 border-b-2 border-blue-700"
                  : "text-gray-500 hover:text-blue-600"
              }`}
            >
              📋 Aktif Siparişler
              {!showDelivered && (
                <span className="absolute bottom-0 left-0 w-full h-[2px] bg-blue-700"></span>
              )}
            </button>
            <button
              onClick={() => setShowDelivered(true)}
              className={`relative px-4 py-2 text-sm font-medium transition-all ${
                showDelivered
                  ? "text-blue-700 border-b-2 border-blue-700"
                  : "text-gray-500 hover:text-blue-600"
              }`}
            >
              📦 Teslim Edilenler
              {showDelivered && (
                <span className="absolute bottom-0 left-0 w-full h-[2px] bg-blue-700"></span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* SİPARİŞ LİSTESİ */}
      {filteredList.map((o) => (
        <div key={o.id} className={`p-3 border rounded mb-3 ${getBgColor(o.status)}`}>
          <div className="flex justify-between items-center">
            <p className="font-semibold">Masa: {o.tableId}</p>
            {!showDelivered && (
              <div className="flex gap-2">
                <button
                  onClick={() => openEditModal(o)}
                  className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                >
                  ✏️ Düzenle
                </button>
                <button
                  onClick={() => handleDelivered(o)}
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  ✅ Teslim Edildi
                </button>
                <button
                  onClick={() => {
                    setSelectedOrder(o);
                    setShowPaymentModal(true);
                  }}
                  className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                  💰 Ödeme Al
                </button>
              </div>
            )}
          </div>
          <p>
            <strong>Ürünler:</strong> {o.items.map((i) => `${i.name} x${i.qty}`).join(", ")}
          </p>
          <p>
            <strong>Toplam:</strong> {o.total} ₺
          </p>
        </div>
      ))}

      {/* 🆕 YENİ SİPARİŞ MODAL (ESKİ DÜZENLİ HALİYLE) */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 overflow-y-auto">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl relative flex flex-col max-h-[92vh]">
            {/* Kapat */}
            <button
              onClick={() => {
                setShowModal(false);
                clearCart();
                setTableIdInput("");
              }}
              className="absolute top-2 right-3 text-gray-600 hover:text-black text-2xl"
              aria-label="Kapat"
            >
              ✕
            </button>

            {/* Başlık */}
            <h3 className="text-xl font-bold mb-4 flex-shrink-0">
              🍽️ Yeni Sipariş Oluştur
            </h3>

            {/* İçerik (scrollable alan) */}
            <div className="overflow-y-auto flex-1 pr-1 pb-4">
              {/* Masa ID */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Masa ID</label>
                <input
                  type="text"
                  placeholder="örn: masa_3"
                  value={tableIdInput}
                  onChange={(e) => setTableIdInput(e.target.value)}
                  className="border p-2 rounded w-full"
                />
              </div>

              {/* Ürün Grid */}
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

              {/* Sepet */}
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

            {/* Sticky Footer */}
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

      {/* 💰 ÖDEME MODAL */}
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
                className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
                onClick={() => handlePayment("QR")}
              >
                🟢 QR ile Ödeme
              </button>
              <button
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                onClick={() => handlePayment("Kart")}
              >
                💳 Kredi/Banka Kartı
              </button>
              <button
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                onClick={() => handlePayment("Nakit")}
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
