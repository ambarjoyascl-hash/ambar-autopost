// public/firebase-config.js
// ─────────────────────────────────────────────────────────────────────────
//  ÚNICO archivo que editas para conectar la app. Las claves web de Firebase
//  son públicas por diseño (lo que protege tus datos son las reglas).
// ─────────────────────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/* 1) Firebase → ⚙️ Configuración del proyecto → Tus apps (Web) → "Config".
      Pega aquí ese objeto (usa el MISMO proyecto de tu autopost).            */
export const firebaseConfig = {
  apiKey: "AIzaSyDaeO7iG7ASEwsHzQMuXbHh1MNN_oyhgvY",
  authDomain: "ambar-joyas-cl.firebaseapp.com",
  projectId: "ambar-joyas-cl",
  storageBucket: "ambar-joyas-cl.firebasestorage.app",
  messagingSenderId: "233511708224",
  appId: "1:233511708224:web:6225b4e2e8bd21592a61a5",
  measurementId: "G-RD8T65P7GQ",
};

/* 2) Tus datos.                                                              */
export const APP_CONFIG = {
  businessName: "Ámbar Oro",
  adminEmail: "ginastrauss03@gmail.com", // solo este correo entra al panel
  whatsapp: "56977669288",               // +56 9 7766 9288
  instagram: "https://instagram.com/ambarjoyas.cl", // ← confírmame tu Instagram
  shopDomain: "https://www.ambarjoyas.cl", // para "Mi cuenta" (checkout Shopify)
  currencySymbol: "$",
};

// ── No toques de aquí para abajo ────────────────────────────────────────────
export const isConfigured = !String(firebaseConfig.apiKey).startsWith("TU_");
export const projectId = firebaseConfig.projectId;
export const app = isConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;
