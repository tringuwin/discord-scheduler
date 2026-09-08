import type { UserPref } from '@prisma/client';
import { prisma } from '../db/client';

/** Data access for a user's timezone preference. */
export const userPrefRepo = {
  get(discordId: string): Promise<UserPref | null> {
    return prisma.userPref.findUnique({ where: { discordId } });
  },

  set(discordId: string, timezone: string): Promise<UserPref> {
    return prisma.userPref.upsert({
      where: { discordId },
      update: { timezone },
      create: { discordId, timezone },
    });
  },
};
