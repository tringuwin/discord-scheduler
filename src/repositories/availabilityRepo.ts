import type { AvailabilityRule } from '@prisma/client';
import { prisma } from '../db/client';

/** Data access for admins' recurring weekly availability rules. */
export const availabilityRepo = {
  /** Create one rule per selected day, atomically. */
  addRules(
    guildId: string,
    adminId: string,
    days: number[],
    startMin: number,
    endMin: number,
    tz: string,
  ): Promise<AvailabilityRule[]> {
    return prisma.$transaction(
      days.map((dayOfWeek) =>
        prisma.availabilityRule.create({
          data: { guildId, adminId, dayOfWeek, startMin, endMin, tz },
        }),
      ),
    );
  },

  listForAdmin(guildId: string, adminId: string): Promise<AvailabilityRule[]> {
    return prisma.availabilityRule.findMany({
      where: { guildId, adminId },
      orderBy: [{ dayOfWeek: 'asc' }, { startMin: 'asc' }],
    });
  },

  async clearForAdmin(guildId: string, adminId: string): Promise<number> {
    const result = await prisma.availabilityRule.deleteMany({ where: { guildId, adminId } });
    return result.count;
  },
};
