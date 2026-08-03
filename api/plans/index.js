// api/plans/index.js
// GET  /api/plans?brandId=...  → lista de planes (borradores y agendados)
// POST /api/plans              → genera un borrador de plan semanal (con IA)
//                                Body: { brandId, startDate?, postsPerWeek?,
//                                        includeEmails?, emailsPerWeek? }
import { checkAuth, readJson, requireBrand, withErrors } from "../../lib/api-helpers.js";
import { generatePlan, listPlans, approvePlan } from "../../lib/plan.js";
import { consumeGeneration, refundGeneration } from "../../lib/limits.js";

export default withErrors(async function handler(req, res) {
  const user = await checkAuth(req, res);
  if (!user) return;

  if (req.method === "GET") {
    if (!(await requireBrand(req, res, user, req.query.brandId))) return;
    const plans = await listPlans(req.query.brandId);
    return res.status(200).json({ plans });
  }

  if (req.method === "POST") {
    const body = await readJson(req);
    if (!(await requireBrand(req, res, user, body.brandId))) return;
    if (!user.admin) await consumeGeneration(user.uid, user.email);
    let plan;
    try {
      plan = await generatePlan(body.brandId, body);
    } catch (err) {
      // El cupo se descuenta antes de generar; si el plan no llegó a crearse
      // hay que devolverlo, o un fallo de la IA le come generaciones al usuario.
      if (!user.admin) await refundGeneration(user.uid).catch(() => {});
      throw err;
    }
    // Auto-agendar en el servidor: aunque el cliente cierre el navegador,
    // el contenido queda en calendario y cola.
    if (body.autoApprove) {
      const approved = await approvePlan(plan.id);
      return res.status(201).json({ plan, autoApproved: true, ...approved });
    }
    return res.status(201).json({ plan });
  }

  return res.status(405).json({ error: "Método no permitido." });
});
