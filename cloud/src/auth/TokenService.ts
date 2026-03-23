import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '../db.js';
import { getConfig } from '../config.js';

export interface AccessTokenPayload {
  sub: string; // userId
  tier: string;
  deviceId?: string;
}

export interface RefreshTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class TokenService {
  /** Issue an access + refresh token pair */
  async issueTokens(userId: string, tier: string, deviceId?: string): Promise<RefreshTokenResult> {
    const config = getConfig();

    const payload: AccessTokenPayload = { sub: userId, tier, deviceId };
    const accessToken = jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_ACCESS_TTL,
    });

    const refreshTokenRaw = randomBytes(48).toString('base64url');
    const tokenHash = this.hashToken(refreshTokenRaw);

    const ttlMs = this.parseTTL(config.JWT_REFRESH_TTL);
    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        deviceId,
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      expiresIn: Math.floor(ttlMs / 1000),
    };
  }

  /** Verify an access token */
  verifyAccessToken(token: string): AccessTokenPayload | null {
    try {
      const config = getConfig();
      return jwt.verify(token, config.JWT_SECRET) as AccessTokenPayload;
    } catch {
      return null;
    }
  }

  /** Rotate a refresh token — returns new pair, revokes old */
  async rotateRefreshToken(rawToken: string): Promise<RefreshTokenResult | null> {
    const tokenHash = this.hashToken(rawToken);

    const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      // If token was already revoked, this might be token reuse — revoke all for user
      if (existing?.revokedAt) {
        await prisma.refreshToken.updateMany({
          where: { userId: existing.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return null;
    }

    // Revoke old token
    await prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    // Fetch user tier
    const user = await prisma.user.findUnique({ where: { id: existing.userId } });
    if (!user) return null;

    return this.issueTokens(user.id, user.tier, existing.deviceId ?? undefined);
  }

  /** Revoke all tokens for a user */
  async revokeAllTokens(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private parseTTL(ttl: string): number {
    const match = ttl.match(/^(\d+)([smhd])$/);
    if (!match) return 30 * 24 * 60 * 60 * 1000; // 30d default
    const [, num, unit] = match;
    const n = parseInt(num!, 10);
    const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return n * (multipliers[unit!] ?? 86400000);
  }
}
