// src/App.js
import { Routes, Route, Navigate } from "react-router-dom";
import Menu from "./pages/Menu";
import Kitchen from "./pages/Kitchen";
import Waiter from "./pages/Waiter";
import Login from "./pages/Login";
import Welcome from "./pages/Welcome"; // 👈 Karşılama ekranı import edildi
import { CartProvider } from "./context/CartContext";
import AdminDashboard from "./pages/AdminDashboard";
import './App.css'; // Global stiller

// Rol tabanlı koruma
function PrivateRoute({ children, allowedRole }) {
  const role = localStorage.getItem("role");
  return role === allowedRole ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <CartProvider>
      <Routes>
        {/* 👇 YENİ: Karşılama Ekranı Rotası */}
        <Route path="/welcome" element={<Welcome />} />

        {/* Müşteri Menüsü (Ana Rota - QR artık buraya yönlendirmiyor) */}
        <Route path="/" element={<Menu />} />

        {/* Giriş ekranı */}
        <Route path="/login" element={<Login />} />

        {/* Mutfak */}
        <Route
          path="/kitchen"
          element={
            <PrivateRoute allowedRole="kitchen">
              <Kitchen />
            </PrivateRoute>
          }
        />

        {/* Garson */}
        <Route
          path="/waiter"
          element={
            <PrivateRoute allowedRole="waiter">
              <Waiter />
            </PrivateRoute>
          }
        />

        {/* Yönetici Paneli */}
        <Route
          path="/dashboard"
          element={
            <PrivateRoute allowedRole="admin">
              <AdminDashboard />
            </PrivateRoute>
          }
        />

        {/* Bilinmeyen URL’lerde login’e yönlendirme */}
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </CartProvider>
  );
}

export default App;