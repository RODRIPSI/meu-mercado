// Edge Function: importa encartes de supermercados, lê as imagens com IA de visão e grava ofertas no Supabase.
// Roda no BACKEND: a chave da IA (ANTHROPIC_API_KEY) é segredo da função e nunca chega ao app.
// Retomável: cada chamada faz pouco trabalho (descobrir encarte novo + processar poucas páginas) e o agendador repete.
// Dispara por: (1) agendador (cabeçalho x-ingest-token) ou (2) curador logado ("Verificar agora").
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument } from 'npm:pdf-lib@1.17.1';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { CONNECTORS } from '../_shared/connectors.ts';
import { isAllowedByRobots } from '../_shared/robots.ts';
import { fingerprintKey, parseValidityText, validateOffer } from '../_shared/offers.ts';
import { buildRequest, DEFAULT_MODEL, parseToolUse, PROMPT_VERSION, type PageResult } from '../_shared/vision.ts';

const USER_AGENT = 'MeuMercadoInteligente/1.0 (leitor pessoal de encartes; respeita robots.txt)';
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_PAGES = 30;
const PAGES_PER_RUN = 2;                                   // limita tempo por chamada
const MAX_VISION_CALLS_PER_DAY = Number(Deno.env.get('MAX_VISION_CALLS_PER_DAY') ?? 80);   // teto de custo
const RECHECK_HOURS = 6;                                   // não consulta o site da rede mais que isso (sem force)

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, x-ingest-token', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (data: Uint8Array | string) => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? new TextEncoder().encode(data) : data));
const todayISO = () => new Date().toISOString().slice(0, 10);

// deno-lint-ignore no-explicit-any
type SB = any;

async function authorize(req: Request, sb: SB): Promise<'cron' | 'curator' | null> {
  const token = req.headers.get('x-ingest-token');
  if (token) {
    const { data } = await sb.rpc('ingest_token_ok', { p_token: token });
    return data === true ? 'cron' : null;
  }
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (jwt) {
    const { data } = await sb.auth.getUser(jwt);
    if (data?.user) {
      const { data: c } = await sb.from('app_curators').select('user_id').eq('user_id', data.user.id).maybeSingle();
      if (c) return 'curator';
    }
  }
  return null;
}

