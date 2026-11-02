import { computeBalanceKm, nextResetBoundary, RunEvent } from '../src/balance';

const at = (iso: string): number => new Date(iso).getTime();

let nextId = 0;
function ev(type: RunEvent['type'], km: number, iso: string): RunEvent {
  nextId += 1;
  return { id: `e${nextId}`, type, km, timestamp: at(iso) };
}

describe('computeBalanceKm', () => {
  it('returns 0 for an empty log', () => {
    expect(computeBalanceKm([], at('2024-01-08T12:00:00Z'))).toBe(0);
  });

  it('adds decimal run amounts without floating point drift', () => {
    const events = [
      ev('run', 2.3, '2024-01-08T10:00:00Z'), // Monday
      ev('run', 1.4, '2024-01-08T11:00:00Z'),
    ];
    // Raw float addition (2.3 + 1.4) is 3.6999999999999997 - this must come out exact.
    expect(computeBalanceKm(events, at('2024-01-08T12:00:00Z'))).toBe(3.7);
  });

  it('goes negative (into debt) when rewards exceed the logged km', () => {
    const events = [
      ev('run', 2, '2024-01-08T10:00:00Z'),
      ev('coffee', 5, '2024-01-08T11:00:00Z'),
    ];
    expect(computeBalanceKm(events, at('2024-01-08T12:00:00Z'))).toBe(-3);
  });

  it('never wipes debt at a weekly reset', () => {
    const events = [
      ev('run', 2, '2024-01-08T10:00:00Z'), // Monday
      ev('coffee', 5, '2024-01-09T10:00:00Z'), // Tuesday -> balance -3
    ];
    // "now" is after the following Sunday 12:00 London reset (2024-01-14T12:00:00Z, GMT).
    const now = at('2024-01-15T09:00:00Z');
    expect(computeBalanceKm(events, now)).toBe(-3);
  });

  it('caps a surplus above 5 km down to 5 at the weekly reset', () => {
    const events = [ev('run', 12, '2024-01-08T10:00:00Z')]; // Monday, balance 12
    const now = at('2024-01-15T09:00:00Z'); // after the Sunday 2024-01-14 12:00 reset
    expect(computeBalanceKm(events, now)).toBe(5);
  });

  it('leaves a balance of exactly 5 km unchanged at a reset', () => {
    const events = [ev('run', 5, '2024-01-08T10:00:00Z')];
    const now = at('2024-01-15T09:00:00Z');
    expect(computeBalanceKm(events, now)).toBe(5);
  });

  it('leaves a balance at or below 5 km unchanged at a reset (no-op cap)', () => {
    const events = [ev('run', 4.2, '2024-01-08T10:00:00Z')];
    const now = at('2024-01-15T09:00:00Z');
    expect(computeBalanceKm(events, now)).toBe(4.2);
  });

  it('only rolls over 5 km across multiple missed weeks, however many resets passed', () => {
    const events = [ev('run', 30, '2024-01-08T10:00:00Z')]; // Monday, balance 30
    // "now" is many weeks later - several Sunday 12:00 boundaries have passed
    // without the app ever being opened in between.
    const now = at('2024-02-05T09:00:00Z');
    expect(computeBalanceKm(events, now)).toBe(5);
  });

  it('keeps accumulating normally across weeks once capped at 5', () => {
    const events = [
      ev('run', 30, '2024-01-08T10:00:00Z'), // capped to 5 by the 2024-01-14 reset
      ev('run', 2, '2024-01-20T10:00:00Z'), // logged the following Saturday -> 5 + 2 = 7
    ];
    const now = at('2024-01-20T12:00:00Z'); // same day, before the next reset
    expect(computeBalanceKm(events, now)).toBe(7);
  });

  it('caps a run logged just before the Sunday 12:00 boundary', () => {
    const events = [ev('run', 10, '2024-01-14T11:59:59.000Z')]; // 1s before the boundary
    const now = at('2024-01-14T12:00:01.000Z');
    expect(computeBalanceKm(events, now)).toBe(5);
  });

  it('does not retroactively cap a run logged exactly at or just after the boundary', () => {
    const events = [
      ev('run', 10, '2024-01-14T11:59:59.000Z'), // before -> gets capped to 5
      ev('run', 10, '2024-01-14T12:00:00.000Z'), // exactly at the boundary -> added after the cap
    ];
    const now = at('2024-01-14T12:00:01.000Z');
    expect(computeBalanceKm(events, now)).toBe(15); // 5 (capped) + 10 (uncapped)
  });

  it('does not cap a run logged 1ms after the boundary either', () => {
    const events = [
      ev('run', 10, '2024-01-14T11:59:59.000Z'),
      ev('run', 10, '2024-01-14T12:00:00.001Z'),
    ];
    const now = at('2024-01-14T12:00:01.000Z');
    expect(computeBalanceKm(events, now)).toBe(15);
  });

  it('handles the March clock change (GMT -> BST) when capping at the reset', () => {
    // Sunday 2024-03-31 is the day the UK springs forward; by noon it is already BST.
    const events = [ev('run', 10, '2024-03-29T10:00:00Z')]; // Friday before, balance 10
    const now = at('2024-04-01T09:00:00Z'); // after the 2024-03-31T11:00:00Z (BST) reset
    expect(computeBalanceKm(events, now)).toBe(5);
  });

  it('handles the October clock change (BST -> GMT) when capping at the reset', () => {
    // Sunday 2024-10-27 is the day the UK falls back; by noon it is already GMT.
    const events = [ev('run', 10, '2024-10-25T10:00:00Z')]; // Friday before, balance 10
    const now = at('2024-10-28T09:00:00Z'); // after the 2024-10-27T12:00:00Z (GMT) reset
    expect(computeBalanceKm(events, now)).toBe(5);
  });

  it('recomputes correctly after deleting an event from the log', () => {
    const events = [
      ev('run', 10, '2024-01-08T10:00:00Z'),
      ev('coffee', 5, '2024-01-08T11:00:00Z'),
      ev('run', 3, '2024-01-08T12:00:00Z'),
    ];
    const now = at('2024-01-08T13:00:00Z');
    expect(computeBalanceKm(events, now)).toBe(8); // 10 - 5 + 3

    const afterDeletingCoffee = events.filter((e) => e.type !== 'coffee');
    expect(computeBalanceKm(afterDeletingCoffee, now)).toBe(13); // 10 + 3
  });

  it('recomputes correctly after undoing the last event', () => {
    const events = [
      ev('run', 10, '2024-01-08T10:00:00Z'),
      ev('coffee', 5, '2024-01-08T11:00:00Z'),
    ];
    const now = at('2024-01-08T13:00:00Z');
    expect(computeBalanceKm(events, now)).toBe(5);

    const afterUndo = events.slice(0, -1); // "undo last" removes the most recently added event
    expect(computeBalanceKm(afterUndo, now)).toBe(10);
  });
});

