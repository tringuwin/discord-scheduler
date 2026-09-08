import { PermissionFlagsBits, type GuildMember } from 'discord.js';

/**
 * Whether a member may manage availability / act as a bookable admin.
 * Server managers (Manage Server permission) always qualify; otherwise the
 * member must hold the server's configured admin role.
 */
export function isAdmin(member: GuildMember, adminRoleId: string | null): boolean {
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (!adminRoleId) return false;
  return member.roles.cache.has(adminRoleId);
}
