// Leitura determinística de listas de compras (texto colado, .docx, texto extraído de PDF/foto).
// Nunca inventa dados: o que não é reconhecido fica com recognized=false e o texto original preservado.
import type { Unit } from './types';

export interface ParsedItem {
  name: string;
  qty: number;
  unit: Unit;
  brand: string | null;
  notes: string | null;
  categoryHint: string | null;   // nome do cabeçalho da lista, se houver
  sourceText: string;            // linha original, sempre preservada
  recognized: boolean;           // false = precisa de revisão
  ambiguousQty: boolean;         // ex.: "2 a 3 kg"
}

const UNIT_ALIASES: Record<string, { unit: Unit; mult: number; note?: string }> = {
  un: { unit: 'un', mult: 1 }, und: { unit: 'un', mult: 1 }, unid: { unit: 'un', mult: 1 }, unidade: { unit: 'un', mult: 1 }, unidades: { unit: 'un', mult: 1 },
  pc: { unit: 'un', mult: 1 }, pct: { unit: 'un', mult: 1 }, pacote: { unit: 'un', mult: 1 }, pacotes: { unit: 'un', mult: 1 },
  cx: { unit: 'un', mult: 1 }, caixa: { unit: 'un', mult: 1 }, caixas: { unit: 'un', mult: 1 },
  lata: { unit: 'un', mult: 1 }, latas: { unit: 'un', mult: 1 }, garrafa: { unit: 'un', mult: 1 }, garrafas: { unit: 'un', mult: 1 },
  saco: { unit: 'un', mult: 1 }, sacos: { unit: 'un', mult: 1 }, pote: { unit: 'un', mult: 1 }, potes: { unit: 'un', mult: 1 },
  barra: { unit: 'un', mult: 1 }, barras: { unit: 'un', mult: 1 }, maco: { unit: 'un', mult: 1 }, maço: { unit: 'un', mult: 1 },
  kg: { unit: 'kg', mult: 1 }, kgs: { unit: 'kg', mult: 1 }, quilo: { unit: 'kg', mult: 1 }, quilos: { unit: 'kg', mult: 1 }, kilo: { unit: 'kg', mult: 1 }, kilos: { unit: 'kg', mult: 1 },
  g: { unit: 'g', mult: 1 }, gr: { unit: 'g', mult: 1 }, grama: { unit: 'g', mult: 1 }, gramas: { unit: 'g', mult: 1 },
  l: { unit: 'l', mult: 1 }, lt: { unit: 'l', mult: 1 }, litro: { unit: 'l', mult: 1 }, litros: { unit: 'l', mult: 1 },
  ml: { unit: 'ml', mult: 1 },
  duzia: { unit: 'un', mult: 12, note: 'dúzia' }, dúzia: { unit: 'un', mult: 12, note: 'dúzia' },
  duzias: { unit: 'un', mult: 12, note: 'dúzia' }, dúzias: { unit: 'un', mult: 12, note: 'dúzia' },
};

const BULLET = /^\s*(?:[-*•·▪◦●■□☐☑✓✔]|\[[ xX]?\]|\d{1,3}[.)\-])\s+/;
const NUM = '(\\d+(?:[.,]\\d+)?|\\d+\\s*\\/\\s*\\d+)';

function num(s: string): number {
  const t = s.replace(/\s/g, '');
  if (t.includes('/')) { const [a, b] = t.split('/').map(Number); return b ? a / b : NaN; }
  return Number(t.replace(',', '.'));
}
function unitOf(word: string) { return UNIT_ALIASES[word.toLowerCase().replace(/\.$/, '')]; }
const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s,;:\-–]+|[\s,;:\-–]+$/g, '');

/** Linha que parece cabeçalho de seção (ex.: "HORTIFRUTI:" ou "# Limpeza"). */
export function isHeader(line: string): string | null {
  const t = line.trim();
  if (!t) return null;
  const md = t.match(/^#{1,4}\s+(.+)$/);
  if (md) return clean(md[1].replace(/:$/, ''));
  const colon = t.match(/^([^\d:,][^:]{1,40}):$/);
  if (colon && !BULLET.test(t)) return clean(colon[1]);
  if (t.length <= 30 && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ\s\/&]+$/.test(t) && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3}/.test(t)) return clean(t);
  return null;
}

