export const REWARD_COST_KM = 5;
export const ROLLOVER_CAP_KM = 5;
export const MAX_RUN_KM = 100;

/** Weekly reset happens every Sunday at 12:00 noon, Europe/London time (DST-aware). */
export const RESET_TIMEZONE = 'Europe/London';
export const RESET_WEEKDAY = 0; // JS Date.getDay(): 0 = Sunday
export const RESET_HOUR = 12;
export const RESET_MINUTE = 0;

export type RewardType = 'class' | 'coffee' | 'meal';

export const REWARDS: { type: RewardType; label: string }[] = [
  { type: 'class', label: 'Fitness class' },
  { type: 'coffee', label: 'Coffee' },
  { type: 'meal', label: 'Meal out' },
];
