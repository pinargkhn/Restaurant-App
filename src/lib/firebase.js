import { initializeApp } from "firebase/app";
import {
  getFirestore,
  serverTimestamp,
  addDoc,
  collection,
  updateDoc,
  doc,
  setDoc,        // ✅ kullanılıyor (CartContext’te)
  onSnapshot,
  query,
  orderBy,
  where,
} from "firebase/firestore";

// ✅ .env dosyandaki değerler
const firebaseConfig = {
  apiKey: process.env.REACT_APP_API_KEY,
  authDomain: process.env.REACT_APP_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_PROJECT_ID,
  storageBucket: process.env.REACT_APP_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_APP_ID,
};

// Firebase initialize
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Yardımcı exportlar
export {
  serverTimestamp,
  addDoc,
  collection,
  updateDoc,
  doc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  where,
};
