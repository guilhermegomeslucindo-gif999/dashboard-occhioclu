// Função de servidor (Vercel) que busca os dados da conta de anúncios no Meta.
// O token fica só aqui no servidor, nas variáveis de ambiente da Vercel. Ele nunca vai para o navegador.
//
// Variáveis de ambiente:
//   META_ACCESS_TOKEN   (obrigatória) token de Usuário do Sistema com a permissão ads_read
//   META_AD_ACCOUNT_ID  (opcional)    padrão: 465585599582830 (CA - Occhio Blu)
//   META_APP_SECRET     (opcional)    se definida, envia o appsecret_proof (mais seguro)
//   META_API_VERSION    (opcional)    padrão: v23.0

const crypto = require('crypto');

const VERSION = process.env.META_API_VERSION || 'v23.0';
const ACCOUNT = String(process.env.META_AD_ACCOUNT_ID || '465585599582830').replace(/^act_/, '').trim();
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const LEAD_TYPES = ['onsite_conversion.messaging_conversation_started_7d', 'lead'];
const INSIGHT_FIELDS = 'spend,reach,impressions,clicks,inline_link_clicks,actions,action_values';
const CAMPAIGN_STATUSES = ['ACTIVE', 'PAUSED', 'IN_PROCESS', 'WITH_ISSUES', 'ARCHIVED'];
const AD_STATUSES = ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES',
  'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO', 'ARCHIVED'];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function sumActions(list, types) {
  return (list || []).filter((a) => types.includes(a.action_type)).reduce((s, a) => s + num(a.value), 0);
}

