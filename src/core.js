/**
 * Create a throttled wrapper around `fn`.
 *
 * The wrapper guarantees at most one invocation of `fn` per `intervalMs` (as
 * measured by the supplied `now` clock). Leading-edge semantics: the first call
 * within a quiet period fires immediately. Calls that arrive while a call is
 * "in flight" (i.e. within the same interval window) are coalesced into a
 * single trailing call that fires once the interval elapses. Intermediate
 * arguments are dropped; the trailing call uses the arguments from the most
 * recent invocation.
 *
 * A `now` clock function is taken instead of reading Date.now() directly so
 * that tests can be deterministic — every time-dependent branch is observable
 * and controllable through a fake clock. Production callers pass `Date.now`.
 *
 * `fn`'s return value is captured synchronously for the leading call and for
 * the trailing call, and is retrievable via `wrapper.flush()` for the trailing
 * call. Returning `undefined` from `fn` is a sentinel meaning "no value was
 * produced yet"; see README for the implication.
 *
 * @param {(this: ThisArg, ...args: any[]) => R} fn
 * @param {number} intervalMs
 * @param {{ now?: () => number }} [options]
 * @returns {{
 *   (this: ThisArg, ...args: any[]) => R | undefined;
 *   cancel: () => void;
 *   flush: () => R | undefined;
 * }}
 * @template ThisArg, R
 */
export function throttle(fn, intervalMs, options) {
  if (typeof fn !== 'function') {
    throw new TypeError('throttle: fn must be a function');
  }
  if (typeof intervalMs !== 'number' || !Number.isFinite(intervalMs) || intervalMs < 0) {
    throw new TypeError('throttle: intervalMs must be a non-negative finite number');
  }

  const now = options && typeof options.now === 'function' ? options.now : Date.now;

  let lastExecTime = null;
  let trailingArgs = null;
  let trailingThis = undefined;
  let trailingResult = undefined;
  let timerId = null;

  function executeTrailing() {
    const ctx = trailingThis;
    const args = trailingArgs;
    trailingThis = undefined;
    trailingArgs = null;
    timerId = null;
    lastExecTime = now();
    trailingResult = fn.apply(ctx, args);
  }

  function wrapped() {
    const t = now();
    const canRunLeading = lastExecTime === null || t - lastExecTime >= intervalMs;

    if (canRunLeading) {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
        trailingArgs = null;
        trailingThis = undefined;
      }
      lastExecTime = t;
      trailingResult = fn.apply(this, arguments);
      return trailingResult;
    }

    trailingArgs = Array.prototype.slice.call(arguments);
    trailingThis = this;
    if (timerId === null) {
      const delay = Math.max(0, intervalMs - (t - lastExecTime));
      timerId = setTimeout(executeTrailing, delay);
    }
    return undefined;
  }

  wrapped.cancel = function cancel() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    lastExecTime = null;
    trailingArgs = null;
    trailingThis = undefined;
    trailingResult = undefined;
  };

  wrapped.flush = function flush() {
    if (timerId !== null) {
      clearTimeout(timerId);
      executeTrailing();
    }
    return trailingResult;
  };

  return wrapped;
}
