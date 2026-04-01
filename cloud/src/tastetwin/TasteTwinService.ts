import { prisma } from '../db.js';

/**
 * TasteTwinService — Privacy-first taste similarity matching.
 *
 * Privacy model:
 * - Users must explicitly consent before any data is stored or matched.
 * - Only anonymized taste vectors (bucketed interest signals) are stored — never raw interests.
 * - Twin identities are never revealed; only anonymized recommendations are surfaced.
 * - Users can revoke consent at any time, which deletes all their taste data.
 * - Blocking a twin permanently prevents re-matching.
 *
 * Similarity scoring:
 * - Jaccard similarity on bucketed interest sets.
 * - Minimum threshold (0.3) to avoid low-quality matches.
 * - Max 10 active twins per user to prevent abuse.
 */

const MIN_SIMILARITY_THRESHOLD = 0.3;
const MAX_TWINS_PER_USER = 10;
const MAX_RECOMMENDATIONS_PER_MATCH = 5;

export type TasteVector = string[]; // Array of bucketed interest hashes

export class TasteTwinService {
  /** Opt in to the Taste Twin network */
  async optIn(userId: string): Promise<void> {
    await prisma.tasteProfile.upsert({
      where: { userId },
      update: { consentGiven: true, consentAt: new Date(), isDiscoverable: true },
      create: { userId, consentGiven: true, consentAt: new Date(), isDiscoverable: true },
    });
  }

  /** Opt out — deletes all taste data, matches, and recommendations */
  async optOut(userId: string): Promise<void> {
    // Delete recommendations where user is recipient
    await prisma.twinRecommendation.deleteMany({ where: { recipientId: userId } });

    // Delete matches involving this user
    await prisma.twinMatch.deleteMany({
      where: { OR: [{ userId1: userId }, { userId2: userId }] },
    });

    // Delete taste profile
    await prisma.tasteProfile.deleteMany({ where: { userId } });
  }

  /** Get consent status */
  async getStatus(userId: string) {
    const profile = await prisma.tasteProfile.findUnique({ where: { userId } });
    if (!profile || !profile.consentGiven) {
      return { optedIn: false, twinCount: 0, recommendationCount: 0 };
    }

    const twinCount = await prisma.twinMatch.count({
      where: {
        OR: [{ userId1: userId }, { userId2: userId }],
        blockedAt: null,
      },
    });

    const recommendationCount = await prisma.twinRecommendation.count({
      where: { recipientId: userId, dismissedAt: null, actedOn: false },
    });

    return {
      optedIn: true,
      isDiscoverable: profile.isDiscoverable,
      twinCount,
      recommendationCount,
      lastUpdated: profile.updatedAt,
    };
  }

  /** Upload anonymized taste vector from the extension */
  async updateTasteVector(userId: string, vector: TasteVector): Promise<void> {
    const profile = await prisma.tasteProfile.findUnique({ where: { userId } });
    if (!profile?.consentGiven) {
      throw new Error('Consent not given — opt in first');
    }

    await prisma.tasteProfile.update({
      where: { userId },
      data: { tasteVector: vector },
    });
  }

  /** Find and store similarity matches for a user */
  async computeMatches(userId: string): Promise<number> {
    const profile = await prisma.tasteProfile.findUnique({ where: { userId } });
    if (!profile?.consentGiven || !profile.tasteVector) return 0;

    const userVector = profile.tasteVector as TasteVector;

    // Get all other discoverable profiles with vectors
    const candidates = await prisma.tasteProfile.findMany({
      where: {
        userId: { not: userId },
        consentGiven: true,
        isDiscoverable: true,
        tasteVector: { not: null },
      },
      select: { userId: true, tasteVector: true },
    });

    // Check existing blocked matches
    const blockedMatches = await prisma.twinMatch.findMany({
      where: {
        OR: [{ userId1: userId }, { userId2: userId }],
        blockedAt: { not: null },
      },
      select: { userId1: true, userId2: true },
    });
    const blockedUserIds = new Set(
      blockedMatches.map((m) => (m.userId1 === userId ? m.userId2 : m.userId1)),
    );

    let matchesCreated = 0;

    for (const candidate of candidates) {
      if (blockedUserIds.has(candidate.userId)) continue;

      const candidateVector = candidate.tasteVector as TasteVector;
      const { score, sharedCount } = jaccardSimilarity(userVector, candidateVector);

      if (score < MIN_SIMILARITY_THRESHOLD) continue;

      // Canonical ordering: userId1 < userId2
      const [id1, id2] =
        userId < candidate.userId ? [userId, candidate.userId] : [candidate.userId, userId];

      // Check max twins limit
      const existingCount = await prisma.twinMatch.count({
        where: {
          OR: [{ userId1: userId }, { userId2: userId }],
          blockedAt: null,
        },
      });
      if (existingCount >= MAX_TWINS_PER_USER) break;

      await prisma.twinMatch.upsert({
        where: { userId1_userId2: { userId1: id1, userId2: id2 } },
        update: { similarityScore: score, sharedBuckets: sharedCount },
        create: {
          userId1: id1,
          userId2: id2,
          similarityScore: score,
          sharedBuckets: sharedCount,
        },
      });

      matchesCreated++;
    }

    return matchesCreated;
  }

