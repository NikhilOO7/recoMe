import { Hono } from 'hono';
import type { AuthEnv } from '../types.js';
import { z } from 'zod';
import { PackService } from './PackService.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const packPreferenceSchema = z.object({
  topic: z.string().min(1).max(100),
  sentiment: z.enum(['positive', 'negative']),
  strength: z.number().min(0).max(1),
  explanation: z.string().max(200).default(''),
});

const createPackSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().min(1).max(500),
  category: z.string().min(1).max(30),
  preferences: z.array(packPreferenceSchema).min(1).max(50),
  tags: z.array(z.string().max(30)).max(10).default([]),
  isPublic: z.boolean().default(true),
});

const searchSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  sort: z.enum(['downloads', 'rating', 'newest']).default('downloads'),
  page: z.coerce.number().min(0).default(0),
  limit: z.coerce.number().min(1).max(50).default(20),
});

const rateSchema = z.object({
  rating: z.number().min(1).max(5),
});

export function createPackRoutes(): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  const service = new PackService();

  // Public: search packs
  app.get('/search', async (c) => {
    const params = searchSchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));
    const result = await service.search({
      query: params.q,
      category: params.category,
      sortBy: params.sort,
      page: params.page,
      limit: params.limit,
    });
    return c.json(result);
  });

  // Public: get a single pack
  app.get('/:id', async (c) => {
    const pack = await service.getById(c.req.param('id'));
    if (!pack) return c.json({ error: 'Pack not found' }, 404);
    return c.json(pack);
  });

  // Protected routes
  app.use('*', authMiddleware);

  // Create a pack
  app.post('/', async (c) => {
    const userId = c.get('userId') as string;
    const body = createPackSchema.safeParse(await c.req.json());
    if (!body.success)
      return c.json({ error: 'Invalid input', details: body.error.flatten() }, 400);

    const pack = await service.create(userId, body.data);
    return c.json(pack, 201);
  });

  // Update a pack
  app.patch('/:id', async (c) => {
    const userId = c.get('userId') as string;
    const packId = c.req.param('id');
    const body = createPackSchema.partial().safeParse(await c.req.json());
    if (!body.success) return c.json({ error: 'Invalid input' }, 400);

    const pack = await service.update(packId, userId, body.data);
    if (!pack) return c.json({ error: 'Not found or not authorized' }, 404);
    return c.json(pack);
  });

  // Delete a pack
  app.delete('/:id', async (c) => {
    const userId = c.get('userId') as string;
    const success = await service.delete(c.req.param('id'), userId);
    if (!success) return c.json({ error: 'Not found or not authorized' }, 404);
    return c.json({ ok: true });
  });

  // Rate a pack
  app.post('/:id/rate', async (c) => {
    const body = rateSchema.safeParse(await c.req.json());
    if (!body.success) return c.json({ error: 'Invalid rating' }, 400);

    const success = await service.rate(c.req.param('id'), body.data.rating);
    if (!success) return c.json({ error: 'Pack not found' }, 404);
    return c.json({ ok: true });
  });

  // Record a download
  app.post('/:id/download', async (c) => {
    await service.recordDownload(c.req.param('id'));
    return c.json({ ok: true });
  });

  // Share link
  app.post('/:id/share', async (c) => {
    const link = await service.createShareLink(c.req.param('id'));
    if (!link) return c.json({ error: 'Pack not found' }, 404);
    return c.json(link);
  });

  return app;
}
