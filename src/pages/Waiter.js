import React, { useEffect, useMemo, useState } from "react";
import {
  db,
  collection,
  collectionGroup,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
} from "../lib/firebase";
import { submitOrder, updateOrderStatus, moveToPastOrders } from "../lib/orders";

function Waiter() {
  // ---------------- STATE ----------------
  const [orders, setOrders] = useState([]);             // tables/*/orders (aktif + teslim edilen)
  const [pastPaid, setPastPaid] = useState([]);         // */pastOrders (ödenenler)
  const [activeTab, setActiveTab] = useState("active"); // active | delivered | paid

  const [showModal, setShowModal] = useState(false);           // Yeni Sipariş
  const [cart, setCart] = useState([]);
  const [tableIdInput, setTableIdInput] = useState("");

  const [showEditModal, setShowEditModal] = useState(false);   // Düzenle
  const [editOrder, setEditOrder] = useState(null);
  const [editCart, setEditCart] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false); // Ödeme
  const [selectedOrder, setSelectedOrder] = useState(null);

  // ---------------- STATIC PRODUCTS ----------------
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

  // ---------------- FIRESTORE LISTENERS ----------------
  useEffect(() => {
    // tables/*/orders dinle
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

  useEffect(() => {
    // tüm pastOrders (ödenenler) dinle
    const unsubPast = onSnapshot(collectionGroup(db, "pastOrders"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPastPaid(data || []);
    });
    return () => unsubPast();
  }, []);

  // ---------------- FILTERS ----------------
  const activeOrders = useMemo(
    () => orders.filter((o) => o.status !== "Teslim Edildi" && o.paymentStatus !== "Alındı"),
    [orders]
  );

  const deliveredOrders = useMemo(
    () => orders.filter((o) => o.status === "Teslim Edildi" && o.paymentStatus !== "Alındı"),
    [orders]
  );

  const paidOrders = useMemo(() => {
    // hem tables/*/orders içinden yanlışlıkla kalan "Alındı" olanlar, hem de pastOrders
    const fromCurrent = orders.filter((o) => o.paymentStatus === "Alındı");
    const fromPast = pastPaid.filter((o) => o.paymentStatus === "Alındı");
    const all = [...fromPast, ...fromCurrent];
    return all.sort(
      (a, b) => (b.paymentAt?.seconds || 0) - (a.paymentAt?.seconds || 0)
    );
  }, [orders, pastPaid]);

  const listForTab =
    activeTab === "active"
      ? activeOrders
      : activeTab === "delivered"
      ? deliveredOrders
      : paidOrders;

  const getBgColor = (s) =>
    s === "Hazır"
      ? "bg-green-200"
      : s === "Hazırlanıyor"
      ? "bg-yellow-100"
      : s === "Teslim Edildi"
      ? "bg-blue-100"
      : "bg-white";

  // ---------------- ACTIONS: ACTIVE ----------------
  const openEditModal = (order) => {
    setEditOrder(order);
    setEditCart(order.items || []);
    setShowEditModal(true);
  };

  const handleDelivered = async (o) => {
    try {
      await updateOrderStatus(o.tableId, o.id, "Teslim Edildi");
      await updateDoc(doc(db, "tables", o.tableId, "orders", o.id), {
        deliveredAt: new Date(),
      });
      // Aktif listeden kaybolup "Teslim Edilenler" sekmesine düşer
    } catch (e) {
      console.error(e);
      alert("❌ Güncelleme başarısız");
    }
  };

  // ---------------- ACTIONS: PAYMENT ----------------
  const openPayment = (order) => {
    setSelectedOrder(order);
    setShowPaymentModal(true);
  };

  const confirmPayment = async (method) => {
    if (!selectedOrder) return;
    try {
      const { tableId, id } = selectedOrder;
      const ref = doc(db, "tables", tableId, "orders", id);

      // tables/*/orders içine ödeme bilgisi yaz
      await updateDoc(ref, {
        paymentStatus: "Alındı",
        paymentMethod: method,
        paymentAt: new Date(),
      });

      // pastOrders'a taşı
      await moveToPastOrders(tableId, id, {
        ...selectedOrder,
        paymentStatus: "Alındı",
        paymentMethod: method,
        paymentAt: new Date(),
      });

      alert(`✅ ${method} ile ödeme alındı!`);
    } catch (e) {
      console.error(e);
      alert("❌ Ödeme kaydedilemedi");
    } finally {
      setShowPaymentModal(false);
      setSelectedOrder(null);
    }
  };

  // ---------------- NEW ORDER MODAL ----------------
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

  // ---------------- EDIT MODAL ----------------
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

  // ---------------- RENDER ----------------
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
            {/* Aktif */}
            <button
              onClick={() => setActiveTab("active")}
              className={`relative px-4 py-2 text-sm font-medium transition-all ${
                activeTab === "active"
                  ? "text-blue-700 border-b-2 border-blue-700"
                  : "text-gray-500 hover:text-blue-600"
              }`}
            >
              📋 Aktif Siparişler
              {activeTab === "active" && (
                <span className="absolute bottom-0 left-0 w-full h-[2px] bg-blue-700"></span>
              )}
            </button>

            {/* Teslim Edilenler (YENİ) */}
            <button
              onClick={() => setActiveTab("delivered")}
              className={`relative px-4 py-2 text-sm font-medium transition-all ${
                activeTab === "delivered"
                  ? "text-blue-700 border-b-2 border-blue-700"
                  : "text-gray-500 hover:text-blue-600"
              }`}
            >
              🚚 Teslim Edilenler
              {activeTab === "delivered" && (
                <span className="absolute bottom-0 left-0 w-full h-[2px] bg-blue-700"></span>
              )}
            </button>

            {/* Ödenenler (eski "Teslim Edilenler") */}
            <button
              onClick={() => setActiveTab("paid")}
              className={`relative px-4 py-2 text-sm font-medium transition-all ${
                activeTab === "paid"
                  ? "text-blue-700 border-b-2 border-blue-700"
                  : "text-gray-500 hover:text-blue-600"
              }`}
            >
              💰 Ödenenler
              {activeTab === "paid" && (
                <span className="absolute bottom-0 left-0 w-full h-[2px] bg-blue-700"></span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* LİSTE */}
      {listForTab.map((o) => (
        <div key={`${o.tableId}-${o.id}`} className={`p-3 border rounded mb-3 ${getBgColor(o.status)}`}>
          <div className="flex justify-between items-center">
            <p className="font-semibold">
              Masa: {o.tableId}{" "}
              <span className="text-sm text-gray-500">({o.status || "—"})</span>
            </p>
            <p className="font-semibold">{o.total} ₺</p>
          </div>

          <p className="mt-1">
            <strong>Ürünler:</strong> {o.items?.map((i) => `${i.name} x${i.qty}`).join(", ")}
          </p>

          {/* Aktif sekmede: Düzenle + Teslim Edildi */}
          {activeTab === "active" && (
            <div className="flex gap-2 mt-3">
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
                🚚 Teslim Edildi
              </button>
              {/* NOT: Ödeme Al burada YOK */}
            </div>
          )}

          {/* Teslim Edilenler sekmesinde: Ödeme Al */}
          {activeTab === "delivered" && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => openPayment(o)}
                className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                💰 Ödeme Al
              </button>
            </div>
          )}

          {/* Ödenenler sekmesinde: sadece bilgi (paymentMethod, paymentAt) */}
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

      {/* 🆕 YENİ SİPARİŞ MODAL (scrollable + sticky footer) */}
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

            <h3 className="text-xl font-bold mb-4 flex-shrink-0">🍽️ Yeni Sipariş Oluştur</h3>

            <div className="overflow-y-auto flex-1 pr-1 pb-4">
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
                    <div key={p.id} className="flex justify-between items-center mb-2 text-sm">
                      <span>
                        {p.name} × {p.qty}
                      </span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => dec(p.id)} className="bg-gray-200 px-2 rounded">
                          −
                        </button>
                        <span>{p.qty}</span>
                        <button onClick={() => inc(p.id)} className="bg-gray-200 px-2 rounded">
                          +
                        </button>
                        <button onClick={() => removeFromCart(p.id)} className="text-red-600 text-xs">
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

      {/* ✏️ DÜZENLE MODAL */}
      {showEditModal && editOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto relative">
            <button
              onClick={() => setShowEditModal(false)}
              className="absolute top-2 right-3 text-gray-500 hover:text-black text-xl"
            >
              ✕
            </button>
            <h3 className="text-xl font-bold mb-4">✏️ Siparişi Düzenle</h3>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {products.map((p) => (
                <div key={p.id} className="border rounded p-3 flex flex-col justify-between bg-gray-50 shadow-sm">
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
                  <div key={p.id} className="flex justify-between items-center mb-2 text-sm">
                    <span>
                      {p.name} × {p.qty}
                    </span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => decreaseQty(p.id)} className="bg-gray-200 px-2">
                        −
                      </button>
                      <button onClick={() => increaseQty(p.id)} className="bg-gray-200 px-2">
                        +
                      </button>
                      <button onClick={() => removeFromEditCart(p.id)} className="text-red-600">
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
                onClick={() => confirmPayment("QR")}
              >
                🟢 QR ile Ödeme
              </button>
              <button
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                onClick={() => confirmPayment("Kart")}
              >
                💳 Kredi/Banka Kartı
              </button>
              <button
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                onClick={() => confirmPayment("Nakit")}
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
