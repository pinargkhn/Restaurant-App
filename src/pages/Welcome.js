// src/pages/Welcome.js
import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './Welcome.css'; // Stil dosyasını import et
import logoImage from '../assets/happy_plates_logo.png';
// Logo dosyanızı projenize ekleyin (örn: src/assets/logo.png)
// import logo from '../assets/happymoons_logo.png'; // Logo yolunu kendi dosyanıza göre güncelleyin

export default function Welcome() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tableId = searchParams.get('table'); // URL'den masa ID'sini al

  const handleStart = () => {
    // Masa ID'si varsa, onu koruyarak ana menüye (`/`) yönlendir
    if (tableId) {
      navigate(`/?table=${tableId}`);
    } else {
      // Masa ID'si yoksa hata göster
      alert("Masa bilgisi URL'de bulunamadı! Lütfen QR kodu tekrar okutun.");
      // İsteğe bağlı olarak login'e yönlendirilebilir: navigate('/login');
    }
  };

  return (
    <div className="landing-container"> {/* CSS sınıfları landing- olarak kaldı */}
      <header className="landing-header">
        {/* Logoyu buraya ekleyin */}
        <img src={logoImage} alt="Happy Plates Logo" className="landing-logo" />
        
        <h1 className="landing-slogan">Different Planet in Every Plate</h1>
        {/* Instagram Linki ve İkonu */}
        <a href="https://www.instagram.com/happy_plates_official/" /* Değiştirin */ target="_blank" rel="noopener noreferrer" className="social-link">
          {/* Basit SVG Instagram ikonu */}
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.9 3.9 0 0 0-1.417.923A3.9 3.9 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.703.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.297-.048c.852-.04 1.433-.174 1.942-.372.526-.205.972-.478 1.417-.923.445-.444.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.297c-.04-.852-.174-1.433-.372-1.942a3.9 3.9 0 0 0-.923-1.417A3.9 3.9 0 0 0 13.24.42c-.51-.198-1.09-.333-1.942-.372C10.445.01 10.173 0 8 0zm0 1.442c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599s.453.546.598.92c.11.281.24.705.275 1.485.039.843.047 1.096.047 3.233s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485-.145.373-.319.64-.599.92s-.546.453-.92.598c-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.5 2.5 0 0 1-.92-.598 2.5 2.5 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233s.008-2.389.046-3.232c.036-.78.166-1.204.276-1.486.145-.373.319-.64.6-.92a2.5 2.5 0 0 1 .92-.599c.281-.11.705-.24 1.485-.276.843-.038 1.096-.047 3.232-.047zM8 4.908a3.092 3.092 0 1 0 0 6.184 3.092 3.092 0 0 0 0-6.184zM8 9.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zM12.316 4.31a.95.95 0 1 0 0 1.9.95.95 0 0 0 0-1.9z"/>
          </svg>
          <span>/happy_plates_official</span> {/* Değiştirin */}
        </a>
      </header>

      <main className="landing-main">
        {/* Başlama Butonu */}
        <button onClick={handleStart} className="start-button">
          BAŞLAMAK İÇİN TIKLAYIN!
        </button>
        {/* Dil Seçici (Basit Hali) */}
        <div className="language-selector">
          <span>🇹🇷</span>
          <span>Türkçe</span>
        </div>
      </main>

      <footer className="landing-footer">
        <p>FİYATLARIMIZA TÜM VERGİLER DAHİLDİR.</p>
        <p>Son fiyat güncellememiz 29.07.2025 tarihinde gerçekleşmiştir.</p>
        
      </footer>
    </div>
  );
}