// Usa omni_purchase (todas as fontes) e cai para purchase quando não houver, sem contar em dobro.
function purchaseOf(list) {
  const arr = list || [];
  const omni = arr.find((a) => a.action_type === 'omni_purchase');
  if (omni) return num(omni.value);
  const p = arr.find((a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
  return p ? num(p.value) : 0;
}

function metrics(row) {
  const r = row || {};
  return {
    spend: num(r.spend),
    reach: num(r.reach),
    impressions: num(r.impressions),
    clicks: num(r.clicks),
    link_clicks: num(r.inline_link_clicks),
    leads: sumActions(r.actions, LEAD_TYPES),
    purchases: purchaseOf(r.actions),
    revenue: purchaseOf(r.action_values),
  };
}

const addDays = (iso, d) => new Date(Date.parse(iso + 'T00:00:00Z') + d * 864e5).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5) + 1;
const todaySP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

class MetaError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function makeGraph(token) {
  const proof = process.env.META_APP_SECRET
    ? crypto.createHmac('sha256', process.env.META_APP_SECRET).update(token).digest('hex')
    : null;

  async function getJson(url) {
    let last;
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(url);
      const j = await r.json().catch(() => ({ error: { message: 'Resposta inválida do Meta (HTTP ' + r.status + ')' } }));
      if (!j.error) return j;
      last = j.error;
      // Limite de chamadas ou erro temporário: espera um pouco e tenta de novo
      const temporario = j.error.is_transient || [1, 2, 4, 17, 341, 80004].includes(j.error.code);
      if (!temporario) break;
      await new Promise((ok) => setTimeout(ok, 800 * (attempt + 1)));
    }
    throw new MetaError(last.error_user_msg || last.message || 'Erro do Meta', last.code, 502);
  }

  // Faz a chamada e segue a paginação. Uma resposta que não é lista volta como objeto.
  return async function graph(path, params = {}, maxPages = 25) {
    const url = new URL(`https://graph.facebook.com/${VERSION}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    url.searchParams.set('access_token', token);
    if (proof) url.searchParams.set('appsecret_proof', proof);

    const first = await getJson(url.toString());
    if (!Array.isArray(first.data)) return first;
    let out = first.data;
    let next = first.paging && first.paging.next;
    let pages = 1;
    while (next && pages < maxPages) {
      const j = await getJson(next);
      out = out.concat(j.data || []);
      next = j.paging && j.paging.next;
      pages += 1;
    }
    return out;
  };
}

function send(res, status, body, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    return send(res, 500, {
      error: 'Falta configurar a variável META_ACCESS_TOKEN na Vercel (Settings → Environment Variables). Veja o README.',
    });
  }

  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  let start = String(q.start || '');
  let end = String(q.end || '');
  if (!DAY.test(start) || !DAY.test(end)) {
    end = todaySP();
    start = end.slice(0, 8) + '01';
  }
  if (start > end) return send(res, 400, { error: 'A data inicial é depois da data final.' });
  const n = daysBetween(start, end);
  if (n > 400) return send(res, 400, { error: 'Escolha um período de até 400 dias.' });
  const prevStart = addDays(start, -n);
  const prevEnd = addDays(start, -1);
  const fresh = Boolean(q.fresh);

  const graph = makeGraph(token);
  const act = `/act_${ACCOUNT}`;
  const insights = (level, since, until, fields, extra = {}) =>
    graph(`${act}/insights`, {
      level,
      fields,
      time_range: { since, until },
      use_unified_attribution_setting: true,
      limit: 500,
      ...extra,
    });

  try {
    const [info, acc, accPrev, camp, campPrev, adRows, daily, campEnt, adEnt] = await Promise.all([
      graph(act, { fields: 'name,currency,timezone_name' }),
      insights('account', start, end, INSIGHT_FIELDS),
      insights('account', prevStart, prevEnd, INSIGHT_FIELDS),
      insights('campaign', start, end, 'campaign_id,campaign_name,' + INSIGHT_FIELDS),
      insights('campaign', prevStart, prevEnd, 'campaign_id,' + INSIGHT_FIELDS),
      insights('ad', start, end, 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,' + INSIGHT_FIELDS),
      insights('campaign', start, end, 'campaign_id,spend,inline_link_clicks,actions', { time_increment: 1 }),
      graph(`${act}/campaigns`, {
        fields: 'id,name,objective,effective_status',
        filtering: [{ field: 'effective_status', operator: 'IN', value: CAMPAIGN_STATUSES }],
        limit: 500,
      }),
      graph(`${act}/ads`, {
        fields: 'id,name,effective_status,campaign_id,adset{id,name},preview_shareable_link,'
          + 'creative.thumbnail_width(480).thumbnail_height(600){thumbnail_url,image_url,object_type,video_id}',
        filtering: [{ field: 'effective_status', operator: 'IN', value: AD_STATUSES }],
        limit: 200,
      }),
    ]);

    // Campanhas: as que tiveram entrega no período + todas as ativas agora (mesmo sem gasto ainda)
    const campInfo = new Map(campEnt.map((c) => [String(c.id), c]));
    const campCur = new Map(camp.map((r) => [String(r.campaign_id), r]));
    const campPrv = new Map(campPrev.map((r) => [String(r.campaign_id), r]));
    const campIds = new Set([...campCur.keys(), ...campEnt.filter((c) => c.effective_status === 'ACTIVE').map((c) => String(c.id))]);
    const campaigns = [...campIds].map((id) => {
      const e = campInfo.get(id) || {};
      const r = campCur.get(id);
      return {
        id,
        name: e.name || (r && r.campaign_name) || id,
        objective: e.objective || '',
        status: e.effective_status || '',
        cur: metrics(r),
        prev: metrics(campPrv.get(id)),
      };
    });
    const campName = (id, fallback) => (campInfo.get(String(id)) || {}).name || fallback || '';

    // Anúncios: os que tiveram entrega no período + todos os ativos agora
    const adInfo = new Map(adEnt.map((a) => [String(a.id), a]));
    const adCur = new Map(adRows.map((r) => [String(r.ad_id), r]));
    const adIds = new Set([...adCur.keys(), ...adEnt.filter((a) => a.effective_status === 'ACTIVE').map((a) => String(a.id))]);
    const ads = [...adIds].map((id) => {
      const e = adInfo.get(id) || {};
      const r = adCur.get(id) || {};
      const cr = e.creative || {};
      const campaignId = String(e.campaign_id || r.campaign_id || '');
      return {
        id,
        name: e.name || r.ad_name || id,
        status: e.effective_status || '',
        campaign_id: campaignId,
        campaign: campName(campaignId, r.campaign_name),
        adset: (e.adset && e.adset.name) || r.adset_name || '',
        format: cr.video_id || cr.object_type === 'VIDEO' ? 'video' : 'image',
        thumb: cr.thumbnail_url || cr.image_url || '',
        preview: e.preview_shareable_link || '',
        cur: metrics(r),
      };
    });

    const days = daily.map((r) => ({
      date: String(r.date_start).slice(0, 10),
      campaign_id: String(r.campaign_id),
      spend: num(r.spend),
      link_clicks: num(r.inline_link_clicks),
      leads: sumActions(r.actions, LEAD_TYPES),
    }));

    return send(res, 200, {
      account: { id: ACCOUNT, name: info.name || '', currency: info.currency || 'BRL', timezone: info.timezone_name || '' },
      period: { start, end, prev_start: prevStart, prev_end: prevEnd },
      generated_at: new Date().toISOString(),
      totals: { cur: metrics(acc[0]), prev: metrics(accPrev[0]) },
      campaigns,
      ads,
      daily: days,
    }, fresh ? 'no-store' : 's-maxage=60, stale-while-revalidate=300');
  } catch (err) {
    let msg = err.message || 'Erro ao buscar os dados.';
    if (err.code === 190) msg = 'O token do Meta expirou ou é inválido. Gere um novo e atualize META_ACCESS_TOKEN na Vercel. (' + msg + ')';
    else if (err.code === 10 || err.code === 200 || (err.code === 100 && /permission|permiss/i.test(msg))) {
      msg = 'O token não tem acesso a esta conta de anúncios. Confira se o Usuário do Sistema recebeu a conta e a permissão ads_read. (' + msg + ')';
    } else if ([4, 17, 80004].includes(err.code)) msg = 'O Meta limitou as consultas por alguns minutos. Tente de novo em instantes.';
    return send(res, err.status || 500, { error: msg, code: err.code || null });
  }
};

// Exportado só para os testes
module.exports._internals = { metrics, sumActions, purchaseOf, addDays, daysBetween };
