// public/firebase-config.js
// ─────────────────────────────────────────────────────────────────────────
//  Este es el ÚNICO archivo que necesitas editar para conectar tu app.
//  (Las claves de Firebase para web son públicas por diseño — es seguro.)
// ─────────────────────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/* 1) Firebase → ⚙️ Configuración del proyecto → Tus apps → "SDK de Firebase"
      (elige "Config"). Copia y pega los valores aquí.                        */
export const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID",
};

/* 2) Ajustes de tu negocio.                                                  */
export const APP_CONFIG = {
  businessName: "Ámbar Joyas",
  // ⚠️ El correo con el que administras (el mismo que pondrás en las reglas
  //    de seguridad). Solo esta cuenta puede subir/editar productos.
  adminEmail: "TU_CORREO_ADMIN@gmail.com",
  // Tu WhatsApp: solo números, con código de país (Chile 56, Panamá 507).
  whatsapp: "56900000000",
  instagram: "https://instagram.com/ambar.joyas",
  currency: "CLP", // Mercado Pago Chile → pesos chilenos
  currencySymbol: "$",
};

// ── De aquí para abajo no necesitas tocar nada ──────────────────────────────
export const isConfigured = !String(firebaseConfig.apiKey).startsWith("TU_");
export const app = isConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;
