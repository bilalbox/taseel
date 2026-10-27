import { describe, expect, it } from 'vitest';
import { sqliteClient } from './sqliteClient';

describe('sqliteClient', () => {
  it('retrieves principles tree via getPrinciplesTree', async () => {
    const tree = await sqliteClient.getPrinciplesTree();
    expect(Array.isArray(tree)).toBe(true);
    expect(tree.length).toBeGreaterThan(0);
    expect(tree[0]).toHaveProperty('id');
    expect(tree[0]).toHaveProperty('canonical_text_ar');
    expect(tree[0]).toHaveProperty('fatwas_count');
  });

  it('queries fatwas via browseFatwas with pagination and filtering', async () => {
    const res = await sqliteClient.browseFatwas({ limit: 3 });
    expect(res).toHaveProperty('fatwas');
    expect(res).toHaveProperty('total');
    expect(res.fatwas.length).toBeLessThanOrEqual(3);
  });

  it('queries fatwa detail via getFatwaDetail for existing and non-existing IDs', async () => {
    const detail = await sqliteClient.getFatwaDetail('fatwa-101');
    expect(detail).not.toBeNull();
    expect(detail?.id).toBe('fatwa-101');
    expect(detail?.principles.length).toBeGreaterThan(0);

    const nonExistent = await sqliteClient.getFatwaDetail('unknown-id-xyz');
    expect(nonExistent).toBeNull();
  });

  it('retrieves distinct archive chapters via getArchiveChapters', async () => {
    const chapters = await sqliteClient.getArchiveChapters();
    expect(Array.isArray(chapters)).toBe(true);
    expect(chapters.length).toBeGreaterThan(0);
    expect(chapters.every(c => typeof c === 'string')).toBe(true);
  });

  it('loads user state fallback gracefully in non-worker environments', async () => {
    const userState = await sqliteClient.loadUserState();
    expect(userState).toHaveProperty('bookmarks');
    expect(userState).toHaveProperty('history');
    expect(userState).toHaveProperty('xp');
  });
});