export function parseLine(raw: string, categoryHint: string | null = null): ParsedItem | null {
  const sourceText = raw.trim();
  if (!sourceText) return null;
  let t = sourceText.replace(BULLET, '');
  // tabela: separa colunas por tab ou |
  const cols = t.split(/\t|\|/).map(clean).filter(Boolean);
  if (cols.length > 1) t = cols.join(' ');
  // observações entre parênteses
  const notesParts: string[] = [];
  t = t.replace(/\(([^)]*)\)/g, (_, n) => { if (clean(n)) notesParts.push(clean(n)); return ' '; });
  t = clean(t);
  if (!t) return null;

  let qty = 1, unit: Unit = 'un', ambiguous = false, found = false, name = t;
  let unitNote: string | null = null;
  const take = (u: { unit: Unit; mult: number; note?: string }, q: number) => { qty = q * u.mult; unit = u.unit; if (u.note) unitNote = `${q} ${u.note}`; };

  // faixa: "2 a 3 kg arroz" / "2-3 kg"
  let m = t.match(new RegExp(`^${NUM}\\s*(?:a|à|-|–|ou)\\s*${NUM}\\s*([a-zA-ZÀ-ÿ]+)?\\s+(?:de\\s+)?(.+)$`, 'i'));
  if (m && !Number.isNaN(num(m[1]))) {
    const u = m[3] ? unitOf(m[3]) : undefined;
    qty = num(m[2]); unit = u?.unit ?? 'un'; ambiguous = true; found = true;
    name = u || !m[3] ? m[4] : `${m[3]} ${m[4]}`;
    notesParts.push(`quantidade informada: ${m[1]} a ${m[2]}`);
  }
  // início: "2 kg arroz", "3 pacotes de macarrão", "2 arroz", "2x arroz"
  if (!found) {
    m = t.match(new RegExp(`^${NUM}\\s*(?:x\\s*)?([a-zA-ZÀ-ÿ]+)?\\s+(?:de\\s+)?(.+)$`, 'i'));
    if (m && !Number.isNaN(num(m[1]))) {
      const u = m[2] ? unitOf(m[2]) : undefined;
      if (u) { take(u, num(m[1])); name = m[3]; found = true; }
      else if (m[2]) { qty = num(m[1]); name = `${m[2]} ${m[3]}`; found = true; }
      else { qty = num(m[1]); name = m[3]; found = true; }
    }
  }
  // fim: "arroz 5kg", "arroz - 2 un", "leite x3", "arroz 5 kg"
  if (!found) {
    m = t.match(new RegExp(`^(.+?)[\\s:,\\-–]*(?:x\\s*)?${NUM}\\s*([a-zA-ZÀ-ÿ]+)?$`, 'i'));
    if (m && !Number.isNaN(num(m[2]))) {
      const u = m[3] ? unitOf(m[3]) : undefined;
      if (u) { take(u, num(m[2])); name = m[1]; found = true; }
      else if (!m[3] && /x\s*\d/i.test(t.slice(m[1].length))) { qty = num(m[2]); name = m[1]; found = true; }
    }
  }
  name = clean(name);
  if (unitNote) notesParts.push(unitNote);

  // marca: "Arroz Tio João" não é separável com segurança; só aceita "marca X" / "da marca X" / "- marca X"
  let brand: string | null = null;
  const bm = name.match(/\s+(?:da\s+)?marca\s+(.+)$/i);
  if (bm) { brand = clean(bm[1]); name = clean(name.slice(0, bm.index)); }

  const recognized = name.length >= 2 && /[a-zA-ZÀ-ÿ]{2}/.test(name) && !Number.isNaN(qty) && qty > 0;
  if (!recognized) {
    return { name: sourceText, qty: 1, unit: 'un', brand: null, notes: null, categoryHint, sourceText, recognized: false, ambiguousQty: false };
  }
  return { name, qty, unit, brand, notes: notesParts.length ? notesParts.join('; ') : null, categoryHint, sourceText, recognized: true, ambiguousQty: ambiguous };
}

export function parseListText(text: string): ParsedItem[] {
  const out: ParsedItem[] = [];
  let hint: string | null = null;
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (!line.trim()) continue;
    const h = isHeader(line);
    if (h) { hint = h; continue; }
    const it = parseLine(line, hint);
    if (it) out.push(it);
  }
  return out;
}

