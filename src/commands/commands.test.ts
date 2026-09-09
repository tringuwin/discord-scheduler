import { describe, expect, it } from 'vitest';
import { commands } from './index';

describe('slash command definitions', () => {
  it('every command serializes with a valid name and description', () => {
    for (const command of commands) {
      const json = command.data.toJSON();
      expect(json.name).toMatch(/^[\w-]+$/);
      expect(typeof json.description).toBe('string');
      expect((json.description ?? '').length).toBeGreaterThan(0);
    }
  });

  it('command names are unique', () => {
    const names = commands.map((c) => c.data.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('registers exactly the expected commands', () => {
    expect(commands.map((c) => c.data.name).sort()).toEqual(
      ['availability', 'book', 'config', 'my-bookings', 'my-schedule'].sort(),
    );
  });
});
