// src/pages/UserPanel.js

import { useState, useEffect } from "react";
import { 
  db, 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc,
  // 🚀 DÜZELTME: getAuth yerine auth import edildi
  auth,
} from "../lib/firebase"; 
// 🚀 Firebase Auth fonksiyonları (Aynı Kalır)
import { createUserWithEmailAndPassword } from "firebase/auth";

const ROLES = ["admin", "waiter", "kitchen", "none"]; // none = yetkisiz

export default function UserPanel({ onBack }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // 🚀 YENİ STATE'LER (Aynı Kalır)
    const [showAddModal, setShowAddModal] = useState(false);
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newRole, setNewRole] = useState("waiter");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ---------------- Firestore Dinleme (Aynı Kalır) ----------------
    useEffect(() => {
        const unsub = onSnapshot(collection(db, "users"), (snap) => {
            setUsers(
                snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .filter(u => u.id !== 'EXAMPLE_USER_ID') 
                .sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email))
            );
            setLoading(false);
        }, (error) => {
            console.error("Kullanıcıları çekerken hata:", error);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    // ---------------- Rol Güncelleme (Aynı Kalır) ----------------
    const handleRoleChange = async (userId, newRole) => {
        try {
            const userRef = doc(db, "users", userId);
            await setDoc(userRef, { role: newRole }, { merge: true });
            alert(`✅ Kullanıcı rolü başarıyla ${newRole} olarak güncellendi.`);
        } catch (error) {
            console.error("Rol güncelleme hatası:", error);
            alert("❌ Rol güncellenemedi.");
        }
    };
    
    // ---------------- Kullanıcı Silme (Aynı Kalır) ----------------
    const handleDeleteUser = async (userId, userEmail) => {
        if (window.confirm(`${userEmail} kullanıcısını silmek istediğinizden emin misiniz? Firestore kaydı silinecek.`)) {
            try {
                // Firebase Auth'tan silme işlemi için sunucu tarafı işlem gerekir.
                await deleteDoc(doc(db, "users", userId)); 
                alert(`🗑️ ${userEmail} kullanıcısının rol kaydı silindi.`);
            } catch (error) {
                console.error("Kullanıcı silme hatası:", error);
                alert("❌ Kullanıcı silinemedi.");
            }
        }
    };
    
    // 🚀 YENİ FONKSİYON: Yeni kullanıcıyı oluşturma
    const handleCreateUser = async (e) => {
        e.preventDefault();
        if (!newEmail || newPassword.length < 6) {
            alert("Lütfen geçerli bir e-posta ve en az 6 karakterli bir şifre girin.");
            return;
        }

        setIsSubmitting(true);
        try {
            // 🚀 DÜZELTME: getAuth() yerine içeri aktarılan auth objesi kullanıldı.
            
            // 1. Firebase Authentication ile kullanıcı oluştur
            const userCredential = await createUserWithEmailAndPassword(auth, newEmail, newPassword);
            const user = userCredential.user;

            // 2. Firestore'a kullanıcı rol kaydını ekle
            const userRef = doc(db, "users", user.uid);
            await setDoc(userRef, { 
                email: user.email, 
                role: newRole,
                createdAt: new Date(), 
            }, { merge: true });

            alert(`✅ Yeni kullanıcı (${newEmail}) başarıyla oluşturuldu ve rolü '${newRole.toUpperCase()}' olarak atandı.`);
            
            // 3. Modalı kapat ve formu temizle
            setShowAddModal(false);
            setNewEmail("");
            setNewPassword("");
            setNewRole("waiter");

        } catch (error) {
            console.error("🔥 Yeni kullanıcı oluşturma hatası:", error);
            alert(`❌ Kullanıcı oluşturulamadı. Hata: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    if (loading) return <div className="p-6 max-w-4xl mx-auto">Kullanıcılar yükleniyor...</div>;

    // ---------------- Render ---------------- (Aynı Kalır)
    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* BAŞLIK VE BUTONLAR */}
            <div className="flex justify-between items-center mb-6 border-b pb-2">
                <h2 className="text-3xl font-bold">👤 Kullanıcı Yönetim Paneli</h2>
                <div className="flex gap-2"> 
                    <button
                        onClick={() => setShowAddModal(true)} 
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
                    >
                        ➕ Yeni Kullanıcı Ekle
                    </button>
                    <button
                        onClick={onBack}
                        className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition"
                    >
                        ← Ana Panele Dön
                    </button>
                </div>
            </div>
            
            <p className="mb-4 text-gray-600">
                ⚠️ **Not:** Yeni kullanıcı eklemek, Firebase Authentication'da bir hesap oluşturur ve ardından Firestore'daki rol kaydını atar.
            </p>

            {/* KULLANICI LİSTESİ */}
            <div className="space-y-3">
                {users.map((user) => (
                    <div
                        key={user.id}
                        className="flex justify-between items-center p-3 bg-white border rounded shadow-sm"
                    >
                        <div>
                            <span className="font-semibold">{user.email || user.id}</span>
                            <span className="text-sm text-gray-500 block">
                                Rol: {user.role || "none"}
                            </span>
                        </div>
                        
                        <div className="flex gap-2 items-center text-sm">
                            <select
                                value={user.role || 'none'}
                                onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                className="border p-1 rounded bg-white text-gray-800"
                            >
                                {ROLES.map(role => (
                                    <option key={role} value={role}>{role.toUpperCase()}</option>
                                ))}
                            </select>

                            <button
                                onClick={() => handleDeleteUser(user.id, user.email || user.id)}
                                className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                            >
                                Sil
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {!users.length && (
                <p className="text-gray-500 text-center mt-5">Kayıtlı kullanıcı rolü bulunmamaktadır.</p>
            )}
            
            {/* YENİ KULLANICI EKLEME MODALI */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
                        <h3 className="text-xl font-bold mb-4">Yeni Kullanıcı Oluştur</h3>
                        <form onSubmit={handleCreateUser} className="space-y-3">
                            <input
                                type="email"
                                placeholder="E-posta"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                className="border p-2 rounded w-full"
                                required
                                disabled={isSubmitting}
                            />
                            <input
                                type="password"
                                placeholder="Şifre (Min 6 karakter)"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="border p-2 rounded w-full"
                                required
                                minLength={6}
                                disabled={isSubmitting}
                            />
                            <select
                                value={newRole}
                                onChange={(e) => setNewRole(e.target.value)}
                                className="border p-2 rounded w-full bg-white"
                                disabled={isSubmitting}
                            >
                                {ROLES.filter(r => r !== 'none').map(role => (
                                    <option key={role} value={role}>{role.toUpperCase()}</option>
                                ))}
                            </select>
                            
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="bg-gray-500 text-white px-4 py-2 rounded flex-1 hover:bg-gray-600"
                                    disabled={isSubmitting}
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    className="bg-green-600 text-white px-4 py-2 rounded flex-1 hover:bg-green-700 disabled:bg-gray-400"
                                    disabled={isSubmitting || !newEmail || newPassword.length < 6}
                                >
                                    {isSubmitting ? 'Oluşturuluyor...' : 'Kullanıcıyı Oluştur'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}