  /** Get user's current twins (anonymized — no identity revealed) */
  async getTwins(userId: string) {
    const matches = await prisma.twinMatch.findMany({
      where: {
        OR: [{ userId1: userId }, { userId2: userId }],
        blockedAt: null,
      },
      orderBy: { similarityScore: 'desc' },
      take: MAX_TWINS_PER_USER,
    });

    return matches.map((m) => ({
      matchId: m.id,
      similarityScore: m.similarityScore,
      sharedBuckets: m.sharedBuckets,
      accepted: m.userId1 === userId ? m.user1Accepted : m.user2Accepted,
      computedAt: m.computedAt,
    }));
  }

  /** Accept a twin match */
  async acceptMatch(userId: string, matchId: string): Promise<void> {
    const match = await prisma.twinMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new Error('Match not found');
    if (match.userId1 !== userId && match.userId2 !== userId) {
      throw new Error('Not your match');
    }

    const field = match.userId1 === userId ? 'user1Accepted' : 'user2Accepted';
    await prisma.twinMatch.update({
      where: { id: matchId },
      data: { [field]: true },
    });
  }

  /** Block/report a twin match — permanent, prevents re-matching */
  async blockMatch(userId: string, matchId: string): Promise<void> {
    const match = await prisma.twinMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new Error('Match not found');
    if (match.userId1 !== userId && match.userId2 !== userId) {
      throw new Error('Not your match');
    }

    // Delete associated recommendations
    await prisma.twinRecommendation.deleteMany({ where: { matchId } });

    // Block the match
    await prisma.twinMatch.update({
      where: { id: matchId },
      data: { blockedAt: new Date(), reportedBy: userId },
    });
  }

  /** Get recommendations from twins */
  async getRecommendations(userId: string) {
    return prisma.twinRecommendation.findMany({
      where: {
        recipientId: userId,
        dismissedAt: null,
        actedOn: false,
      },
      orderBy: { relevanceScore: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        body: true,
        platform: true,
        relevanceScore: true,
        createdAt: true,
        matchId: true,
      },
    });
  }

  /** Create a recommendation for a twin (called by scoring engine) */
  async createRecommendation(
    matchId: string,
    recipientId: string,
    data: { title: string; body: string; platform?: string; relevanceScore: number },
  ): Promise<void> {
    // Respect per-match recommendation limit
    const existing = await prisma.twinRecommendation.count({
      where: { matchId, recipientId, dismissedAt: null, actedOn: false },
    });
    if (existing >= MAX_RECOMMENDATIONS_PER_MATCH) return;

    await prisma.twinRecommendation.create({
      data: { matchId, recipientId, ...data },
    });
  }

  /** Dismiss a recommendation */
  async dismissRecommendation(userId: string, recommendationId: string): Promise<void> {
    await prisma.twinRecommendation.updateMany({
      where: { id: recommendationId, recipientId: userId },
      data: { dismissedAt: new Date() },
    });
  }

  /** Mark a recommendation as acted on */
  async actOnRecommendation(userId: string, recommendationId: string): Promise<void> {
    await prisma.twinRecommendation.updateMany({
      where: { id: recommendationId, recipientId: userId },
      data: { actedOn: true },
    });
  }

  /** Toggle discoverability */
  async setDiscoverable(userId: string, isDiscoverable: boolean): Promise<void> {
    await prisma.tasteProfile.update({
      where: { userId },
      data: { isDiscoverable },
    });
  }
}

// ── Similarity Scoring ─────────────────────────────────────────────────────

/** Jaccard similarity on two string sets */
function jaccardSimilarity(a: string[], b: string[]): { score: number; sharedCount: number } {
  const setA = new Set(a);
  const setB = new Set(b);

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  if (union === 0) return { score: 0, sharedCount: 0 };

  return {
    score: intersection / union,
    sharedCount: intersection,
  };
}
