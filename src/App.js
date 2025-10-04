import { Routes, Route, Navigate } from "react-router-dom";
import Menu from "./components/Menu";
import Kitchen from "./pages/Kitchen";
import Waiter from "./pages/Waiter";
import QRAdmin from "./pages/QRAdmin";
import Login from "./pages/Login";
import { CartProvider } from "./context/CartContext";
import AdminDashboard from "./pages/AdminDashboard";

// 🔹 Yetkili kullanıcı kontrolü (rol bazlı koruma)
function PrivateRoute({ children, allowedRole }) {
  const role = localStorage.getItem("role");
  return role === allowedRole ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <CartProvider>
      <Routes>
        {/* 🔸 Müşteri (QR ile masa bağlantılı giriş) */}
        <Route path="/" element={<Menu />} />

        {/* 🔸 Giriş ekranı */}
        <Route path="/login" element={<Login />} />

        {/* 🔸 Mutfak (sadece "kitchen" rolü) */}
        <Route
          path="/kitchen"
          element={
            <PrivateRoute allowedRole="kitchen">
              <Kitchen />
            </PrivateRoute>
          }
        />

        {/* 🔸 Garson (sadece "waiter" rolü) */}
        <Route
          path="/waiter"
          element={
            <PrivateRoute allowedRole="waiter">
              <Waiter />
            </PrivateRoute>
          }
        />

        {/* 🔸 Admin (sadece "admin" rolü) */}
        <Route
          path="/qr"
          element={
            <PrivateRoute allowedRole="admin">
              <QRAdmin />
            </PrivateRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute allowedRole="admin">
              <AdminDashboard />
            </PrivateRoute>
           }
         />
      </Routes>
    </CartProvider>
  );
}

export default App;

