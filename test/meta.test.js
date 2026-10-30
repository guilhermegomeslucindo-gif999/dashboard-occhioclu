// Testa a função api/meta.js com respostas simuladas da API do Meta (sem rede).
// Rode com: npm test
const assert = require('assert');

process.env.META_ACCESS_TOKEN = 'TOKEN_DE_TESTE';
process.env.META_AD_ACCOUNT_ID = 'act_465585599582830';

const calls = [];
const act = (type, value) => ({ action_type: type, value: String(value) });

function respond(u) {
  const url = new URL(u);
  const p = url.pathname;
  const level = url.searchParams.get('level');
  const range = JSON.parse(url.searchParams.get('time_range') || '{}');
  const prev = range.since && range.since < '2026-10-01';
  calls.push({ path: p, level, range, inc: url.searchParams.get('time_increment'), after: url.searchParams.get('after') });

  if (p.endsWith('/act_465585599582830')) return { name: 'CA - Occhio Blu', currency: 'BRL', timezone_name: 'America/Sao_Paulo', id: 'act_465585599582830' };
  if (p.endsWith('/insights') && level === 'account') {
    return { data: [prev
      ? { spend: '1326.05', reach: '6012', impressions: '19940', clicks: '1113', inline_link_clicks: '827',
          actions: [act('onsite_conversion.messaging_conversation_started_7d', 20), act('omni_purchase', 1), act('purchase', 1)],
          action_values: [act('omni_purchase', 598), act('purchase', 598)] }
      : { spend: '535.65', reach: '8806', impressions: '18758', clicks: '498', inline_link_clicks: '406',
          actions: [act('onsite_conversion.messaging_conversation_started_7d', 40), act('link_click', 406)] }] };
  }
  if (p.endsWith('/insights') && level === 'campaign' && url.searchParams.get('time_increment')) {
    return { data: [
      { campaign_id: '111', date_start: '2026-10-19', date_stop: '2026-10-19', spend: '24.64', inline_link_clicks: '19', actions: [act('onsite_conversion.messaging_conversation_started_7d', 14)] },
      { campaign_id: '222', date_start: '2026-10-23', date_stop: '2026-10-23', spend: '13.77', inline_link_clicks: '26' },
    ] };
  }
  if (p.endsWith('/insights') && level === 'campaign') {
    return { data: prev
      ? [{ campaign_id: '111', spend: '100', reach: '1000', impressions: '2000', clicks: '50', inline_link_clicks: '40', actions: [act('lead', 4)] }]
      : [
        { campaign_id: '111', campaign_name: 'Vendas WPP', spend: '139.37', reach: '2339', impressions: '2979', clicks: '116', inline_link_clicks: '66',
          actions: [act('onsite_conversion.messaging_conversation_started_7d', 36)] },
        { campaign_id: '222', campaign_name: 'Tráfego IG', spend: '114.68', reach: '4773', impressions: '6403', clicks: '223', inline_link_clicks: '223' },
      ] };
  }
  if (p.endsWith('/insights') && level === 'ad') {
    return { data: [
      { ad_id: '9001', ad_name: 'Ponto de luz', adset_id: '5', adset_name: '[PUB QUENTE]', campaign_id: '111', campaign_name: 'Vendas WPP',
        spend: '94.78', impressions: '2072', clicks: '81', inline_link_clicks: '45', actions: [act('onsite_conversion.messaging_conversation_started_7d', 21)] },
    ] };
  }
  if (p.endsWith('/campaigns')) {
    return { data: [
      { id: '111', name: 'Vendas WPP', objective: 'OUTCOME_SALES', effective_status: 'PAUSED' },
      { id: '222', name: 'Tráfego IG', objective: 'OUTCOME_TRAFFIC', effective_status: 'ACTIVE' },
      { id: '333', name: 'Campanha nova sem gasto', objective: 'OUTCOME_SALES', effective_status: 'ACTIVE' },
      { id: '444', name: 'Pausada antiga', objective: 'OUTCOME_SALES', effective_status: 'PAUSED' },
    ] };
  }
  if (p.endsWith('/ads')) {
    if (!url.searchParams.get('after')) {
      return { data: [
        { id: '9001', name: 'Ponto de luz', effective_status: 'CAMPAIGN_PAUSED', campaign_id: '111', adset: { id: '5', name: '[PUB QUENTE]' },
          preview_shareable_link: 'https://fb.me/abc', creative: { thumbnail_url: 'https://scontent.xx.fbcdn.net/t1.jpg', object_type: 'VIDEO', video_id: '77' } },
        { id: '9002', name: 'Anúncio pausado sem entrega', effective_status: 'PAUSED', campaign_id: '444', adset: { name: 'X' }, creative: {} },
      ], paging: { next: 'https://graph.facebook.com/v23.0/act_465585599582830/ads?after=CUR2&access_token=TOKEN_DE_TESTE' } };
    }
    return { data: [
      { id: '9003', name: 'Anúncio novo subido hoje', effective_status: 'ACTIVE', campaign_id: '333', adset: { name: 'CJ novo' },
        preview_shareable_link: 'https://fb.me/novo', creative: { image_url: 'https://scontent.xx.fbcdn.net/img.jpg', object_type: 'SHARE' } },
    ] };
  }
  throw new Error('URL inesperada no teste: ' + u);
}