async function politeFetch(url: string, accept: string): Promise<Response> {
  return await fetch(url, { headers: { 'user-agent': USER_AGENT, accept }, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
}

async function robotsAllows(origin: string, urls: string[]): Promise<{ ok: boolean; why?: string }> {
  const r = await politeFetch(`${origin}/robots.txt`, 'text/plain').catch(() => null);
  if (!r) return { ok: false, why: 'robots_indisponivel' };
  if (r.status === 404 || r.status === 410) return { ok: true };            // sem robots.txt = sem restrição declarada
  if (!r.ok) return { ok: false, why: `robots_http_${r.status}` };          // dúvida => não coleta
  const txt = await r.text();
  for (const u of urls) {
    const p = new URL(u); if (!isAllowedByRobots(txt, p.pathname + p.search, USER_AGENT)) return { ok: false, why: 'bloqueado_por_robots' };
  }
  return { ok: true };
}

async function setStatus(sb: SB, id: string, status: string, checked = true) {
  await sb.from('flyer_sources').update({ last_status: status, ...(checked ? { last_checked_at: new Date().toISOString() } : {}) }).eq('id', id);
}

// ───────── 1) descobrir e baixar encarte novo ─────────
async function discover(sb: SB, src: any, force: boolean, report: string[]) {
  if (!force && src.last_checked_at && Date.now() - Date.parse(src.last_checked_at) < RECHECK_HOURS * 3600_000) {
    report.push(`${src.connector}: verificado há pouco, pulando`); return;
  }
  const connector = CONNECTORS[src.connector];
  if (!connector) { await setStatus(sb, src.id, 'conector_inexistente'); report.push(`${src.connector}: sem conector`); return; }

  const origin = new URL(src.page_url).origin;
  const robots = await robotsAllows(origin, [src.page_url]);
  if (!robots.ok) { await setStatus(sb, src.id, robots.why!); report.push(`${src.connector}: ${robots.why}`); return; }

  const page = await politeFetch(src.page_url, 'text/html');
  if (!page.ok) { await setStatus(sb, src.id, `pagina_http_${page.status}`); report.push(`${src.connector}: página HTTP ${page.status}`); return; }
  const found = connector.discover(await page.text(), src.page_url);
  if (!found) { await setStatus(sb, src.id, 'sem_encarte_na_pagina'); report.push(`${src.connector}: sem encarte na página`); return; }

  const robots2 = await robotsAllows(origin, [found.fileUrl]);
  if (!robots2.ok) { await setStatus(sb, src.id, robots2.why!); report.push(`${src.connector}: ${robots2.why} (arquivo)`); return; }

  const file = await politeFetch(found.fileUrl, 'application/pdf');
  if (!file.ok) { await setStatus(sb, src.id, `arquivo_http_${file.status}`); report.push(`${src.connector}: arquivo HTTP ${file.status}`); return; }
  const len = Number(file.headers.get('content-length') ?? 0);
  if (len > MAX_FILE_BYTES) { await setStatus(sb, src.id, 'arquivo_grande_demais'); return; }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_FILE_BYTES) { await setStatus(sb, src.id, 'arquivo_grande_demais'); return; }
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') { await setStatus(sb, src.id, 'arquivo_nao_e_pdf'); report.push(`${src.connector}: o download não é PDF`); return; }

  const fileSha = await sha256(bytes);
  const { data: dup } = await sb.from('flyers').select('id').eq('source_id', src.id).eq('file_sha256', fileSha).maybeSingle();
  if (dup) { await setStatus(sb, src.id, 'sem_novidade'); report.push(`${src.connector}: encarte já importado`); return; }

  const doc = await PDFDocument.load(bytes);
  const n = doc.getPageCount();
  if (n < 1 || n > MAX_PAGES) { await setStatus(sb, src.id, `paginas_fora_do_limite_${n}`); return; }

  const origPath = `${src.connector}/${fileSha}/original.pdf`;
  const up = await sb.storage.from('flyers').upload(origPath, bytes, { contentType: 'application/pdf', upsert: false });
  if (up.error && !String(up.error.message).includes('already exists')) throw new Error(`storage: ${up.error.message}`);

  const { data: flyer, error: fe } = await sb.from('flyers').insert({
    source_id: src.id, source_url: found.fileUrl, file_sha256: fileSha, storage_path: origPath,
    valid_from: found.validity?.from ?? null, valid_until: found.validity?.until ?? null, page_count: n, status: 'processing',
  }).select('id').single();
  if (fe) throw new Error(`flyers: ${fe.message}`);

  for (let i = 0; i < n; i++) {
    const one = await PDFDocument.create();
    one.setCreationDate(new Date(0)); one.setModificationDate(new Date(0)); one.setProducer(''); one.setCreator('');   // bytes determinísticos => hash estável
    const [p] = await one.copyPages(doc, [i]); one.addPage(p);
    const pb = await one.save({ useObjectStreams: false });
    const psha = await sha256(pb);
    const ppath = `${src.connector}/${fileSha}/p${i + 1}.pdf`;
    const u = await sb.storage.from('flyers').upload(ppath, pb, { contentType: 'application/pdf', upsert: true });
    if (u.error) throw new Error(`storage página ${i + 1}: ${u.error.message}`);
    const { width, height } = p.getSize();
    await sb.from('flyer_pages').insert({ flyer_id: flyer.id, page_no: i + 1, image_sha256: psha, storage_path: ppath, width: Math.round(width), height: Math.round(height) });
  }
  await setStatus(sb, src.id, `novo_encarte_${n}_paginas`);
  report.push(`${src.connector}: novo encarte com ${n} páginas${found.validity ? ` (válido ${found.validity.from} a ${found.validity.until})` : ' (validade não lida)'}`);
}

// ───────── 2) ler páginas pendentes com IA de visão ─────────
async function callVision(pdfBytes: Uint8Array): Promise<PageResult | { retry: string } | { fatal: string }> {
  const key = Deno.env.get('ANTHROPIC_API_KEY')!;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(buildRequest(encodeBase64(pdfBytes), Deno.env.get('VISION_MODEL') ?? DEFAULT_MODEL)),
    signal: AbortSignal.timeout(120_000),
  }).catch((e) => ({ networkError: String(e) }) as any);
  if ('networkError' in res) return { retry: res.networkError };
  if (res.status === 429 || res.status >= 500) return { retry: `HTTP ${res.status}` };
  if (!res.ok) return { fatal: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
  try { return parseToolUse(await res.json()); } catch (e) { return { fatal: String((e as Error).message) }; }
}

