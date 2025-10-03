import { Routes, Route, Link } from "react-router-dom";
import Menu from "./components/Menu";
import Kitchen from "./pages/Kitchen";
import Waiter from "./pages/Waiter";
import QRAdmin from "./pages/QRAdmin";   // ✅ QR sayfası eklendi
import { CartProvider } from "./context/CartContext";

function App() {
  return (
    <CartProvider>
      <div className="min-h-screen bg-gray-100">
        <nav className="bg-white shadow p-4 flex gap-4">
          <Link className="text-blue-600" to="/">Müşteri (Menü)</Link>
          <Link className="text-blue-600" to="/kitchen">Mutfak</Link>
          <Link className="text-blue-600" to="/waiter">Garson</Link>
          <Link className="text-blue-600" to="/qr">QR Kod Yönetimi</Link> {/* ✅ yeni */}
        </nav>

        <Routes>
          <Route path="/" element={<Menu />} />
          <Route path="/kitchen" element={<Kitchen />} />
          <Route path="/waiter" element={<Waiter />} />
          <Route path="/qr" element={<QRAdmin />} /> {/* ✅ yeni */}
        </Routes>
      </div>
    </CartProvider>
  );
}

export default App;
