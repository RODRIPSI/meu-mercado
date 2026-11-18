// Edge Function: lê lista de compras em PDF/foto com IA de visão (a chave fica só aqui, nunca no app).
// Texto colado e .docx são lidos no próprio app (sem IA). Exige usuário logado (verify_jwt) que pertença a uma casa.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { decodeBase64 } from 'jsr:@std/encoding@1/base64';
import { buildListRequest, LIST_PROMPT_VERSION, parseListToolUse } from '../_shared/listvision.ts';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PER_DAY = Number(Deno.env.get('MAX_LIST_IMPORTS_PER_DAY') ?? 20);
const MODEL = Deno.env.get('VISION_MODEL') ?? 'claude-sonnet-5-5';
const MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
const sha256 = async (d: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', d))].map((b) => b.toString(16).padStart(2, '0')).join('');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const { data: u } = jwt ? await sb.auth.getUser(jwt) : { data: null };
  if (!u?.user) return json({ error: 'Entre na sua conta para importar listas.' }, 401);
  const { data: mem } = await sb.from('house_members').select('house_id').eq('user_id', u.user.id).limit(1);
  if (!mem?.length) return json({ error: 'Entre em uma casa antes de importar listas.' }, 403);

  let body: { file_base64?: string; mime?: string };
  try { body = await req.json(); } catch { return json({ error: 'pedido inválido' }, 400); }
  if (!body.file_base64 || !body.mime || !MIMES.includes(body.mime)) return json({ error: 'Formato não aceito aqui. Use PDF, JPG ou PNG.' }, 415);
  let bytes: Uint8Array;
  try { bytes = decodeBase64(body.file_base64); } catch { return json({ error: 'Arquivo corrompido.' }, 400); }
  if (bytes.length > MAX_BYTES) return json({ error: 'Arquivo grande demais (máximo 8 MB).' }, 413);
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 5));
  const okMagic = body.mime === 'application/pdf' ? head.startsWith('%PDF-') : body.mime === 'image/png' ? bytes[0] === 0x89 && bytes[1] === 0x50 : bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!okMagic) return json({ error: 'O arquivo não corresponde ao formato informado.' }, 415);

  const hash = await sha256(bytes);
  const { data: cached } = await sb.from('vision_cache').select('result').eq('image_sha256', hash).eq('prompt_version', LIST_PROMPT_VERSION).maybeSingle();
  if (cached?.result) return json({ items: cached.result, cached: true });

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'A leitura de PDF e foto ainda não foi ativada no servidor (falta a chave da IA). Cole o texto da lista ou use um arquivo Word.', code: 'no_key' }, 503);
  const { data: allowed } = await sb.rpc('consume_import_quota', { p_user: u.user.id, p_max: MAX_PER_DAY });
  if (allowed !== true) return json({ error: `Limite diário de ${MAX_PER_DAY} leituras atingido. Tente amanhã ou cole o texto.`, code: 'quota' }, 429);

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(90_000),
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(buildListRequest(body.file_base64, body.mime, MODEL)),
    });
    if (!r.ok) return json({ error: 'A leitura por IA falhou. Tente de novo ou cole o texto.', code: 'model_error' }, 502);
    const items = parseListToolUse(await r.json());
    await sb.from('vision_cache').upsert({ image_sha256: hash, prompt_version: LIST_PROMPT_VERSION, model: MODEL, result: items });
    return json({ items, cached: false });
  } catch {
    return json({ error: 'Não consegui ler este arquivo. Tente uma foto mais nítida ou cole o texto.', code: 'parse_error' }, 502);
  }
});
