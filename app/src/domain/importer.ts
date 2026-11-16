import { parseBRLToCents } from './money';
import type { Product, Store, Unit } from './types';

export interface ImportRow { line: number; name: string; brand: string | null; packQty: number; unit: Unit; storeName: string; priceCents: number; isPromo: boolean; validUntil: string | null; conditions: string | null }
export interface ImportError { line: number; message: string }
const UNITS: Unit[] = ['un', 'kg', 'g', 'l', 'ml'];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function splitLine(line: string, d: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q; else if (ch === d && !q) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out.map((c) => c.trim());
}
function parseDate(s: string): string | null {
  const t = s.trim(); if (!t) return null;
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const [y, m, d] = br ? [br[3], br[2], br[1]] : iso ? [iso[1], iso[2], iso[3]] : [];
  if (!y) return 'ERR';
  const dt = new Date(`${y}-${m}-${d}T23:59:59`);
  return Number.isNaN(+dt) ? 'ERR' : `${y}-${m}-${d}T23:59:59-03:00`;
}

/** Interpreta CSV colado/importado. Linhas inválidas viram erros (nunca preços inventados nem zero). */
export function parseImport(text: string): { rows: ImportRow[]; errors: ImportError[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], errors: [{ line: 0, message: 'Arquivo vazio.' }] };
  const d = [';', '\t', ','].find((c) => lines[0].includes(c)) ?? ';';
  const head = splitLine(lines[0], d).map(norm);
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const idx = { name: col('produto', 'nome'), brand: col('marca'), qty: col('embalagem', 'quantidade'), unit: col('unidade'), store: col('mercado', 'filial'), price: col('preco', 'preço'), promo: col('promo', 'promocao'), until: col('validade'), cond: col('condicoes', 'condicao') };
  const missing = (['name', 'qty', 'unit', 'store', 'price'] as const).filter((k) => idx[k] < 0);
  if (missing.length) return { rows: [], errors: [{ line: 1, message: `Colunas obrigatórias ausentes: ${missing.join(', ')}. Use: produto;marca;embalagem;unidade;mercado;preco;promo;validade;condicoes` }] };
  const rows: ImportRow[] = []; const errors: ImportError[] = [];
  lines.slice(1).forEach((l, i) => {
    const line = i + 2; const c = splitLine(l, d); const get = (k: keyof typeof idx) => (idx[k] >= 0 ? c[idx[k]] ?? '' : '');
    const name = get('name'); const unit = norm(get('unit')) as Unit; const qty = Number(get('qty').replace(',', '.'));
    const price = parseBRLToCents(get('price')); const until = parseDate(get('until'));
    const err = !name ? 'produto vazio' : !UNITS.includes(unit) ? `unidade inválida (${get('unit')})` : !(qty > 0) ? 'embalagem inválida'
      : !get('store') ? 'mercado vazio' : price === null ? 'preço ausente ou inválido (preço ausente não vira R$ 0)' : until === 'ERR' ? 'validade inválida (use AAAA-MM-DD ou DD/MM/AAAA)' : null;
    if (err) return errors.push({ line, message: err }) as unknown as void;
    rows.push({ line, name, brand: get('brand') || null, packQty: qty, unit, storeName: get('store'), priceCents: price!, isPromo: ['sim', 's', '1', 'true'].includes(norm(get('promo'))), validUntil: until, conditions: get('cond') || null });
  });
  return { rows, errors };
}

export interface Resolved { row: ImportRow; productId: string | null; storeId: string | null; problem?: string }
export function resolveImport(rows: ImportRow[], products: Product[], stores: Store[]): Resolved[] {
  return rows.map((row) => {
    const p = products.find((x) => norm(x.name) === norm(row.name) && norm(x.brand ?? '') === norm(row.brand ?? '') && x.packQty === row.packQty && x.unit === row.unit);
    const s = stores.find((x) => norm(x.name) === norm(row.storeName));
    return { row, productId: p?.id ?? null, storeId: s?.id ?? null, problem: s ? undefined : `Filial "${row.storeName}" não cadastrada` };
  });
}
