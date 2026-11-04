// The promotion catalog in tests/fixtures/data is a snapshot whose promos expire, so
// every test starts at this moment and time runs normally from there. Move this date
// to a day when the promos are valid whenever the catalog is renewed.
export const FIXED_NOW = "2026-10-30T12:00:00-03:00";

/**
 * Replaces the global Date with one shifted by the given offset. It also runs inside
 * the browser as an init script, so it cannot use anything outside its own body.
 */
export function moveClock(offset: number | (() => number)): void {
  const Real = globalThis.Date;
  const shiftedNow = (): number => Real.now() + (typeof offset === "number" ? offset : offset());
  const Moved = new Proxy(Real, {
    construct: (target, args: unknown[], newTarget: new () => object): object =>
      Reflect.construct(target, args.length > 0 ? args : [shiftedNow()], newTarget),
    apply: (target) => new target(shiftedNow()).toString(),
    get: (target, key) => (key === "now" ? shiftedNow : Reflect.get(target, key)),
  });
  Real.prototype.constructor = Moved;
  globalThis.Date = Moved;
}

const realNow = Date.now.bind(Date);
let workerOffset = 0;
let workerClockInstalled = false;

/** Puts the worker at FIXED_NOW and returns the offset browsers of this test must use. */
export function restartClock(): number {
  workerOffset = new Date(FIXED_NOW).getTime() - realNow();
  if (!workerClockInstalled) {
    moveClock(() => workerOffset);
    workerClockInstalled = true;
  }
  return workerOffset;
}
