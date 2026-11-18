import { describe, it, expect } from 'vitest';
import { groupByCategory, groupByStore, sortCustom, moveItem } from '@/domain/listview';

const mk = (id: string, name: string, o: any = {}) => ({ id, name, status: 'pending' as const, ...o });
describe('visões da lista', () => {
  it('categoria: usa a gravada, senão sugere pelo nome; ordem de exibição', () => {
    const g = groupByCategory([mk('1', 'Detergente'), mk('2', 'Arroz', { category_id: 'c1' }), mk('3', 'Banana')], (id) => (id === 'c1' ? 'Mercearia' : undefined));
    expect(g.map((x) => x.title)).toEqual(['Mercearia', 'Hortifruti', 'Limpeza']);
  });
  it('supermercado: itens sem pick vão para "Sem preço conhecido"', () => {
    const g = groupByStore([mk('1', 'a'), mk('2', 'b')], [{ itemId: '1', storeId: 's1' }], () => 'Guanabara');
    expect(g.map((x) => x.title)).toEqual(['Guanabara', 'Sem preço conhecido']);
  });
  it('ordem personalizada: posição primeiro, depois criação', () => {
    const r = sortCustom([mk('a', 'a', { created_at: '2' }), mk('b', 'b', { position: 2 }), mk('c', 'c', { position: 1 }), mk('d', 'd', { created_at: '1' })]);
    expect(r.map((x) => x.id)).toEqual(['c', 'b', 'd', 'a']);
  });
  it('mover renumera e ignora limites', () => {
    const o = [{ id: 'a', position: null }, { id: 'b', position: null }, { id: 'c', position: null }];
    expect(moveItem(o, 'b', -1)).toEqual([{ id: 'b', position: 1 }, { id: 'a', position: 2 }, { id: 'c', position: 3 }]);
    expect(moveItem(o, 'a', -1)).toEqual([]);
  });
});
