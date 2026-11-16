import { describe, it, expect } from 'vitest';
import { enqueue, flushQueue, type Mutation, type Remote, type RemoteResult } from '@/domain/sync';

const t = '2026-11-15T12:00:00Z';
const upd = (id: string, v: number, patch = {}): Mutation => ({ kind: 'update', itemId: id, baseVersion: v, patch, queuedAt: t });
const ok: RemoteResult = { ok: true };
const remoteOf = (f: Partial<Remote>): Remote => ({ insert: async () => ok, update: async () => ok, remove: async () => ok, ...f });

describe('fila offline', () => {
  it('junta edições do mesmo item mantendo a versão-base mais antiga', () => {
    let q: Mutation[] = [];
    q = enqueue(q, upd('a', 3, { qty: 2 })); q = enqueue(q, upd('a', 4, { status: 'bought' }));
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ baseVersion: 3, patch: { qty: 2, status: 'bought' } });
  });
  it('apagar item criado offline cancela o insert', () => {
    let q: Mutation[] = [{ kind: 'insert', item: { clientId: 'c1', listId: 'l', name: 'Sal', qty: 1, unit: 'un' }, queuedAt: t }];
    q = enqueue(q, { kind: 'delete', itemId: 'c1', baseVersion: 0, queuedAt: t });
    expect(q).toHaveLength(0);
  });
  it('envia tudo quando há rede', async () => {
    const r = await flushQueue([upd('a', 1), upd('b', 1)], remoteOf({}));
    expect(r).toMatchObject({ applied: 2, remaining: [], conflicts: [] });
  });
  it('conflito de versão vai para a lista de conflitos (nada é perdido em silêncio)', async () => {
    const r = await flushQueue([upd('a', 1, { qty: 9 }), upd('b', 1)], remoteOf({
      update: async (id) => (id === 'a' ? { ok: false, code: 'conflict' } : ok),
    }));
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].mutation).toMatchObject({ itemId: 'a', patch: { qty: 9 } });
    expect(r.applied).toBe(1); expect(r.remaining).toHaveLength(0);
  });
  it('duplicado ao inserir vira conflito', async () => {
    const q: Mutation[] = [{ kind: 'insert', item: { clientId: 'c', listId: 'l', name: 'Arroz', qty: 1, unit: 'un' }, queuedAt: t }];
    const r = await flushQueue(q, remoteOf({ insert: async () => ({ ok: false, code: 'duplicate' }) }));
    expect(r.conflicts[0].code).toBe('duplicate');
  });
  it('queda de rede preserva o restante da fila na ordem', async () => {
    const r = await flushQueue([upd('a', 1), upd('b', 1), upd('c', 1)], remoteOf({
      update: async (id) => { if (id === 'b') throw new Error('offline'); return ok; },
    }));
    expect(r.applied).toBe(1);
    expect(r.remaining.map((m) => (m as any).itemId)).toEqual(['b', 'c']);
  });
});

import { overlayQueue } from '@/domain/sync';
describe('sobreposição da fila (exibição offline)', () => {
  const base = [{ id: 'a', name: 'Arroz', qty: 1, unit: 'un', status: 'pending' as const, version: 2 }];
  it('mostra alterações pendentes marcadas', () => {
    const q: Mutation[] = [
      upd('a', 2, { status: 'bought' }),
      { kind: 'insert', item: { clientId: 'c1', listId: 'L', name: 'Sal', qty: 1, unit: 'un' }, queuedAt: t },
    ];
    const r = overlayQueue(base, q, 'L');
    expect(r.find((i) => i.id === 'a')).toMatchObject({ status: 'bought', pendingSync: true });
    expect(r.find((i) => i.id === 'c1')).toMatchObject({ name: 'Sal', pendingSync: true });
  });
  it('não altera o estado original e esconde apagados', () => {
    const r = overlayQueue(base, [{ kind: 'delete', itemId: 'a', baseVersion: 2, queuedAt: t }], 'L');
    expect(r).toHaveLength(0); expect(base).toHaveLength(1);
  });
});
