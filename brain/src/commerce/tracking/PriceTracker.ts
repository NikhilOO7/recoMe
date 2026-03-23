import { createLogger } from '@shared/Logger';
import { PriceStore, type TrackedProduct, type PriceSnapshot } from './PriceStore';

const log = createLogger('PriceTracker');

/**
 * PriceTracker — records price snapshots when users visit product pages.
 *
 * - Extracts price from page content metadata
 * - Stores snapshots in PriceStore
 * - Detects price changes and returns alerts
 */
export class PriceTracker {
  private readonly store = new PriceStore();

  /**
   * Record a price observation from a product page visit.
   * Returns price change info if the price changed.
   */
  async recordPrice(
    url: string,
    platform: string,
    title: string,
    price: number,
    currency: string,
    imageUrl?: string,
  ): Promise<PriceChangeResult | null> {
    const productId = PriceStore.generateProductId(url, platform);

    const snapshot: PriceSnapshot = {
      price,
      currency,
      timestamp: Date.now(),
      source: platform,
    };

    const existing = await this.store.getProduct(productId);

    if (!existing) {
      // New product — start tracking
      const product: TrackedProduct = {
        id: productId,
        url,
        title,
        platform,
        currentPrice: price,
        currency,
        lowestPrice: price,
        highestPrice: price,
        firstSeen: Date.now(),
        lastChecked: Date.now(),
        imageUrl,
      };
      await this.store.upsertProduct(product);
      await this.store.recordSnapshot(productId, snapshot);
      log.debug(`Started tracking: ${title} at ${currency}${price}`);
      return null;
    }

    // Record snapshot
    await this.store.recordSnapshot(productId, snapshot);

    // Check for price change
    const previousPrice = existing.currentPrice;
    if (previousPrice === price) return null;

    const change: PriceChangeResult = {
      productId,
      title: existing.title,
      url: existing.url,
      platform,
      previousPrice,
      currentPrice: price,
      currency,
      changePercent: ((price - previousPrice) / previousPrice) * 100,
      isAllTimeLow: price < existing.lowestPrice,
      lowestPrice: Math.min(existing.lowestPrice, price),
      highestPrice: existing.highestPrice,
    };

    log.info(
      `Price change: ${title} ${currency}${previousPrice} → ${currency}${price} (${change.changePercent > 0 ? '+' : ''}${change.changePercent.toFixed(1)}%)`,
    );
    return change;
  }

  /** Track a product explicitly (user action) */
  async trackProduct(
    url: string,
    platform: string,
    title: string,
    price: number,
    currency: string,
    imageUrl?: string,
  ): Promise<string> {
    const productId = PriceStore.generateProductId(url, platform);
    const product: TrackedProduct = {
      id: productId,
      url,
      title,
      platform,
      currentPrice: price,
      currency,
      lowestPrice: price,
      highestPrice: price,
      firstSeen: Date.now(),
      lastChecked: Date.now(),
      imageUrl,
    };
    await this.store.upsertProduct(product);
    await this.store.recordSnapshot(productId, {
      price,
      currency,
      timestamp: Date.now(),
      source: platform,
    });
    log.info(`Tracking product: ${title}`);
    return productId;
  }

  /** Stop tracking a product */
  async untrackProduct(productId: string): Promise<void> {
    await this.store.removeProduct(productId);
  }

  /** Get all tracked products */
  async getTrackedProducts(): Promise<TrackedProduct[]> {
    return this.store.getTrackedProducts();
  }

  /** Get price history for a product */
  async getPriceHistory(productId: string): Promise<PriceSnapshot[]> {
    return this.store.getSnapshots(productId);
  }

  /** Get products needing a price check (stale > 6 hours) */
  async getStaleProducts(): Promise<TrackedProduct[]> {
    return this.store.getStaleProducts(6 * 60 * 60 * 1000);
  }

  /** Parse price string to number */
  static parsePrice(priceStr: string): { price: number; currency: string } | null {
    if (!priceStr) return null;

    // Extract currency symbol
    const currencyMatch = priceStr.match(/([£€$¥₹])/);
    const currency = currencyMatch?.[1] ?? '$';

    // Extract numeric value
    const numStr = priceStr.replace(/[^0-9.,]/g, '');
    // Handle formats: 1,234.56 or 1.234,56
    let normalized = numStr;
    if (numStr.includes(',') && numStr.includes('.')) {
      // 1,234.56 format
      if (numStr.lastIndexOf(',') < numStr.lastIndexOf('.')) {
        normalized = numStr.replace(/,/g, '');
      } else {
        // 1.234,56 format
        normalized = numStr.replace(/\./g, '').replace(',', '.');
      }
    } else if (numStr.includes(',') && !numStr.includes('.')) {
      // Could be 1,234 or 1,23 — check position
      const parts = numStr.split(',');
      if (parts[parts.length - 1]!.length === 2) {
        normalized = numStr.replace(',', '.'); // 1,23 → 1.23
      } else {
        normalized = numStr.replace(/,/g, ''); // 1,234 → 1234
      }
    }

    const price = parseFloat(normalized);
    if (isNaN(price) || price <= 0) return null;

    return { price, currency };
  }
}

export interface PriceChangeResult {
  productId: string;
  title: string;
  url: string;
  platform: string;
  previousPrice: number;
  currentPrice: number;
  currency: string;
  changePercent: number;
  isAllTimeLow: boolean;
  lowestPrice: number;
  highestPrice: number;
}
