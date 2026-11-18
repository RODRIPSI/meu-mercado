import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import JSZip from 'jszip';
import { Badge, Button, Card, Chip, Field, Notice, Row, Screen, Segmented, T } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';
import { useHouse } from '@/features/house';
import { useCatalog } from '@/features/catalog';
import { bytesToBase64, categorize, CATEGORY_NAMES, docxXmlToText, findDuplicates, matchExisting, parseListText, type ParsedItem } from '@/domain/listparse';
import { useTheme } from '@/theme';

type Row_ = ParsedItem & { cat: string; keep: boolean; bought?: boolean };
const UNITS = ['un', 'kg', 'g', 'l', 'ml'] as const;
const MAX_BYTES = 8 * 1024 * 1024;

export default function ImportarLista() {
  const { house } = useHouse(); const router = useRouter(); const { colors } = useTheme(); const { categories } = useCatalog();
  const [mode, setMode] = useState<'texto' | 'arquivo'>('texto');
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [info, setInfo] = useState('');
  const [rows, setRows] = useState<Row_[] | null>(null); const [original, setOriginal] = useState('');
  const [dest, setDest] = useState<'nova' | 'existente'>('nova'); const [newName, setNewName] = useState('');
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]); const [listId, setListId] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState<number | null>(null); const [saving, setSaving] = useState(false);

  const toRows = (items: (ParsedItem & { bought?: boolean })[]): Row_[] => items.map((i) => ({ ...i, cat: categorize(i.name, i.categoryHint), keep: true }));
  const fromText = (t: string) => { setOriginal(t); const r = toRows(parseListText(t)); setRows(r); if (!r.length) setErr('Não encontrei itens neste texto. Escreva um item por linha.'); loadLists(); };
  const loadLists = async () => {
    const { data } = await supabase.from('shopping_lists').select('id, name').eq('house_id', house!.id).eq('status', 'active').order('updated_at', { ascending: false });
    setLists(data ?? []);
  };
  const pickExisting = async (id: string) => {
    setListId(id);
    const { data } = await supabase.from('list_items').select('id, name').eq('list_id', id).eq('status', 'pending');
    setExisting(data ?? []);
  };

  const readFile = async () => {
    setErr(''); setInfo('');
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'text/plain'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0]; const name = (a.name ?? '').toLowerCase(); const mime = a.mimeType ?? '';
    if (a.size && a.size > MAX_BYTES) return setErr('Arquivo grande demais (máximo 8 MB).');
    setBusy(true);
    try {
      const bytes = new Uint8Array(await (await fetch(a.uri)).arrayBuffer());
      if (bytes.length > MAX_BYTES) return setErr('Arquivo grande demais (máximo 8 MB).');
      if (name.endsWith('.docx') || mime.includes('wordprocessingml')) {
        let xml: string | undefined;
        try { xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml')?.async('string'); } catch { /* arquivo inválido */ }
        if (!xml) return setErr('Não consegui abrir este arquivo Word. Ele pode estar corrompido ou protegido por senha. Cole o texto da lista.');
        const t = docxXmlToText(xml); if (!t.trim()) return setErr('O documento Word está vazio.');
        setText(t); return fromText(t);
      }
      if (name.endsWith('.doc')) return setErr('Arquivos .doc antigos não são lidos. Salve como .docx ou cole o texto.');
      if (mime === 'text/plain' || name.endsWith('.txt')) { const t = new TextDecoder().decode(bytes); setText(t); return fromText(t); }
      const type = name.endsWith('.pdf') || mime === 'application/pdf' ? 'application/pdf' : name.endsWith('.png') || mime === 'image/png' ? 'image/png' : name.match(/\.jpe?g$/) || mime === 'image/jpeg' ? 'image/jpeg' : null;
      if (!type) return setErr('Formato não aceito. Use PDF, Word (.docx), JPG, PNG ou cole o texto.');
      const { data, error } = await supabase.functions.invoke('parse-list', { body: { file_base64: bytesToBase64(bytes), mime: type } });
      if (error) {
        let msg = 'Não consegui ler este arquivo agora. Cole o texto da lista.';
        try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch { /* mantém padrão */ }
        return setErr(msg);
      }
      const items = (data?.items ?? []) as any[];
      if (!items.length) return setErr('Não encontrei uma lista de compras neste arquivo. Tente uma foto mais nítida ou cole o texto.');
      setOriginal(items.map((i) => i.sourceText).join('\n'));
      setRows(toRows(items.map((i) => ({ ...i, categoryHint: i.categoryHint ?? null, ambiguousQty: false }))));
      setInfo(data?.cached ? 'Leitura reaproveitada (arquivo já lido antes).' : 'Leitura por IA — confira os itens antes de salvar.'); loadLists();
    } catch { setErr('Não consegui processar o arquivo. Tente de novo ou cole o texto.'); } finally { setBusy(false); }
  };

  const update = (i: number, p: Partial<Row_>) => setRows((r) => r!.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const dups = useMemo(() => (rows ? findDuplicates(rows.filter((r) => r.keep)) : []), [rows]);
  const kept = rows?.filter((r) => r.keep) ?? [];
  const dupIdx = useMemo(() => { const keptIdx = rows?.map((r, i) => (r.keep ? i : -1)).filter((i) => i >= 0) ?? []; const s = new Set<number>(); dups.forEach((g) => g.indexes.forEach((k) => s.add(keptIdx[k]))); return s; }, [dups, rows]);
  const inList = useMemo(() => (rows && dest === 'existente' ? matchExisting(rows, existing) : new Map<number, string>()), [rows, existing, dest]);

  const sumGroup = (g: { indexes: number[] }) => {
    const keptIdx = rows!.map((r, i) => (r.keep ? i : -1)).filter((i) => i >= 0); const real = g.indexes.map((k) => keptIdx[k]);
    const total = real.reduce((a, i) => a + rows![i].qty, 0);
    setRows((r) => r!.map((x, i) => (i === real[0] ? { ...x, qty: total } : real.includes(i) ? { ...x, keep: false } : x)));
  };

  const canSave = kept.length > 0 && (dest === 'nova' ? !!newName.trim() : !!listId) && !saving;
  const save = async () => {
    setSaving(true); setErr('');
    try {
      let target = listId;
      if (dest === 'nova') {
        const { data, error } = await supabase.from('shopping_lists').insert({ house_id: house!.id, name: newName.trim(), kind: 'custom' }).select('id').single();
        if (error) return setErr(friendlyError(error)); target = data.id;
      }
      const { data: last } = await supabase.from('list_items').select('position').eq('list_id', target!).order('position', { ascending: false, nullsFirst: false }).limit(1);
      let pos = (last?.[0]?.position ?? 0) + 1; let skipped = 0, failed = 0;
      const catId = (n: string) => categories.find((c) => c.name === n)?.id ?? null;
      for (const r of kept) {
        const { error } = await supabase.from('list_items').insert({
          list_id: target, house_id: house!.id, name: r.name.trim(), qty: r.qty, unit: r.unit, preferred_brand: r.brand, notes: r.notes,
          category_id: catId(r.cat), position: pos++, source_text: r.sourceText, status: r.bought ? 'bought' : 'pending',
        });
        if (error) { if ((error as any).code === '23505') skipped++; else failed++; }
      }
      if (failed === kept.length) return setErr('Não consegui salvar os itens. Verifique a conexão e tente de novo.');
      router.replace(`/lista/${target}`);
      if (skipped) setInfo(`${skipped} item(ns) já estavam na lista e foram ignorados.`);
    } finally { setSaving(false); }
  };

  if (!rows) return (
    <Screen>
      <T variant="small">Cole o texto ou envie um arquivo. Você confere e edita tudo antes de salvar.</T>
      <Segmented value={mode} onChange={setMode} options={[{ key: 'texto', label: 'Colar texto' }, { key: 'arquivo', label: 'PDF, Word ou foto' }]} />
      {mode === 'texto' ? (
        <>
          <Field label="Sua lista" value={text} onChangeText={setText} multiline placeholder={'2 kg arroz\n3 pacotes de macarrão\nleite x6'} style={{ minHeight: 180 }} />
          <Button title="Ler lista" disabled={!text.trim()} onPress={() => { setErr(''); fromText(text); }} />
        </>
      ) : (
        <>
          <Card><T>Aceitamos PDF, Word (.docx), JPG e PNG de até 8 MB.</T><T variant="small">Word e texto são lidos no aparelho. PDF e foto usam leitura por IA no servidor (se estiver ativada).</T></Card>
          <Button title="Escolher arquivo" onPress={readFile} loading={busy} />
        </>
      )}
      {err ? <Notice tone="danger">{err}</Notice> : null}
    </Screen>
  );

  return (
    <Screen>
      <T variant="h2">Confira os itens ({kept.length} de {rows.length})</T>
      {info ? <Notice tone="ok">{info}</Notice> : null}
      {rows.some((r) => !r.recognized) ? <Notice>Linhas marcadas “revisar” não foram entendidas. O texto original foi mantido; corrija o nome ou desmarque.</Notice> : null}
      {dups.map((g) => (
        <Card key={g.key}>
          <Notice>Item repetido: “{rows[g.indexes[0]]?.name}” aparece {g.indexes.length} vezes.</Notice>
          {g.canSum ? <Button kind="secondary" small title="Somar quantidades" onPress={() => sumGroup(g)} /> : <T variant="small">Unidades ou marcas diferentes: não somei automaticamente. Ajuste ou remova a linha que não quer.</T>}
        </Card>
      ))}
      {rows.map((r, i) => (
        <Card key={i} style={{ opacity: r.keep ? 1 : 0.45 }}>
          <Row>
            <Pressable onPress={() => update(i, { keep: !r.keep })} style={{ width: 44, height: 44, justifyContent: 'center' }} accessibilityLabel={r.keep ? 'Excluir da importação' : 'Incluir na importação'}>
              <T variant="h2" color={colors.primary}>{r.keep ? '☑' : '☐'}</T>
            </Pressable>
            <Pressable style={{ flex: 1 }} onPress={() => setOpen(open === i ? null : i)}>
              <T>{r.name}</T>
              <T variant="small">{r.qty} {r.unit} · {r.cat}{r.brand ? ` · ${r.brand}` : ''}</T>
            </Pressable>
          </Row>
          <Row style={{ flexWrap: 'wrap' }}>
            {!r.recognized ? <Badge text="revisar" tone="danger" /> : null}
            {r.ambiguousQty ? <Badge text="quantidade ambígua" tone="warn" /> : null}
            {dupIdx.has(i) ? <Badge text="repetido" tone="warn" /> : null}
            {inList.has(i) ? <Badge text="já existe na lista" tone="warn" /> : null}
          </Row>
          {open === i ? (
            <View style={{ gap: 8 }}>
              <Field label="Nome" value={r.name} onChangeText={(v) => update(i, { name: v, recognized: v.trim().length >= 2 })} />
              <Row>
                <Field label="Quantidade" value={String(r.qty).replace('.', ',')} keyboardType="decimal-pad" style={{ flex: 1 }} onChangeText={(v) => { const n = Number(v.replace(',', '.')); if (!Number.isNaN(n)) update(i, { qty: n }); }} />
                <Field label="Marca" value={r.brand ?? ''} style={{ flex: 1 }} onChangeText={(v) => update(i, { brand: v || null })} />
              </Row>
              <Row style={{ flexWrap: 'wrap' }}>{UNITS.map((u) => <Chip key={u} label={u} selected={r.unit === u} onPress={() => update(i, { unit: u })} />)}</Row>
              <Field label="Observações" value={r.notes ?? ''} onChangeText={(v) => update(i, { notes: v || null })} />
              <Row style={{ flexWrap: 'wrap' }}>{CATEGORY_NAMES.map((c) => <Chip key={c} label={c} selected={r.cat === c} onPress={() => update(i, { cat: c })} />)}</Row>
              <T variant="small">Texto original: {r.sourceText}</T>
            </View>
          ) : null}
        </Card>
      ))}

      <T variant="h2">Onde salvar</T>
      <Segmented value={dest} onChange={(d) => { setDest(d); setErr(''); }} options={[{ key: 'nova', label: 'Lista nova' }, { key: 'existente', label: 'Lista existente' }]} />
      {dest === 'nova' ? <Field label="Nome da lista" value={newName} onChangeText={setNewName} placeholder="Ex.: Compras do mês" />
        : lists.length ? <Row style={{ flexWrap: 'wrap' }}>{lists.map((l) => <Chip key={l.id} label={l.name} selected={listId === l.id} onPress={() => pickExisting(l.id)} />)}</Row> : <T variant="small">Nenhuma lista ativa. Escolha “Lista nova”.</T>}
      {dest === 'existente' && inList.size ? <Notice>{inList.size} item(ns) já existem nesta lista e serão ignorados ao salvar (não somamos automaticamente).</Notice> : null}
      {err ? <Notice tone="danger">{err}</Notice> : null}
      <Button title={`Salvar ${kept.length} item(ns)`} disabled={!canSave} loading={saving} onPress={save} />
      <Button kind="ghost" title="Voltar e editar o texto" onPress={() => { setRows(null); setErr(''); }} />
    </Screen>
  );
}
