import { prisma } from '../db.js';
import { nanoid } from 'nanoid';

interface PackPreference {
  topic: string;
  sentiment: 'positive' | 'negative';
  strength: number;
  explanation: string;
}

interface PackData {
  name: string;
  description: string;
  category: string;
  preferences: PackPreference[];
  tags?: string[];
  isPublic?: boolean;
}

interface PackRecord {
  id: string;
  name: string;
  description: string;
  author: string;
  authorId: string;
  category: string;
  preferences: PackPreference[];
  tags: string[];
  version: number;
  downloads: number;
  rating: number;
  ratingCount: number;
  ratingSum: number;
  createdAt: number;
  updatedAt: number;
  isPublic: boolean;
}

interface SearchParams {
  query?: string;
  category?: string;
  sortBy?: 'downloads' | 'rating' | 'newest';
  page?: number;
  limit?: number;
}

interface SearchResult {
  packs: PackRecord[];
  total: number;
  page: number;
  hasMore: boolean;
}

// In-memory store for packs (would be a DB table in production)
// Using chrome.storage.local style for now; upgrade to Prisma model later
const PACKS_STORAGE_KEY = 'recome_community_packs';

/**
 * PackService — manages community preference packs.
 *
 * Note: In production, packs would have their own Prisma model.
 * For now, using an in-memory array that persists via a JSON column.
 */
export class PackService {
  private packs: PackRecord[] = [];
  private loaded = false;

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    // In production: SELECT * FROM packs
    // For now, packs live in memory (reset on server restart)
    this.loaded = true;
  }

  async search(params: SearchParams): Promise<SearchResult> {
    await this.ensureLoaded();
    let filtered = this.packs.filter((p) => p.isPublic);

    if (params.query) {
      const q = params.query.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.includes(q)),
      );
    }

    if (params.category) {
      filtered = filtered.filter((p) => p.category === params.category);
    }

    // Sort
    switch (params.sortBy) {
      case 'rating':
        filtered.sort((a, b) => b.rating - a.rating);
        break;
      case 'newest':
        filtered.sort((a, b) => b.createdAt - a.createdAt);
        break;
      default:
        filtered.sort((a, b) => b.downloads - a.downloads);
    }

    const page = params.page ?? 0;
    const limit = params.limit ?? 20;
    const start = page * limit;
    const packs = filtered.slice(start, start + limit);

    return {
      packs,
      total: filtered.length,
      page,
      hasMore: start + limit < filtered.length,
    };
  }

  async getById(id: string): Promise<PackRecord | null> {
    await this.ensureLoaded();
    return this.packs.find((p) => p.id === id) ?? null;
  }

  async create(userId: string, data: PackData): Promise<PackRecord> {
    await this.ensureLoaded();

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const pack: PackRecord = {
      id: `pack_${nanoid(12)}`,
      name: data.name,
      description: data.description,
      author: user?.displayName ?? 'Anonymous',
      authorId: userId,
      category: data.category,
      preferences: data.preferences,
      tags: data.tags ?? [],
      version: 1,
      downloads: 0,
      rating: 0,
      ratingCount: 0,
      ratingSum: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPublic: data.isPublic ?? true,
    };

    this.packs.push(pack);
    return pack;
  }

  async update(id: string, userId: string, data: Partial<PackData>): Promise<PackRecord | null> {
    await this.ensureLoaded();
    const pack = this.packs.find((p) => p.id === id && p.authorId === userId);
    if (!pack) return null;

    if (data.name) pack.name = data.name;
    if (data.description) pack.description = data.description;
    if (data.category) pack.category = data.category;
    if (data.preferences) pack.preferences = data.preferences;
    if (data.tags) pack.tags = data.tags;
    if (data.isPublic !== undefined) pack.isPublic = data.isPublic;
    pack.version++;
    pack.updatedAt = Date.now();

    return pack;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    await this.ensureLoaded();
    const idx = this.packs.findIndex((p) => p.id === id && p.authorId === userId);
    if (idx < 0) return false;
    this.packs.splice(idx, 1);
    return true;
  }

  async rate(id: string, rating: number): Promise<boolean> {
    await this.ensureLoaded();
    const pack = this.packs.find((p) => p.id === id);
    if (!pack) return false;

    pack.ratingSum += rating;
    pack.ratingCount++;
    pack.rating = pack.ratingSum / pack.ratingCount;
    return true;
  }

  async recordDownload(id: string): Promise<void> {
    await this.ensureLoaded();
    const pack = this.packs.find((p) => p.id === id);
    if (pack) pack.downloads++;
  }

  async createShareLink(id: string): Promise<{ packId: string; url: string } | null> {
    const pack = await this.getById(id);
    if (!pack) return null;
    return {
      packId: id,
      url: `https://recome.dev/packs/${id}`,
    };
  }
}