describe('nextResetBoundary', () => {
  it('finds the following Sunday noon in winter (GMT, UTC+0)', () => {
    // Monday 2024-01-08 -> next reset is Sunday 2024-01-14 12:00 GMT.
    expect(nextResetBoundary(at('2024-01-08T10:00:00Z'))).toBe(at('2024-01-14T12:00:00.000Z'));
  });

  it('finds the following Sunday noon in summer (BST, UTC+1)', () => {
    // Monday 2024-07-08 -> next reset is Sunday 2024-07-14 11:00 UTC (12:00 BST).
    expect(nextResetBoundary(at('2024-07-08T10:00:00Z'))).toBe(at('2024-07-14T11:00:00.000Z'));
  });

  it('returns the following week when called exactly on a boundary (strictly after)', () => {
    const boundary = at('2024-01-14T12:00:00.000Z');
    expect(nextResetBoundary(boundary)).toBe(at('2024-01-21T12:00:00.000Z'));
  });

  it('jumps the UTC offset forward across the March clock change', () => {
    expect(nextResetBoundary(at('2024-03-24T12:00:01.000Z'))).toBe(at('2024-03-31T11:00:00.000Z'));
  });

  it('jumps the UTC offset back across the October clock change', () => {
    expect(nextResetBoundary(at('2024-10-20T11:00:01.000Z'))).toBe(at('2024-10-27T12:00:00.000Z'));
  });
});
