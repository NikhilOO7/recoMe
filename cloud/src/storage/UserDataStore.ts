import { prisma } from '../db.js';
import type { User, Tier } from '@prisma/client';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  tier: Tier;
  createdAt: string;
  lastSyncAt: string | null;
}

export class UserDataStore {
  async getProfile(userId: string): Promise<UserProfile | null> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    return this.toProfile(user);
  }

  async updateProfile(
    userId: string,
    data: { displayName?: string; avatarUrl?: string },
  ): Promise<UserProfile | null> {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
    });
    return this.toProfile(user);
  }

  async deleteAccount(userId: string): Promise<void> {
    // Cascade deletes handle related records (SyncState, Device, RefreshToken)
    await prisma.user.delete({ where: { id: userId } });
  }

  async getDevices(userId: string) {
    return prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async registerDevice(userId: string, name: string, fingerprint: string) {
    return prisma.device.upsert({
      where: { fingerprint },
      create: { userId, name, fingerprint },
      update: { lastSeenAt: new Date(), name },
    });
  }

  async removeDevice(userId: string, deviceId: string) {
    await prisma.device.deleteMany({
      where: { id: deviceId, userId },
    });
  }

  async getDashboardStats(userId: string) {
    const [syncStates, user] = await Promise.all([
      prisma.syncState.findMany({ where: { userId } }),
      prisma.user.findUnique({ where: { id: userId } }),
    ]);

    let preferenceCount = 0;
    let trackedCount = 0;
    for (const state of syncStates) {
      if (state.dataType === 'PREFERENCES') preferenceCount = state.version;
      if (state.dataType === 'PLATFORM_SETTINGS') trackedCount = state.version;
    }

    return {
      preferenceCount,
      trackedCount,
      insightCount: 0,
      lastSync: user?.lastSyncAt?.getTime() ?? null,
    };
  }

  async getInsights(_userId: string) {
    // Insights are generated from preference + browsing data
    // Placeholder — will be populated by the brain's insight engine
    return [];
  }

  private toProfile(user: User): UserProfile {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      tier: user.tier,
      createdAt: user.createdAt.toISOString(),
      lastSyncAt: user.lastSyncAt?.toISOString() ?? null,
    };
  }
}
