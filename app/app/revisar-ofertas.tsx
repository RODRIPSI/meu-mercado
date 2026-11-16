import React, { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { Badge, Button, Card, Empty, Field, Notice, Row, Screen, T } from '@/components/ui';
import { supabase, friendlyError } from '@/lib/supabase';
import { formatBRL, parseBRLToCents } from '@/domain/money';
import { fmtDate, issueText } from '@/lib/offers';

interface Row_ { id: string; name: string; brand: string | null; pack_qty: number | null; unit: string | null; price_cents: number | null; valid_until: string | null; conditions: string | null; raw_text: string | null; confidence: number | null; issues: string[]; bbox: any; page_id: string }

export default function Revisar() {
  const [rows, setRows] = useState<Row_[]>([]); const [err, setErr] = useState(''); const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('flyer_offers').select('id,name,brand,pack_qty,unit,price_cents,valid_until,conditions,raw_text,confidence,issues,bbox,page_id').eq('review_status', 'needs_review').order('created_at', { ascending: false }).limit(100);
    if (error) setErr(friendlyError(error)); else { setErr(''); setRows((data ?? []) as Row_[]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <Screen>
      <Notice tone="warn">Estas ofertas não passaram na validação automática. Compare com a página original antes de aprovar. Nada aqui aparece nas comparações até você aprovar.</Notice>
      {err ? <Notice tone="danger">{err}</Notice> : null}
      {rows.length === 0 ? <Empty title="Nada para revisar" /> : null}
      {rows.map((r) => <Item key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} onDone={load} />)}
    </Screen>
  );
}

function Item({ r, open, onToggle, onDone }: { r: Row_; open: boolean; onToggle: () => void; onDone: () => void }) {
  const [name, setName] = useState(r.name); const [price, setPrice] = useState(r.price_cents ? (r.price_cents / 100).toFixed(2).replace('.', ',') : '');
  const [until, setUntil] = useState(r.valid_until ?? ''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const real = r.issues.filter((i) => !i.startsWith('aviso:'));

  const openPage = async () => {
    const { data: pg } = await supabase.from('flyer_pages').select('storage_path, page_no').eq('id', r.page_id).single();
    if (!pg) return;
    const { data } = await supabase.storage.from('flyers').createSignedUrl(pg.storage_path, 600);
    if (data?.signedUrl) Linking.openURL(`${data.signedUrl}#page=1`);
  };
  const decide = async (decision: 'approve' | 'reject') => {
    setErr(''); setBusy(true);
    const fix: Record<string, unknown> = { name };
    if (price.trim()) { const c = parseBRLToCents(price); if (c == null) { setErr('Preço inválido.'); setBusy(false); return; } fix.price_cents = c; }
    if (until.trim()) { if (!/^\d{4}-\d{2}-\d{2}$/.test(until.trim())) { setErr('Validade no formato AAAA-MM-DD.'); setBusy(false); return; } fix.valid_until = until.trim(); }
    const { error } = await supabase.rpc('review_offer', { p_offer: r.id, p_decision: decision, p_fix: decision === 'approve' ? fix : {} });
    setBusy(false);
    if (error) setErr(/preço e validade/i.test(error.message) ? 'Para aprovar, informe preço e validade.' : friendlyError(error)); else onDone();
  };

  return (
    <Card onPress={onToggle}>
      <T variant="h2">{r.name}{r.brand ? ` · ${r.brand}` : ''}{r.pack_qty ? ` ${r.pack_qty}${r.unit ?? ''}` : ''}</T>
      <Row style={{ justifyContent: 'space-between' }}>
        <T>{r.price_cents ? formatBRL(r.price_cents) : 'preço não lido'} · até {fmtDate(r.valid_until)}</T>
        {r.confidence != null ? <Badge text={`confiança ${Math.round(r.confidence * 100)}%`} tone="warn" /> : null}
      </Row>
      {real.map((i) => <T key={i} variant="small" color="#c0392b">• {issueText(i)}</T>)}
      {open ? (
        <>
          {r.raw_text ? <T variant="small">Texto lido: “{r.raw_text}”</T> : null}
          {r.bbox ? <T variant="small">Posição aproximada na página: {Math.round(r.bbox.x * 100)}% da esquerda, {Math.round(r.bbox.y * 100)}% do topo.</T> : null}
          <Button title="Ver página original" kind="ghost" onPress={openPage} />
          <Field label="Nome" value={name} onChangeText={setName} />
          <Field label="Preço (R$)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="24,90" />
          <Field label="Válida até (AAAA-MM-DD)" value={until} onChangeText={setUntil} autoCapitalize="none" placeholder="2026-11-17" />
          {err ? <Notice tone="danger">{err}</Notice> : null}
          <Row>
            <Button title="Rejeitar" kind="danger" style={{ flex: 1 }} loading={busy} onPress={() => decide('reject')} />
            <Button title="Aprovar" style={{ flex: 1 }} loading={busy} onPress={() => decide('approve')} />
          </Row>
        </>
      ) : null}
    </Card>
  );
}