async function processPending(sb: SB, report: string[]) {
  if (!Deno.env.get('ANTHROPIC_API_KEY')) {
    const { count } = await sb.from('flyer_pages').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    if (count) report.push(`${count} página(s) aguardando leitura: falta configurar ANTHROPIC_API_KEY`);
    return;
  }
  const { data: pages } = await sb.from('flyer_pages')
    .select('id, page_no, image_sha256, storage_path, flyer_id, flyers!inner(id, status, valid_from, valid_until, flyer_sources!inner(chain_id))')
    .eq('status', 'pending').eq('flyers.status', 'processing').order('flyer_id').order('page_no').limit(PAGES_PER_RUN);
  if (!pages?.length) return;

  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const { count: usedToday } = await sb.from('vision_cache').select('image_sha256', { count: 'exact', head: true }).gte('created_at', since.toISOString());
  let budget = MAX_VISION_CALLS_PER_DAY - (usedToday ?? 0);

  for (const pg of pages) {
    const flyer = pg.flyers;
    let result: PageResult | null = null;
    const { data: cached } = await sb.from('vision_cache').select('result').eq('image_sha256', pg.image_sha256).eq('prompt_version', PROMPT_VERSION).maybeSingle();
    if (cached) { result = cached.result as PageResult; report.push(`página ${pg.page_no}: resultado em cache (sem custo)`); }
    else {
      if (budget <= 0) { report.push('teto diário de leituras por IA atingido; retoma amanhã'); break; }
      const dl = await sb.storage.from('flyers').download(pg.storage_path);
      if (dl.error) { await sb.from('flyer_pages').update({ status: 'failed', error: `storage: ${dl.error.message}` }).eq('id', pg.id); continue; }
      const out = await callVision(new Uint8Array(await dl.data.arrayBuffer()));
      budget--;
      if ('retry' in out) { report.push(`página ${pg.page_no}: falha temporária (${out.retry}); tenta de novo depois`); continue; }
      if ('fatal' in out) { await sb.from('flyer_pages').update({ status: 'failed', error: out.fatal }).eq('id', pg.id); report.push(`página ${pg.page_no}: erro (${out.fatal})`); continue; }
      result = out;
      await sb.from('vision_cache').upsert({ image_sha256: pg.image_sha256, prompt_version: PROMPT_VERSION, model: Deno.env.get('VISION_MODEL') ?? DEFAULT_MODEL, result });
    }

    const pageValidity = result!.pageValidityText ? parseValidityText(result!.pageValidityText) : null;
    const ctx = { flyerValidFrom: pageValidity?.from ?? flyer.valid_from, flyerValidUntil: pageValidity?.until ?? flyer.valid_until, today: todayISO() };
    let ok = 0, review = 0;
    for (const raw of result!.offers) {
      const v = validateOffer(raw, ctx);
      const fp = await sha256(fingerprintKey(flyer.flyer_sources.chain_id, v));
      const { error } = await sb.from('flyer_offers').upsert({
        flyer_id: pg.flyer_id, page_id: pg.id, chain_id: flyer.flyer_sources.chain_id, fingerprint: fp,
        name: v.name, brand: v.brand, pack_qty: v.pack_qty, unit: v.unit, price_cents: v.price_cents,
        unit_price_cents: v.unit_price_cents, unit_price_unit: v.unit_price_unit,
        promo_min_qty: v.promo_min_qty, promo_unit_price_cents: v.promo_unit_price_cents,
        loyalty_required: v.loyalty_required, conditions: v.conditions, valid_from: v.valid_from, valid_until: v.valid_until,
        store_scope: v.store_scope, bbox: v.bbox, raw_text: v.raw_text, confidence: v.confidence,
        review_status: v.review_status, issues: [...v.issues, ...v.warnings.map((w) => `aviso:${w}`)],
      }, { onConflict: 'fingerprint', ignoreDuplicates: true });
      if (error) { report.push(`página ${pg.page_no}: oferta recusada pelo banco (${error.message})`); continue; }
      v.review_status === 'auto_ok' ? ok++ : review++;
    }
    await sb.from('flyer_pages').update({ status: 'done', error: null }).eq('id', pg.id);
    report.push(`página ${pg.page_no}: ${ok} ofertas confiáveis, ${review} para revisão`);
  }

  // fecha encartes sem páginas pendentes
  const ids = [...new Set(pages.map((p: any) => p.flyer_id))];
  for (const id of ids) {
    const { count: pend } = await sb.from('flyer_pages').select('id', { count: 'exact', head: true }).eq('flyer_id', id).eq('status', 'pending');
    if (pend === 0) {
      const { count: failed } = await sb.from('flyer_pages').select('id', { count: 'exact', head: true }).eq('flyer_id', id).eq('status', 'failed');
      await sb.from('flyers').update({ status: 'processed', error: failed ? `${failed} página(s) falharam` : null }).eq('id', id);
      report.push(`encarte ${id.slice(0, 8)} concluído${failed ? ` (${failed} página(s) com falha)` : ''}`);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'use POST' }, 405);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const who = await authorize(req, sb);
  if (!who) return json({ error: 'não autorizado' }, 401);

  const body = await req.json().catch(() => ({}));
  const report: string[] = [];
  try {
    let q = sb.from('flyer_sources').select('*').eq('enabled', true);       // TRAVA: só fontes autorizadas
    if (typeof body.connector === 'string') q = q.eq('connector', body.connector);
    const { data: sources } = await q;
    if (!sources?.length) report.push('nenhuma fonte habilitada (flyer_sources.enabled = false)');
    for (const s of sources ?? []) {
      try { await discover(sb, s, body.force === true && who === 'curator', report); }
      catch (e) { await setStatus(sb, s.id, `erro: ${(e as Error).message}`.slice(0, 200)); report.push(`${s.connector}: erro ${(e as Error).message}`); }
    }
    await processPending(sb, report);
    const { data: expired } = await sb.rpc('expire_offers');
    if (expired) report.push(`${expired} oferta(s) vencida(s) marcadas como expiradas`);
    return json({ ok: true, report });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message, report }, 500);
  }
});
