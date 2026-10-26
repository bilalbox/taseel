import {
  ArchiveQueryAdapter,
  BrowseFatwasParams,
  BrowseFatwasResult,
  Fatwa,
  FatwaDetail,
  FatwaPrinciple,
  FatwaSummary,
  Principle,
  PrincipleTreeNode,
} from '../types';
import { matchesSearch, normalizeArabic } from '../utils/arabic';
import { FATWA_PRINCIPLES_DATA, FATWAS_DATA, PRINCIPLES_DATA } from './mockData';

export function flattenPrinciplesTree(nodes: PrincipleTreeNode[]): PrincipleTreeNode[] {
  const result: PrincipleTreeNode[] = [];
  function traverse(list: PrincipleTreeNode[]) {
    for (const node of list) {
      result.push(node);
      if (node.children && node.children.length > 0) {
        traverse(node.children);
      }
    }
  }
  traverse(nodes);
  return result;
}

export function toFatwaSummary(
  fatwa: Fatwa,
  fatwaPrinciples: FatwaPrinciple[] = FATWA_PRINCIPLES_DATA
): FatwaSummary {
  const linkedCount = fatwaPrinciples.filter(fp => fp.fatwa_id === fatwa.id).length;
  return {
    id: fatwa.id,
    episode_id: fatwa.episode_id,
    scholar_name: fatwa.scholar_name,
    episode_number: fatwa.episode_number,
    question_text: fatwa.question_text,
    topic_domain: fatwa.topic_domain,
    topic_chapter: fatwa.topic_chapter,
    topic_subtopic: fatwa.topic_subtopic,
    audio_url: fatwa.audio_url,
    audio_timestamp: fatwa.audio_timestamp,
    linked_principles_count: linkedCount,
  };
}

export class MockArchiveAdapter implements ArchiveQueryAdapter {
  private fatwas: Fatwa[];
  private principles: Principle[];
  private fatwaPrinciples: FatwaPrinciple[];

  constructor(
    fatwas: Fatwa[] = FATWAS_DATA,
    principles: Principle[] = PRINCIPLES_DATA,
    fatwaPrinciples: FatwaPrinciple[] = FATWA_PRINCIPLES_DATA
  ) {
    this.fatwas = fatwas;
    this.principles = principles;
    this.fatwaPrinciples = fatwaPrinciples;
  }

  public async getPrinciplesTree(): Promise<PrincipleTreeNode[]> {
    const linkedCounts = new Map<string, number>();
    for (const fp of this.fatwaPrinciples) {
      linkedCounts.set(fp.principle_id, (linkedCounts.get(fp.principle_id) || 0) + 1);
    }

    const nodeMap = new Map<string, PrincipleTreeNode>();
    const roots: PrincipleTreeNode[] = [];

    for (const p of this.principles) {
      const node: PrincipleTreeNode = {
        ...p,
        depth: p.depth ?? 0,
        parent_id: p.parent_id ?? null,
        fatwas_count: linkedCounts.get(p.id) || 0,
        children: [],
      };
      nodeMap.set(p.id, node);
    }

    for (const node of nodeMap.values()) {
      if (node.parent_id && nodeMap.has(node.parent_id)) {
        nodeMap.get(node.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  public async browseFatwas(params: BrowseFatwasParams = {}): Promise<BrowseFatwasResult> {
    const t0 = performance.now();
    const {
      query,
      scholar = 'ALL',
      chapter = 'ALL',
      subtopic,
      principleId,
      limit = 20,
      offset = 0,
    } = params;

    let filtered = this.fatwas;

    if (scholar !== 'ALL') {
      filtered = filtered.filter(f => f.scholar_name === scholar);
    }

    if (chapter !== 'ALL') {
      filtered = filtered.filter(f => f.topic_chapter === chapter);
    }

    if (subtopic) {
      filtered = filtered.filter(f => f.topic_subtopic === subtopic);
    }

    if (principleId) {
      const linkedFatwaIds = new Set(
        this.fatwaPrinciples
          .filter(fp => fp.principle_id === principleId)
          .map(fp => fp.fatwa_id)
      );
      filtered = filtered.filter(f => linkedFatwaIds.has(f.id));
    }

    if (query && query.trim()) {
      const trimmed = query.trim();
      filtered = filtered.filter(
        f =>
          matchesSearch(trimmed, f.question_norm) ||
          matchesSearch(trimmed, f.answer_norm) ||
          matchesSearch(trimmed, normalizeArabic(f.topic_subtopic || ''))
      );
    }

    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limit);
    const fatwas = paged.map(f => toFatwaSummary(f, this.fatwaPrinciples));
    const hasMore = offset + limit < total;
    const latencyMs = Number((performance.now() - t0).toFixed(2));

    return {
      fatwas,
      total,
      hasMore,
      latencyMs,
    };
  }

  public async getFatwaDetail(id: string): Promise<FatwaDetail | null> {
    const fatwa = this.fatwas.find(f => f.id === id);
    if (!fatwa) {
      return null;
    }

    const linkedFp = this.fatwaPrinciples.filter(fp => fp.fatwa_id === id);
    const linkedPrincipleIds = new Set(linkedFp.map(fp => fp.principle_id));
    const principles = this.principles.filter(p => linkedPrincipleIds.has(p.id));

    return {
      ...fatwa,
      fatwa,
      principles,
      fatwaPrinciples: linkedFp,
    };
  }
}

export const mockArchiveAdapter = new MockArchiveAdapter();
