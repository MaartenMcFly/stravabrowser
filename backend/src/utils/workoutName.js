/**
 * Extracts the workout name from a Strava activity title.
 *
 * Rules:
 *   "TrainerRoad: <name> [on <route>]"  → <name>   (strips trailing " on ..." suffix)
 *   "WAHOO SYSTM: <name>"               → <name>
 *   anything else                        → title unchanged
 */
export function extractWorkoutName(title) {
  if (!title) return title;

  if (title.startsWith('Zwift - ')) {
    title = title.slice('Zwift - '.length);
  }

  if (title.startsWith('TrainerRoad: ')) {
    let name = title.slice('TrainerRoad: '.length);
    const onIdx = name.indexOf(' on ');
    if (onIdx !== -1) name = name.slice(0, onIdx);
    return name.trim();
  }

  if (title.startsWith('WAHOO SYSTM: ')) {
    return title.slice('WAHOO SYSTM: '.length).trim();
  }

  return title;
}
