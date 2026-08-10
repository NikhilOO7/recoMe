/**
 * @jest-environment jsdom
 *
 * Surface fixture harness (PRODUCT.md P1 "capture QA harness"): each fixture
 * is the DOM contract a surface supports, written down. When a platform
 * redesigns and a selector dies, the fix updates the surface AND its fixture
 * together — never one without the other.
 */
import { createSurface } from '../index';
import { AmazonSearchSurface } from '../platforms/AmazonSearchSurface';
import { WalmartSurface } from '../platforms/WalmartSurface';
import { CourseraSurface } from '../platforms/CourseraSurface';

function mount(html: string): void {
  document.body.innerHTML = html;
}

function discover(surface: { cardSelector(): string }): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(surface.cardSelector()));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('createSurface registry', () => {
  test.each(['amazon', 'youtube', 'reddit', 'ebay', 'walmart', 'coursera'] as const)(
    '%s has a badge surface',
    (p) => {
      expect(createSurface(p)).not.toBeNull();
    },
  );

  test('platforms without card feeds return null (insight cards handle them)', () => {
    expect(createSurface('linkedin')).toBeNull();
    expect(createSurface('udemy')).toBeNull();
  });
});

describe('WalmartSurface DOM contract', () => {
  const surface = new WalmartSurface();

  test('extracts title, url, and a stable item-id key from a search tile', () => {
    mount(`
      <div data-item-id="5074784142">
        <a href="https://www.walmart.com/ip/uplift-desk/5074784142">
          <span data-automation-id="product-title">UPLIFT V2 Standing Desk, 48x30 Walnut</span>
        </a>
        <div>$599.00</div>
      </div>`);
    const [el] = discover(surface);
    expect(el).toBeDefined();
    const card = surface.extract(el!);
    expect(card).toMatchObject({
      id: 'wm_5074784142',
      title: 'UPLIFT V2 Standing Desk, 48x30 Walnut',
    });
    expect(card!.url).toContain('/ip/uplift-desk');
    expect(el!.getAttribute('data-recome-id')).toBe('wm_5074784142');
  });

  test('sponsored tiles are never scored', () => {
    mount(`
      <div data-item-id="123">
        <span data-automation-id="sponsored-label">Sponsored</span>
        <a href="https://www.walmart.com/ip/x/123">
          <span data-automation-id="product-title">Some Ad Desk</span>
        </a>
      </div>`);
    const [el] = discover(surface);
    expect(surface.extract(el!)).toBeNull();
  });

  test('falls back to the /ip/ link text when the title node is missing', () => {
    mount(`
      <div data-item-id="9">
        <a href="https://www.walmart.com/ip/y/9">Herman Miller Aeron</a>
      </div>`);
    const card = surface.extract(discover(surface)[0]!);
    expect(card?.title).toBe('Herman Miller Aeron');
  });

  test('tile without title or link yields null, not garbage', () => {
    mount(`<div data-item-id="1"><div>$4.99</div></div>`);
    expect(surface.extract(discover(surface)[0]!)).toBeNull();
  });
});

describe('CourseraSurface DOM contract', () => {
  const surface = new CourseraSurface();

  test('extracts title, partner as brand, and course url', () => {
    mount(`
      <div data-testid="product-card-cds">
        <a href="https://www.coursera.org/learn/distributed-systems">
          <h3>Cloud Computing Concepts: Distributed Systems</h3>
        </a>
        <p class="partner-name-x">University of Illinois</p>
      </div>`);
    const card = surface.extract(discover(surface)[0]!);
    expect(card).toMatchObject({
      title: 'Cloud Computing Concepts: Distributed Systems',
      brand: 'University of Illinois',
    });
    expect(card!.url).toContain('/learn/distributed-systems');
  });

  test('card without an h3 yields null', () => {
    mount(`<div data-testid="product-card-cds"><p>loading…</p></div>`);
    expect(surface.extract(discover(surface)[0]!)).toBeNull();
  });
});

describe('AmazonSearchSurface DOM contract', () => {
  const surface = new AmazonSearchSurface();

  test('extracts title + ASIN id from a search result', () => {
    mount(`
      <div class="s-result-item" data-asin="B0EXAMPLE1">
        <h2><a href="https://www.amazon.com/dp/B0EXAMPLE1"><span>Sony WH-1000XM6 Headphones</span></a></h2>
      </div>`);
    const [el] = discover(surface);
    const card = surface.extract(el!);
    expect(card).toMatchObject({ id: 'B0EXAMPLE1', title: 'Sony WH-1000XM6 Headphones' });
  });

  test('sponsored results are skipped; empty-ASIN rows are never discovered', () => {
    mount(`
      <div class="s-result-item" data-asin="B0AD">
        <div data-component-type="sp-sponsored-result"></div>
        <h2><a><span>Ad Product</span></a></h2>
      </div>
      <div class="s-result-item" data-asin=""></div>`);
    const found = discover(surface);
    expect(found).toHaveLength(1);
    expect(surface.extract(found[0]!)).toBeNull();
  });
});
