import { getDB } from './db';
import type {
  Product,
  Brand,
  Seller,
  Offer,
  IntentEvent,
  DecisionRecord,
  WatchlistItem,
  IntentType,
} from '@shared/types';

// ── Product Repository ───────────────────────────────────────────────────────

export class ProductRepo {
  async put(product: Product): Promise<void> {
    const db = await getDB();
    await db.put('products', product);
  }

  async get(productId: string): Promise<Product | undefined> {
    const db = await getDB();
    return db.get('products', productId);
  }

  async getByBrand(brandId: string): Promise<Product[]> {
    const db = await getDB();
    return db.getAllFromIndex('products', 'by_brand', brandId);
  }

  async findByTitle(normalizedTitle: string): Promise<Product[]> {
    const db = await getDB();
    return db.getAllFromIndex('products', 'by_title', normalizedTitle);
  }

  async getAll(): Promise<Product[]> {
    const db = await getDB();
    return db.getAll('products');
  }

  async delete(productId: string): Promise<void> {
    const db = await getDB();
    await db.delete('products', productId);
  }
}

// ── Brand Repository ─────────────────────────────────────────────────────────

export class BrandRepo {
  async put(brand: Brand): Promise<void> {
    const db = await getDB();
    await db.put('brands', brand);
  }

  async get(brandId: string): Promise<Brand | undefined> {
    const db = await getDB();
    return db.get('brands', brandId);
  }

  async findByName(displayName: string): Promise<Brand[]> {
    const db = await getDB();
    return db.getAllFromIndex('brands', 'by_name', displayName);
  }

  async getAll(): Promise<Brand[]> {
    const db = await getDB();
    return db.getAll('brands');
  }

  async delete(brandId: string): Promise<void> {
    const db = await getDB();
    await db.delete('brands', brandId);
  }
}

// ── Seller Repository ────────────────────────────────────────────────────────

export class SellerRepo {
  async put(seller: Seller): Promise<void> {
    const db = await getDB();
    await db.put('sellers', seller);
  }

  async get(sellerId: string): Promise<Seller | undefined> {
    const db = await getDB();
    return db.get('sellers', sellerId);
  }

  async findByName(displayName: string): Promise<Seller[]> {
    const db = await getDB();
    return db.getAllFromIndex('sellers', 'by_name', displayName);
  }

  async getAll(): Promise<Seller[]> {
    const db = await getDB();
    return db.getAll('sellers');
  }

  async delete(sellerId: string): Promise<void> {
    const db = await getDB();
    await db.delete('sellers', sellerId);
  }
}

// ── Offer Repository ─────────────────────────────────────────────────────────

export class OfferRepo {
  async put(offer: Offer): Promise<void> {
    const db = await getDB();
    await db.put('offers', offer);
  }

  async get(offerId: string): Promise<Offer | undefined> {
    const db = await getDB();
    return db.get('offers', offerId);
  }

  async getByProduct(productId: string): Promise<Offer[]> {
    const db = await getDB();
    return db.getAllFromIndex('offers', 'by_product', productId);
  }

  async getBySeller(sellerId: string): Promise<Offer[]> {
    const db = await getDB();
    return db.getAllFromIndex('offers', 'by_seller', sellerId);
  }

  async getBySite(site: string): Promise<Offer[]> {
    const db = await getDB();
    return db.getAllFromIndex('offers', 'by_site', site);
  }

  async delete(offerId: string): Promise<void> {
    const db = await getDB();
    await db.delete('offers', offerId);
  }
}

// ── Intent Repository ────────────────────────────────────────────────────────

export class IntentRepo {
  async put(intent: IntentEvent): Promise<void> {
    const db = await getDB();
    await db.put('intents', intent);
  }

  async get(id: string): Promise<IntentEvent | undefined> {
    const db = await getDB();
    return db.get('intents', id);
  }

  async getByEntity(entityId: string): Promise<IntentEvent[]> {
    const db = await getDB();
    return db.getAllFromIndex('intents', 'by_entity', entityId);
  }

  async getByType(intentType: IntentType): Promise<IntentEvent[]> {
    const db = await getDB();
    return db.getAllFromIndex('intents', 'by_type', intentType);
  }

  async getAll(): Promise<IntentEvent[]> {
    const db = await getDB();
    return db.getAll('intents');
  }

  async getRecent(limit: number): Promise<IntentEvent[]> {
    const all = await this.getAll();
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('intents', id);
  }
}

// ── Decision Repository ──────────────────────────────────────────────────────

export class DecisionRepo {
  async put(decision: DecisionRecord): Promise<void> {
    const db = await getDB();
    await db.put('decisions', decision);
  }

  async get(decisionId: string): Promise<DecisionRecord | undefined> {
    const db = await getDB();
    return db.get('decisions', decisionId);
  }

  async getByCandidate(candidateId: string): Promise<DecisionRecord[]> {
    const db = await getDB();
    return db.getAllFromIndex('decisions', 'by_candidate', candidateId);
  }

  async getRecent(limit: number): Promise<DecisionRecord[]> {
    const all = await this.getAll();
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  async getAll(): Promise<DecisionRecord[]> {
    const db = await getDB();
    return db.getAll('decisions');
  }

  async delete(decisionId: string): Promise<void> {
    const db = await getDB();
    await db.delete('decisions', decisionId);
  }
}

// ── Watchlist Repository ─────────────────────────────────────────────────────

export class WatchlistRepo {
  async put(item: WatchlistItem): Promise<void> {
    const db = await getDB();
    await db.put('watchlists', item);
  }

  async get(id: string): Promise<WatchlistItem | undefined> {
    const db = await getDB();
    return db.get('watchlists', id);
  }

  async getByEntity(entityId: string): Promise<WatchlistItem[]> {
    const db = await getDB();
    return db.getAllFromIndex('watchlists', 'by_entity', entityId);
  }

  async getAll(): Promise<WatchlistItem[]> {
    const db = await getDB();
    return db.getAll('watchlists');
  }

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.delete('watchlists', id);
  }
}
