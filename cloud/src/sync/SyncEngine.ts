import { prisma } from '../db.js';
import type { SyncDataType } from '@prisma/client';

export interface PushPayload {
  dataType: SyncDataType;
  clientVersion: number;
  encryptedData: Buffer;
  iv: Buffer;
  authTag: Buffer;
  checksum: string;
}

export interface PushResult {
  version: number;
  conflict: boolean;
  serverVersion?: number;
  serverData?: {
    encryptedData: string;
    iv: string;
    authTag: string;
    checksum: string;
  };
}

export interface PullResult {
  hasUpdate: boolean;
  version: number;
  encryptedData?: string;
  iv?: string;
  authTag?: string;
  checksum?: string;
}

export interface SyncStatus {
  dataTypes: Array<{
    dataType: SyncDataType;
    version: number;
    lastModified: string;
    checksum: string | null;
  }>;
}

// Tier-based sync: FREE gets PREFERENCES only, PRO gets all, PREMIUM gets all
const FREE_SYNC_TYPES: Set<SyncDataType> = new Set(['PREFERENCES']);

export class SyncEngine {
  /** Pull latest state from server */
  async pull(userId: string, dataType: SyncDataType, clientVersion: number): Promise<PullResult> {
    const state = await prisma.syncState.findUnique({
      where: { userId_dataType: { userId, dataType } },
    });

    if (!state || state.version <= clientVersion) {
      return { hasUpdate: false, version: state?.version ?? 0 };
    }

    return {
      hasUpdate: true,
      version: state.version,
      encryptedData: state.encryptedData
        ? Buffer.from(state.encryptedData).toString('base64')
        : undefined,
      iv: state.iv ? Buffer.from(state.iv).toString('base64') : undefined,
      authTag: state.authTag ? Buffer.from(state.authTag).toString('base64') : undefined,
      checksum: state.checksum ?? undefined,
    };
  }

  /** Push client changes — optimistic concurrency via version check */
  async push(userId: string, payload: PushPayload): Promise<PushResult> {
    const existing = await prisma.syncState.findUnique({
      where: { userId_dataType: { userId, dataType: payload.dataType } },
    });

    // Conflict: server has newer version than client expected
    if (existing && existing.version > payload.clientVersion) {
      return {
        version: existing.version,
        conflict: true,
        serverVersion: existing.version,
        serverData: existing.encryptedData
          ? {
              encryptedData: Buffer.from(existing.encryptedData).toString('base64'),
              iv: existing.iv ? Buffer.from(existing.iv).toString('base64') : '',
              authTag: existing.authTag ? Buffer.from(existing.authTag).toString('base64') : '',
              checksum: existing.checksum ?? '',
            }
          : undefined,
      };
    }

    const newVersion = (existing?.version ?? 0) + 1;

    await prisma.syncState.upsert({
      where: { userId_dataType: { userId, dataType: payload.dataType } },
      create: {
        userId,
        dataType: payload.dataType,
        version: newVersion,
        encryptedData: new Uint8Array(payload.encryptedData),
        iv: new Uint8Array(payload.iv),
        authTag: new Uint8Array(payload.authTag),
        checksum: payload.checksum,
        lastModified: new Date(),
      },
      update: {
        version: newVersion,
        encryptedData: new Uint8Array(payload.encryptedData),
        iv: new Uint8Array(payload.iv),
        authTag: new Uint8Array(payload.authTag),
        checksum: payload.checksum,
        lastModified: new Date(),
      },
    });

    // Update user lastSyncAt
    await prisma.user.update({
      where: { id: userId },
      data: { lastSyncAt: new Date() },
    });

    return { version: newVersion, conflict: false };
  }

  /** Get sync status for all data types */
  async getStatus(userId: string): Promise<SyncStatus> {
    const states = await prisma.syncState.findMany({ where: { userId } });
    return {
      dataTypes: states.map((s) => ({
        dataType: s.dataType,
        version: s.version,
        lastModified: s.lastModified.toISOString(),
        checksum: s.checksum,
      })),
    };
  }

  /** Check if tier allows sync for the given data types */
  canSync(tier: string): boolean {
    // All tiers can sync at least preferences
    return true;
  }

  /** Check if a specific data type is available for a tier */
  canSyncDataType(tier: string, dataType: SyncDataType): boolean {
    if (tier === 'PRO' || tier === 'PREMIUM') return true;
    return FREE_SYNC_TYPES.has(dataType);
  }
}