global.fetch = async (u) => ({ status: 200, json: async () => respond(u) });

const handler = require('../api/meta.js');

function run(query) {
  return new Promise((resolve) => {
    const headers = {};
    const res = {
      statusCode: 0,
      setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      end: (body) => resolve({ status: res.statusCode, headers, body: JSON.parse(body) }),
    };
    handler({ query, url: '/api/meta' }, res);
  });
}

(async () => {
  const { status, headers, body } = await run({ start: '2026-10-01', end: '2026-10-29' });
  assert.strictEqual(status, 200, JSON.stringify(body));
  assert.strictEqual(headers['cache-control'], 's-maxage=60, stale-while-revalidate=300');

  // Período anterior: mesmo número de dias, logo antes
  assert.deepStrictEqual(body.period, { start: '2026-10-01', end: '2026-10-29', prev_start: '2026-09-02', prev_end: '2026-09-30' });
  assert.strictEqual(body.account.id, '465585599582830');

  // Totais e conversões
  assert.strictEqual(body.totals.cur.spend, 535.65);
  assert.strictEqual(body.totals.cur.leads, 40);
  assert.strictEqual(body.totals.cur.link_clicks, 406);
  assert.strictEqual(body.totals.cur.purchases, 0);
  assert.strictEqual(body.totals.prev.purchases, 1, 'omni_purchase sem contar purchase em dobro');
  assert.strictEqual(body.totals.prev.revenue, 598);

  // Campanha nova ativa sem gasto aparece; a pausada sem entrega não
  const ids = body.campaigns.map((c) => c.id).sort();
  assert.deepStrictEqual(ids, ['111', '222', '333']);
  const nova = body.campaigns.find((c) => c.id === '333');
  assert.strictEqual(nova.status, 'ACTIVE');
  assert.strictEqual(nova.cur.spend, 0);
  assert.strictEqual(body.campaigns.find((c) => c.id === '111').prev.leads, 4);

  // Anúncios: com entrega + ativos (inclui o da 2ª página), sem o pausado sem entrega
  const adIds = body.ads.map((a) => a.id).sort();
  assert.deepStrictEqual(adIds, ['9001', '9003']);
  const v = body.ads.find((a) => a.id === '9001');
  assert.strictEqual(v.format, 'video');
  assert.strictEqual(v.thumb, 'https://scontent.xx.fbcdn.net/t1.jpg');
  assert.strictEqual(v.leads, undefined);
  assert.strictEqual(v.cur.leads, 21);
  const novo = body.ads.find((a) => a.id === '9003');
  assert.strictEqual(novo.campaign, 'Campanha nova sem gasto');
  assert.strictEqual(novo.format, 'image');
  assert.strictEqual(novo.thumb, 'https://scontent.xx.fbcdn.net/img.jpg');
  assert.strictEqual(novo.cur.spend, 0);

  // Diário
  assert.strictEqual(body.daily.length, 2);
  assert.deepStrictEqual(body.daily[0], { date: '2026-10-19', campaign_id: '111', spend: 24.64, link_clicks: 19, leads: 14 });

  // O token nunca vai na resposta
  assert.ok(!JSON.stringify(body).includes('TOKEN_DE_TESTE'));

  // Validações
  assert.strictEqual((await run({ start: '2026-10-29', end: '2026-10-01' })).status, 400);
  assert.strictEqual((await run({ start: '2024-01-01', end: '2026-10-01' })).status, 400);
  const f = await run({ start: '2026-10-01', end: '2026-10-29', fresh: '1' });
  assert.strictEqual(f.headers['cache-control'], 'no-store');

  // Token inválido
  global.fetch = async () => ({ status: 400, json: async () => ({ error: { message: 'Error validating access token', code: 190 } }) });
  const bad = await run({ start: '2026-10-01', end: '2026-10-29' });
  assert.strictEqual(bad.status, 502);
  assert.ok(/expirou ou é inválido/.test(bad.body.error));

  // Sem token
  delete process.env.META_ACCESS_TOKEN;
  const none = await run({});
  assert.strictEqual(none.status, 500);
  assert.ok(/META_ACCESS_TOKEN/.test(none.body.error));

  console.log('OK: todos os testes passaram');
})().catch((e) => { console.error(e); process.exit(1); });
