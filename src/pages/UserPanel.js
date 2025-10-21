// src/pages/UserPanel.js
import { useState, useEffect } from "react";
import { 
  db, 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc,
  auth,
} from "../lib/firebase"; 
import { createUserWithEmailAndPassword } from "firebase/auth";
import './UserPanel.css'; // 👈 YENİ CSS İÇE AKTAR

const ROLES = ["admin", "waiter", "kitchen", "none"]; // none = yetkisiz

export default function UserPanel({ onBack }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [showAddModal, setShowAddModal] = useState(false);
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newRole, setNewRole] = useState("waiter");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ---------------- Firestore Dinleme ----------------
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

    // ---------------- Rol Güncelleme ----------------
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
    
    // ---------------- Kullanıcı Silme ----------------
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
    
    // ---------------- Yeni kullanıcıyı oluşturma ----------------
    const handleCreateUser = async (e) => {
        e.preventDefault();
        if (!newEmail || newPassword.length < 6) {
            alert("Lütfen geçerli bir e-posta ve en az 6 karakterli bir şifre girin.");
            return;
        }

        setIsSubmitting(true);
        try {
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
    
    if (loading) return <div className="admin-subpanel-container">Kullanıcılar yükleniyor...</div>;

    // ---------------- Render ----------------
    return (
        <div className="admin-subpanel-container">
            {/* BAŞLIK VE BUTONLAR */}
            <div className="subpanel-header">
                <h2 className="subpanel-title">👤 Kullanıcı Yönetim Paneli</h2>
                <div className="header-actions"> 
                    <button
                        onClick={() => setShowAddModal(true)} 
                        className="button button-green"
                    >
                        ➕ Yeni Kullanıcı Ekle
                    </button>
                    <button
                        onClick={onBack}
                        className="button button-secondary"
                    >
                        ← Ana Panele Dön
                    </button>
                </div>
            </div>
            
            <p className="panel-note">
                ⚠️ **Not:** Yeni kullanıcı eklemek, Firebase Authentication'da bir hesap oluşturur ve ardından Firestore'daki rol kaydını atar.
            </p>

            {/* KULLANICI LİSTESİ */}
            <div className="user-list">
                {users.map((user) => (
                    <div
                        key={user.id}
                        className="user-list-item"
                    >
                        <div className="user-info">
                            <span className="user-email">{user.email || user.id}</span>
                            <span className="user-role">
                                Rol: {user.role || "none"}
                            </span>
                        </div>
                        
                        <div className="user-actions">
                            <select
                                value={user.role || 'none'}
                                onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                className="form-select"
                            >
                                {ROLES.map(role => (
                                    <option key={role} value={role}>{role.toUpperCase()}</option>
                                ))}
                            </select>

                            <button
                                onClick={() => handleDeleteUser(user.id, user.email || user.id)}
                                className="button button-danger"
                            >
                                Sil
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {!users.length && (
                <p className="empty-text">Kayıtlı kullanıcı rolü bulunmamaktadır.</p>
            )}
            
            {/* YENİ KULLANICI EKLEME MODALI */}
            {showAddModal && (
                <div className="modal-overlay">
                    <div className="modal-content modal-add-user">
                        <h3 className="modal-title">Yeni Kullanıcı Oluştur</h3>
                        <form onSubmit={handleCreateUser} className="modal-form">
                            <input
                                type="email"
                                placeholder="E-posta"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                className="form-input"
                                required
                                disabled={isSubmitting}
                            />
                            <input
                                type="password"
                                placeholder="Şifre (Min 6 karakter)"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="form-input"
                                required
                                minLength={6}
                                disabled={isSubmitting}
                            />
                            <select
                                value={newRole}
                                onChange={(e) => setNewRole(e.target.value)}
                                className="form-select"
                                disabled={isSubmitting}
                            >
                                {ROLES.filter(r => r !== 'none').map(role => (
                                    <option key={role} value={role}>{role.toUpperCase()}</option>
                                ))}
                            </select>
                            
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="button button-secondary"
                                    disabled={isSubmitting}
                                >
                                    İptal
                                </button>
                                <button
                                    type="submit"
                                    className="button button-green"
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