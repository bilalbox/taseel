import { describe, expect, it } from 'vitest';
import {
  MockArchiveAdapter,
  flattenPrinciplesTree,
  mockArchiveAdapter,
} from './mockArchiveAdapter';
import { FATWAS_DATA, PRINCIPLES_DATA } from './mockData';

describe('MockArchiveAdapter', () => {
  it('instantiates with default mock data', () => {
    expect(mockArchiveAdapter).toBeInstanceOf(MockArchiveAdapter);
  });

  describe('getPrinciplesTree', () => {
    it('returns a list of PrincipleTreeNode objects with fatwas_count and children', async () => {
      const tree = await mockArchiveAdapter.getPrinciplesTree();

      expect(Array.isArray(tree)).toBe(true);
      expect(tree.length).toBe(PRINCIPLES_DATA.length);

      for (const node of tree) {
        expect(node).toHaveProperty('id');
        expect(node).toHaveProperty('canonical_text_ar');
        expect(node).toHaveProperty('canonical_text_norm');
        expect(node).toHaveProperty('category');
        expect(node).toHaveProperty('general_explanation_ar');
        expect(node).toHaveProperty('fatwas_count');
        expect(typeof node.fatwas_count).toBe('number');
        expect(Array.isArray(node.children)).toBe(true);
      }
    });

    it('computes correct fatwas_count for linked and unlinked principles', async () => {
      const tree = await mockArchiveAdapter.getPrinciplesTree();
      const yaqeen = tree.find(p => p.id === 'principle-yaqeen');
      const darar = tree.find(p => p.id === 'principle-darar');

      expect(yaqeen).toBeDefined();
      expect(yaqeen!.fatwas_count).toBe(1);

      expect(darar).toBeDefined();
      expect(darar!.fatwas_count).toBe(0);
    });

    it('flattenPrinciplesTree flattens the hierarchy into an array', async () => {
      const tree = await mockArchiveAdapter.getPrinciplesTree();
      const flat = flattenPrinciplesTree(tree);

      expect(flat.length).toBe(tree.length);
      expect(flat[0].id).toBe(tree[0].id);
    });
  });

  describe('browseFatwas', () => {
    it('returns default paginated list of FatwaSummary items', async () => {
      const result = await mockArchiveAdapter.browseFatwas();

      expect(result).toHaveProperty('fatwas');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('hasMore');
      expect(typeof result.latencyMs).toBe('number');

      expect(result.total).toBe(FATWAS_DATA.length);
      expect(result.fatwas.length).toBe(FATWAS_DATA.length);
      expect(result.hasMore).toBe(false);

      const first = result.fatwas[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('question_text');
      expect(first).toHaveProperty('scholar_name');
      expect(first).toHaveProperty('topic_chapter');
      expect(first).toHaveProperty('topic_subtopic');
      expect(first).toHaveProperty('linked_principles_count');
      // Should be lightweight summary without massive raw norm strings
      expect((first as any).question_norm).toBeUndefined();
    });

    it('filters fatwas by scholar', async () => {
      const result = await mockArchiveAdapter.browseFatwas({ scholar: 'ابن باز' });

      expect(result.total).toBeGreaterThan(0);
      expect(result.fatwas.every(f => f.scholar_name === 'ابن باز')).toBe(true);
    });

    it('filters fatwas by chapter', async () => {
      const result = await mockArchiveAdapter.browseFatwas({ chapter: 'Taharah' });

      expect(result.total).toBeGreaterThan(0);
      expect(result.fatwas.every(f => f.topic_chapter === 'Taharah')).toBe(true);
    });

    it('filters fatwas by linked principleId', async () => {
      const result = await mockArchiveAdapter.browseFatwas({
        principleId: 'principle-yaqeen',
      });

      expect(result.total).toBe(1);
      expect(result.fatwas[0].id).toBe('fatwa-101');
    });

    it('supports pagination with limit and offset', async () => {
      const page1 = await mockArchiveAdapter.browseFatwas({ limit: 2, offset: 0 });
      expect(page1.fatwas.length).toBe(2);
      expect(page1.total).toBe(FATWAS_DATA.length);
      expect(page1.hasMore).toBe(true);

      const page2 = await mockArchiveAdapter.browseFatwas({ limit: 2, offset: 2 });
      expect(page2.fatwas.length).toBe(2);
      expect(page2.fatwas[0].id).not.toBe(page1.fatwas[0].id);
      expect(page2.hasMore).toBe(true);
    });

    it('filters fatwas by text query', async () => {
      const result = await mockArchiveAdapter.browseFatwas({ query: 'الوضوء' });

      expect(result.total).toBeGreaterThan(0);
      expect(result.fatwas.some(f => f.id === 'fatwa-101')).toBe(true);
    });
  });

  describe('getFatwaDetail', () => {
    it('returns full FatwaDetail for a valid id', async () => {
      const detail = await mockArchiveAdapter.getFatwaDetail('fatwa-101');

      expect(detail).not.toBeNull();
      expect(detail!.id).toBe('fatwa-101');
      expect(detail!.question_text).toBeTruthy();
      expect(detail!.answer_text).toBeTruthy();

      expect(detail!.fatwa).toBeDefined();
      expect(detail!.fatwa.id).toBe('fatwa-101');

      expect(Array.isArray(detail!.principles)).toBe(true);
      expect(detail!.principles.length).toBe(1);
      expect(detail!.principles[0].id).toBe('principle-yaqeen');

      expect(Array.isArray(detail!.fatwaPrinciples)).toBe(true);
      expect(detail!.fatwaPrinciples.length).toBe(1);
      expect(detail!.fatwaPrinciples[0].principle_id).toBe('principle-yaqeen');
      expect(detail!.fatwaPrinciples[0].distractor_principles_json).toBeTruthy();
    });

    it('returns null for an invalid id', async () => {
      const detail = await mockArchiveAdapter.getFatwaDetail('non-existent-id');
      expect(detail).toBeNull();
    });
  });
});
