// api/plans/index.js
// GET  /api/plans?brandId=...  → lista de planes (borradores y agendados)
// POST /api/plans              → genera un borrador de plan semanal (con IA)
//                                Body: { brandId, startDate?, postsPerWeek?,
//                                        includeEmails?, emailsPerWeek? }
import { checkAuth, readJson, requireBrand, withErrors } from "../../lib/api-helpers.js";
import { generatePlan, listPlans } from "../../lib/plan.js";

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
    const plan = await generatePlan(body.brandId, body);
    return res.status(201).json({ plan });
  }

  return res.status(405).json({ error: "Método no permitido." });
});