/* ---------- categorias ---------- */
export const CATEGORY_NAMES = ['Hortifruti', 'Açougue e peixes', 'Laticínios e frios', 'Padaria', 'Mercearia', 'Grãos e cereais', 'Bebidas', 'Congelados', 'Limpeza', 'Higiene e beleza', 'Pet', 'Outros'] as const;
export type CategoryName = typeof CATEGORY_NAMES[number];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const RULES: [CategoryName, string[]][] = [
  ['Limpeza', ['detergente', 'sabao', 'amaciante', 'desinfetante', 'agua sanitaria', 'alvejante', 'esponja', 'limpa ', 'multiuso', 'saco de lixo', 'papel aluminio', 'lava roupa', 'lava-roupa', 'cloro', 'vassoura', 'pano de chao']],
  ['Higiene e beleza', ['shampoo', 'condicionador', 'sabonete', 'creme dental', 'pasta de dente', 'escova de dente', 'papel higienico', 'desodorante', 'absorvente', 'fralda', 'fio dental', 'enxaguante', 'hidratante', 'cotonete', 'lenco umedecido']],
  ['Pet', ['racao', 'areia de gato', 'sache pet', 'petisco']],
  ['Bebidas', ['refrigerante', 'suco', 'agua mineral', 'agua com gas', 'cerveja', 'vinho', 'cafe', 'cha ', 'energetico', 'isotonico', 'guarana', 'coca', 'vodka', 'whisky']],
  ['Congelados', ['congelad', 'sorvete', 'pizza', 'lasanha', 'hamburguer', 'nuggets', 'polpa']],
  ['Açougue e peixes', ['carne', 'frango', 'peito de frango', 'coxa', 'linguica', 'bife', 'acem', 'patinho', 'alcatra', 'file', 'peixe', 'tilapia', 'camarao', 'salmao', 'costela', 'moida', 'picanha', 'bacon', 'sardinha fresca']],
  ['Laticínios e frios', ['leite', 'queijo', 'iogurte', 'manteiga', 'margarina', 'requeijao', 'presunto', 'mussarela', 'muçarela', 'creme de leite', 'leite condensado', 'ovo', 'ovos', 'nata', 'cream cheese', 'peito de peru', 'salame', 'mortadela']],
  ['Padaria', ['pao', 'paes', 'bolo', 'torrada', 'bisnaguinha', 'biscoito', 'bolacha', 'croissant']],
  ['Grãos e cereais', ['arroz', 'feijao', 'lentilha', 'grao de bico', 'aveia', 'granola', 'milho', 'quinoa', 'ervilha seca', 'cereal']],
  ['Hortifruti', ['banana', 'maca', 'laranja', 'limao', 'tomate', 'cebola', 'alho', 'batata', 'cenoura', 'alface', 'couve', 'abobrinha', 'pepino', 'mamao', 'melancia', 'abacaxi', 'uva', 'morango', 'manga', 'abacate', 'pimentao', 'brocolis', 'espinafre', 'cheiro verde', 'salsa', 'cebolinha', 'coentro', 'mandioca', 'aipim', 'inhame', 'chuchu', 'repolho', 'beterraba', 'fruta', 'verdura', 'legume', 'pera', 'melao', 'gengibre']],
  ['Mercearia', ['macarrao', 'espaguete', 'massa', 'molho', 'extrato de tomate', 'oleo', 'azeite', 'sal ', 'acucar', 'farinha', 'fuba', 'tempero', 'vinagre', 'maionese', 'ketchup', 'mostarda', 'atum', 'sardinha', 'milho verde', 'chocolate', 'achocolatado', 'geleia', 'fermento', 'bolacha', 'mistura para bolo', 'sopa', 'cafe soluvel']],
];

const COMPILED: [CategoryName, RegExp[]][] = RULES.map(([c, ws]) => [c, ws.map((w) => new RegExp(`(^| )${norm(w).trim().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')}(s|es)?( |$)`))]);

/** Sugere a categoria pelo nome (ou cabeçalho). Sem pista clara → 'Outros'. */
export function categorize(name: string, hint: string | null = null): CategoryName {
  const n = norm(name).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [cat, res] of COMPILED) if (res.some((re) => re.test(n))) return cat;
  if (hint) {
    const h = norm(hint);
    const direct = CATEGORY_NAMES.find((c) => norm(c) === h || h.includes(norm(c).split(' ')[0]));
    if (direct) return direct;
    if (/hortifruti|feira|frutas|verduras|legumes/.test(h)) return 'Hortifruti';
    if (/carne|acougue|peixe/.test(h)) return 'Açougue e peixes';
    if (/laticin|frios|laticinios/.test(h)) return 'Laticínios e frios';
    if (/limpeza|casa/.test(h)) return 'Limpeza';
    if (/higiene|beleza|banho/.test(h)) return 'Higiene e beleza';
    if (/mercearia|despensa|secos/.test(h)) return 'Mercearia';
    if (/bebida/.test(h)) return 'Bebidas';
  }
  return 'Outros';
}

