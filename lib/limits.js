// lib/limits.js
// Límites por plan de suscripción. El perfil de cada usuario vive en
// `users/{uid}`: { plan, createdAt, usage: { "2026-07": nGeneraciones } }.
// Sincro (Gina) asigna el plan editando el campo `plan` en Firestore
// (o vía futuro flujo de pago). Las cuentas nuevas parten en el plan `gratis`,
// que no caduca: mientras no haya pagos integrados, una cuenta que se queda sin
// plan no se bloquea sola, simplemente tiene topes bajos.
import { db } from "./firebase-admin.js";
import { FieldValue } from "firebase-admin/firestore";

export const TIERS = {
  // `trial` se mantiene como alias de `gratis` para las cuentas que ya lo tenían.
  gratis:  { name: "Gratis", brands: 1, gens: 5 },
  trial:   { name: "Gratis", brands: 1, gens: 5 },
  basico:  { name: "Básico",  brands: 1, gens: 8 },
  pro:     { name: "Pro",     brands: 2, gens: 20 },
  studio:  { name: "Studio",  brands: 3, gens: 40 },
  agencia: { name: "Agencia", brands: 4, gens: 100 },
};

const monthKey = () => new Date().toISOString().slice(0, 7); // "2026-07"

export async function getProfile(uid, email = null) {
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (snap.exists) return { ref, ...snap.data() };
  const doc = { plan: "gratis", email, createdAt: Date.now(), usage: {} };
  await ref.set(doc);
  return { ref, ...doc };
}

function tierOf(profile) {
  return TIERS[profile.plan] || TIERS.gratis;
}

/** Resumen para el frontend (plan, uso del mes, tope). */
export async function usageSummary(uid, email) {
  const p = await getProfile(uid, email);
  const tier = tierOf(p);
  return {
    plan: p.plan,
    planName: tier.name,
    brandsMax: tier.brands,
    gensMax: tier.gens,
    gensUsed: (p.usage || {})[monthKey()] || 0,
  };
}

/**
 * Verifica y descuenta una generación de plan. Lanza error claro si el
 * usuario agotó su cupo mensual.
 */
export async function consumeGeneration(uid, email) {
  const p = await getProfile(uid, email);
  const tier = tierOf(p);
  const key = monthKey();
  const used = (p.usage || {})[key] || 0;
  if (used >= tier.gens) {
    throw new Error(
      `Alcanzaste el límite de ${tier.gens} generaciones de tu plan ${tier.name} este mes. ` +
      "Sube de plan en la sección Planes para generar más."
    );
  }
  await p.ref.set({ usage: { [key]: FieldValue.increment(1) } }, { merge: true });
}

/** Verifica que el usuario pueda crear otra marca según su plan. */
export async function checkBrandLimit(uid, email, currentCount) {
  const p = await getProfile(uid, email);
  const tier = tierOf(p);
  if (currentCount >= tier.brands) {
    throw new Error(
      `Tu plan ${tier.name} incluye ${tier.brands} marca${tier.brands > 1 ? "s" : ""}. ` +
      "Sube de plan en la sección Planes para agregar más marcas."
    );
  }
}
