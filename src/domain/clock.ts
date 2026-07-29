/** Single clock seam for retention and recorded trade times. */
let override: (() => number) | undefined;

export function now(): number {
  return override ? override() : Date.now();
}

/** Test hook for deterministic time-based behaviour. */
export function setClockForTests(clock?: () => number): void {
  override = clock;
}
