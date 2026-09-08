import type { Guild, Prisma } from '@prisma/client';
import { prisma } from '../db/client';

/** Data access for per-server configuration. */
export const guildRepo = {
  /** Return the guild config, creating a default row if none exists yet. */
  ensure(guildId: string): Promise<Guild> {
    return prisma.guild.upsert({
      where: { id: guildId },
      update: {},
      create: { id: guildId },
    });
  },

  get(guildId: string): Promise<Guild | null> {
    return prisma.guild.findUnique({ where: { id: guildId } });
  },

  update(guildId: string, data: Prisma.GuildUpdateInput): Promise<Guild> {
    return prisma.guild.update({ where: { id: guildId }, data });
  },
};
