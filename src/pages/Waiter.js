// src/pages/Waiter.js
import { useEffect, useState } from "react";
import { db, collection, onSnapshot, doc } from "../lib/firebase";
import {
  getDoc,
  updateDoc,
  collectionGroup,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import {
  submitOrder,
  updateOrderStatus,
  moveToPastOrders,
  startQrPayment,
} from "../lib/orders";
import { QRCodeCanvas } from "qrcode.react";
import { getAuth } from "firebase/auth";

export default function Waiter() {
  const [orders, setOrders] = useState([]);
  const [pastOrders, setPastOrders] = useState([]);
  const [showPastOrders, setShowPastOrders] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [cart, setCart] = useState([]);
  const [tableIdInput, setTableIdInput] = useState("");
  const [qrModal, setQrModal] = useState({ open: false, order: null, url: "", waiting: false });

  const products = [
    { id: 1, name: "Pizza", price: 120 },
    { id: 2, name: "Hamburger", price: 80 },
    { id: 3, name: "Lahmacun", price: 60 },
    { id: 4, name: "Ayran", price: 20 },
    { id: 5, name: "Kola", price: 25 },
  ];

  const getTableNumber = (id) => {
    if (!id) return null;
    const m = String(id).match(/(\d+)(?!.*\d)/);
    return m ? parseInt(m[1], 10) : null;
  };

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

  useEffect(() => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const q = query(
      collectionGroup(db, "pastOrders"),
      where("deliveredAt", ">", twentyFourHoursAgo),
      orderBy("deliveredAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setPastOrders(data);
    });
    return () => unsub();
  }, []);

  const total = (arr) => arr.reduce((sum, p) => sum + p.price * p.qty, 0);

  const searchNum =
    searchTerm.trim() === "" ? null : parseInt(searchTerm.trim(), 10);

  const filteredOrders =
    searchNum === null
      ? orders
      : orders.filter((o) => getTableNumber(o.tableId) === searchNum);

  const filteredPastOrders =
    searchNum === null
      ? pastOrders
      : pastOrders.filter((p) => getTableNumber(p.tableId) === searchNum);

  const addToCart = (product) => {
    const existing = cart.find((p) => p.id === product.id);
    existing
      ? setCart(cart.map((p) => (p.id === product.id ? { ...p, qty: p.qty + 1 } : p)))
      : setCart([...cart, { ...product, qty: 1 }]);
  };
  const removeFromCart = (id) => setCart(cart.filter((p) => p.id !== id));

  const handleSubmitOrder = async () => {
    const tableId = tableIdInput.trim();
    if (!tableId) return alert("Lütfen masa numarasını girin!");
    if (!cart.length) return alert("Sepet boş!");
    try {
      const tableRef = doc(db, "tables", tableId);
      const snap = await getDoc(tableRef);
      if (!snap.exists()) return alert("❌ Bu masa sistemde kayıtlı değil.");
      await submitOrder({ tableId, items: cart, total: total(cart) });
      alert(`✅ Sipariş gönderildi (${tableId})`);
      setCart([]);
      setTableIdInput("");
      setShowModal(false);
    } catch (e) {
      alert("Hata: " + e.message);
    }
  };

  // 🧾 QR ödeme başlat
  const openQrForOrder = async (order) => {
    try {
      const auth = getAuth();
      const waiterUid = auth.currentUser?.uid || null;
      setQrModal({ open: true, order, url: "", waiting: true });
      const { url } = await startQrPayment({
        tableId: order.tableId,
        orderId: order.id,
        amount: order.total,
        waiterUid,
      });
      setQrModal({ open: true, order, url, waiting: false });
    } catch (err) {
      console.error(err);
      alert("QR başlatılamadı!");
      setQrModal({ open: false, order: null, url: "", waiting: false });
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-3">
        <h2 className="text-2xl font-bold">🧑‍🍳 Garson Paneli</h2>
        <div className="flex items-center gap-2 w-full md:w-auto relative">
          <input
            type="text"
            inputMode="numeric"
            placeholder="🔍 Masa numarası (örn: 3)"
            value={searchTerm}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, "");
              setSearchTerm(val);
            }}
            className="border rounded p-2 w-full md:w-64 pr-8"
          />
          <button
            onClick={() => setShowModal(true)}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            ➕ Yeni Sipariş
          </button>
        </div>
      </div>

      <h3 className="text-xl font-semibold mb-2">Aktif Siparişler</h3>
      {filteredOrders.map((o) => (
        <div key={o.id} className="p-3 border rounded mb-3 bg-white shadow-sm">
          <p className="font-semibold mb-1">Masa: {o.tableId}</p>
          <p className="mb-1"><strong>Durum:</strong> {o.status}</p>
          <p className="mb-1"><strong>Toplam:</strong> {o.total} ₺</p>
          <p className="mb-1">
            <strong>Ödeme:</strong>{" "}
            <span className={`px-2 py-1 rounded ${o.payment?.status === "paid" ? "bg-green-200" : "bg-yellow-200"}`}>
              {o.payment?.status || "Bekleniyor"}
            </span>
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => openQrForOrder(o)}
              className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              🧾 QR ile Öde
            </button>
          </div>
        </div>
      ))}

      {/* 🧾 QR ÖDEME MODAL */}
      {qrModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md relative">
            <button
              onClick={() => setQrModal({ open: false, order: null, url: "", waiting: false })}
              className="absolute top-2 right-3 text-gray-600 hover:text-black text-2xl"
            >
              ✕
            </button>
            <h3 className="text-xl font-bold mb-2">
              QR ile Öde — {qrModal.order?.tableId}
            </h3>
            <p className="text-gray-600 mb-4">
              Tutar: <strong>{qrModal.order?.total} ₺</strong>
            </p>
            {qrModal.waiting && <p>Ödeme linki hazırlanıyor...</p>}
            {!qrModal.waiting && qrModal.url && (
              <div className="flex flex-col items-center gap-3">
                <QRCodeCanvas value={qrModal.url} size={180} />
                <a
                  href={qrModal.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 underline text-sm"
                >
                  Linki yeni sekmede aç
                </a>
                <p className="text-sm text-gray-500 text-center">
                  Müşteri QR'ı telefonuyla okutup ödesin. Ödeme tamamlanınca durum otomatik güncellenecektir.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