/* ---------- duplicados ---------- */
export interface DupGroup { key: string; indexes: number[]; canSum: boolean }
const dupKey = (name: string) => norm(name).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/** Agrupa itens com o mesmo nome. Só oferece "somar" quando nome + unidade + marca são idênticos e nada é ambíguo. */
export function findDuplicates(items: Pick<ParsedItem, 'name' | 'unit' | 'brand' | 'ambiguousQty' | 'recognized'>[]): DupGroup[] {
  const map = new Map<string, number[]>();
  items.forEach((it, i) => { if (!it.recognized) return; const k = dupKey(it.name); map.set(k, [...(map.get(k) ?? []), i]); });
  const out: DupGroup[] = [];
  for (const [key, idx] of map) {
    if (idx.length < 2) continue;
    const first = items[idx[0]];
    const same = idx.every((i) => items[i].unit === first.unit && (items[i].brand ?? '') === (first.brand ?? '') && !items[i].ambiguousQty);
    out.push({ key, indexes: idx, canSum: same });
  }
  return out;
}

/** Itens já existentes na lista de destino com o mesmo nome (para avisar ao acrescentar). */
export function matchExisting(items: { name: string }[], existing: { id: string; name: string }[]): Map<number, string> {
  const m = new Map<number, string>();
  const idx = new Map(existing.map((e) => [dupKey(e.name), e.id]));
  items.forEach((it, i) => { const id = idx.get(dupKey(it.name)); if (id) m.set(i, id); });
  return m;
}

/* ---------- .docx ---------- */
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');

/** Converte word/document.xml em texto: um parágrafo por linha; células de tabela separadas por tab. */
export function docxXmlToText(xml: string): string {
  const flat = xml.replace(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g, (tc) => tc.replace(/<\/w:p>/g, ' '));
  const rows = flat.replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:tc>/g, '\t').replace(/<\/w:tr>/g, '\n').replace(/<\/w:p>/g, '\n');
  return decode(rows.replace(/<[^>]+>/g, ''))
    .split('\n').map((l) => l.replace(/\t+$/g, '').replace(/[ \u00a0]+/g, ' ').replace(/ ?\t ?/g, '\t').trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------- base64 (sem depender de btoa/Buffer) ---------- */
export function bytesToBase64(bytes: Uint8Array): string {
  const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += T[a >> 2] + T[((a & 3) << 4) | ((b ?? 0) >> 4)] + (b === undefined ? '=' : T[((b & 15) << 2) | ((c ?? 0) >> 6)]) + (c === undefined ? '=' : T[c & 63]);
  }
  return out;
}

/* ---------- status, custo e economia ---------- */
export type ListStatus = 'planejada' | 'em_andamento' | 'concluida';
export function listStatus(items: { status: 'pending' | 'bought' | 'skipped' }[]): ListStatus {
  const active = items.filter((i) => i.status !== 'skipped');
  if (!active.length) return 'planejada';
  const bought = active.filter((i) => i.status === 'bought').length;
  if (bought === 0) return 'planejada';
  return bought === active.length ? 'concluida' : 'em_andamento';
}
export const STATUS_LABEL: Record<ListStatus, string> = { planejada: 'Planejada', em_andamento: 'Em andamento', concluida: 'Concluída' };

export function progress(items: { status: 'pending' | 'bought' | 'skipped' }[]) {
  const active = items.filter((i) => i.status !== 'skipped');
  const bought = active.filter((i) => i.status === 'bought').length;
  return { total: active.length, bought, pct: active.length ? Math.round((bought / active.length) * 100) : 0 };
}

/** Estimativa só com itens de preço conhecido; ausência de preço nunca vira zero. */
export function estimateListCost(lines: { cents: number | null }[]): { totalCents: number | null; known: number; unknown: number } {
  let total = 0, known = 0;
  for (const l of lines) if (l.cents != null && l.cents > 0) { total += l.cents; known++; }
  return { totalCents: known ? total : null, known, unknown: lines.length - known };
}

/** Economia POTENCIAL: maior − menor preço entre lojas, só para itens com ≥2 preços conhecidos. Não é desconto garantido. */
export function potentialSavings(perItem: { qtyPacks: number; storeCents: (number | null)[] }[]): { cents: number; items: number } {
  let cents = 0, items = 0;
  for (const it of perItem) {
    const known = it.storeCents.filter((c): c is number => c != null && c > 0);
    if (known.length < 2) continue;
    const diff = (Math.max(...known) - Math.min(...known)) * it.qtyPacks;
    if (diff > 0) { cents += Math.round(diff); items++; }
  }
  return { cents, items };
}
