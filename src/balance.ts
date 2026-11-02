import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { RESET_HOUR, RESET_MINUTE, RESET_TIMEZONE, ROLLOVER_CAP_KM } from './constants';

export type EventType = 'run' | 'class' | 'coffee' | 'meal';

export interface RunEvent {
  id: string;
  type: EventType;
  /** Positive amount: km logged for a run, or km cost for a reward. */
  km: number;
  /** ms since epoch (UTC). */
  timestamp: number;
}

// All internal arithmetic is done in tenths of a km (integers) to avoid
// floating point drift (e.g. 0.1 + 0.2 !== 0.3) when replaying long event logs.
const toTenths = (km: number): number => Math.round(km * 10);
const fromTenths = (tenths: number): number => tenths / 10;

function eventDeltaTenths(event: RunEvent): number {
  const amountTenths = toTenths(event.km);
  return event.type === 'run' ? amountTenths : -amountTenths;
}

/**
 * Returns the UTC ms timestamp of the next weekly reset (Sunday 12:00 noon,
 * Europe/London) that is strictly after `afterMs`. DST-aware: the Europe/London
 * UTC offset used is whichever is in effect on that particular Sunday.
 */
export function nextResetBoundary(afterMs: number): number {
  const zoned = toZonedTime(afterMs, RESET_TIMEZONE);
  const weekday = zoned.getDay();
  const daysUntilSunday = (7 - weekday) % 7;

  const candidateLocal = new Date(
    zoned.getFullYear(),
    zoned.getMonth(),
    zoned.getDate() + daysUntilSunday,
    RESET_HOUR,
    RESET_MINUTE,
    0,
    0
  );
  let candidateUtcMs = fromZonedTime(candidateLocal, RESET_TIMEZONE).getTime();

  if (candidateUtcMs <= afterMs) {
    candidateLocal.setDate(candidateLocal.getDate() + 7);
    candidateUtcMs = fromZonedTime(candidateLocal, RESET_TIMEZONE).getTime();
  }

  return candidateUtcMs;
}

function applyRolloverCapTenths(balanceTenths: number): number {
  const capTenths = toTenths(ROLLOVER_CAP_KM);
  return balanceTenths > capTenths ? capTenths : balanceTenths;
}

/**
 * Derives the current balance (in km) by replaying the event log in
 * chronological order and applying the weekly rollover cap at every
 * Sunday-12:00 Europe/London boundary that falls between the first event
 * and `nowMs` — including any boundaries missed while the app was closed.
 */
export function computeBalanceKm(events: RunEvent[], nowMs: number): number {
  if (events.length === 0) return 0;

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  let balanceTenths = 0;
  let cursorMs = sorted[0].timestamp;
  let boundaryMs = nextResetBoundary(cursorMs);

  for (const event of sorted) {
    // A reset that lands exactly on an event's timestamp applies before that event.
    while (boundaryMs <= event.timestamp) {
      balanceTenths = applyRolloverCapTenths(balanceTenths);
      cursorMs = boundaryMs;
      boundaryMs = nextResetBoundary(cursorMs);
    }
    balanceTenths += eventDeltaTenths(event);
    cursorMs = event.timestamp;
  }

  while (boundaryMs <= nowMs) {
    balanceTenths = applyRolloverCapTenths(balanceTenths);
    cursorMs = boundaryMs;
    boundaryMs = nextResetBoundary(cursorMs);
  }

  return fromTenths(balanceTenths);
}

/** Rounds a km value to 1 decimal place for display, avoiding float artifacts like 4.9999999. */
export function roundKm(km: number): number {
  return fromTenths(toTenths(km));
}
