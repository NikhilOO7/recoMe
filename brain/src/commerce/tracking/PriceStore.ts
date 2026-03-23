const STORAGE_KEY_PREFIX = 'recome_price_';
const TRACKED_PRODUCTS_KEY = 'recome_tracked_products';
const MAX_SNAPSHOTS_PER_PRODUCT = 365; // ~1 year of daily snapshots
const MAX_TRACKED_PRODUCTS = 200;

// ── Types ────────────────────────────────────────────────────────────────────

export interface PriceSnapshot {
  price: number;
  currency: string;
  timestamp: number;
  source: string; // platform
}

export interface TrackedProduct {
  id: string;
  url: string;
  title: string;
  platform: string;
  currentPrice: number;
  currency: string;
  lowestPrice: number;
  highestPrice: number;
  firstSeen: number;
  lastChecked: number;
  imageUrl?: string;
  asin?: string;
}

// ── PriceStore ───────────────────────────────────────────────────────────────

export class PriceStore {
  /** Get all tracked products */
  async getTrackedProducts(): Promise<TrackedProduct[]> {
    try {
      const stored = await chrome.storage.local.get(TRACKED_PRODUCTS_KEY);
      return (stored[TRACKED_PRODUCTS_KEY] as TrackedProduct[] | undefined) ?? [];
    } catch {
      return [];
    }
  }

  /** Get a single tracked product */
  async getProduct(productId: string): Promise<TrackedProduct | null> {
    const products = await this.getTrackedProducts();
    return products.find((p) => p.id === productId) ?? null;
  }

  /** Add or update a tracked product */
  async upsertProduct(product: TrackedProduct): Promise<void> {
    const products = await this.getTrackedProducts();
    const idx = products.findIndex((p) => p.id === product.id);

    if (idx >= 0) {
      products[idx] = product;
    } else {
      if (products.length >= MAX_TRACKED_PRODUCTS) {
        // Remove oldest unchecked product
        products.sort((a, b) => a.lastChecked - b.lastChecked);
        products.shift();
      }
      products.push(product);
    }

    await chrome.storage.local.set({ [TRACKED_PRODUCTS_KEY]: products });
  }

  /** Remove a tracked product and its snapshots */
  async removeProduct(productId: string): Promise<void> {
    const products = await this.getTrackedProducts();
    const filtered = products.filter((p) => p.id !== productId);
    await chrome.storage.local.set({ [TRACKED_PRODUCTS_KEY]: filtered });
    await chrome.storage.local.remove(`${STORAGE_KEY_PREFIX}${productId}`);
  }

  /** Record a price snapshot */
  async recordSnapshot(productId: string, snapshot: PriceSnapshot): Promise<void> {
    const key = `${STORAGE_KEY_PREFIX}${productId}`;
    const stored = await chrome.storage.local.get(key);
    const snapshots = (stored[key] as PriceSnapshot[] | undefined) ?? [];

    snapshots.push(snapshot);

    // Trim to max
    if (snapshots.length > MAX_SNAPSHOTS_PER_PRODUCT) {
      snapshots.splice(0, snapshots.length - MAX_SNAPSHOTS_PER_PRODUCT);
    }

    await chrome.storage.local.set({ [key]: snapshots });

    // Update product metadata
    const product = await this.getProduct(productId);
    if (product) {
      product.currentPrice = snapshot.price;
      product.lastChecked = snapshot.timestamp;
      product.lowestPrice = Math.min(product.lowestPrice, snapshot.price);
      product.highestPrice = Math.max(product.highestPrice, snapshot.price);
      await this.upsertProduct(product);
    }
  }

  /** Get price history for a product */
  async getSnapshots(productId: string): Promise<PriceSnapshot[]> {
    const key = `${STORAGE_KEY_PREFIX}${productId}`;
    const stored = await chrome.storage.local.get(key);
    return (stored[key] as PriceSnapshot[] | undefined) ?? [];
  }

  /** Get products that need price checking (not checked in last N hours) */
  async getStaleProducts(maxAgeMs: number): Promise<TrackedProduct[]> {
    const products = await this.getTrackedProducts();
    const cutoff = Date.now() - maxAgeMs;
    return products.filter((p) => p.lastChecked < cutoff);
  }

  /** Generate a product ID from URL */
  static generateProductId(url: string, platform: string): string {
    // Try to extract a stable identifier
    const urlObj = new URL(url);

    // Amazon ASIN
    const asinMatch = urlObj.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
    if (asinMatch) return `amz_${asinMatch[1]}`;

    // eBay item number
    const ebayMatch = urlObj.pathname.match(/\/itm\/(\d+)/);
    if (ebayMatch) return `ebay_${ebayMatch[1]}`;

    // Walmart IP
    const walmartMatch = urlObj.pathname.match(/\/ip\/(\d+)/);
    if (walmartMatch) return `wmt_${walmartMatch[1]}`;

    // Fallback: hash the URL
    let hash = 0;
    const str = `${platform}_${urlObj.pathname}`;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return `${platform}_${Math.abs(hash).toString(36)}`;
  }
}
