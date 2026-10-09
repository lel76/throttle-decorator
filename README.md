# Throttle Decorator

A small, dependency-free `throttle` wrapper for ESM JavaScript. Guarantees at most one
execution of a function per configured interval, using leading-edge execution with a
coalesced trailing call.

## Usage

```js
import { throttle } from 'throttle-decorator';

const log = throttle((msg) => console.log(msg), 100, { now: Date.now });
log('first');   // runs immediately
log('second');  // dropped, scheduled as trailing after 100ms
log('third');   // dropped, replaces 'second' as the trailing call

// cancel a pending trailing call
log.cancel();

// force a pending trailing call to run now
log.flush();
```

## Why this exists

Throttling is the answer to "I have a function that fires too often (scroll handlers,
save-on-type, resize listeners) and I want at most one real execution per time window."
The two common interpretations are leading-edge and trailing-edge. This library picks
leading-edge: the first call goes through immediately so callers get a fast response,
and exactly one trailing call fires after the interval to capture the most recent
state. Intermediate calls are dropped, not queued — under a flood of calls you get one
immediate execution and one follow-up, not a backlog.

## Edge case to know about

`throttle` takes a `now` clock function (`Date.now` by default) so behaviour is
deterministic and testable. If you pass a fake clock, the trailing call still uses
`setTimeout` for scheduling; your test harness must advance real time enough for the
timer to fire (the included tests use `setTimeout`-based waits). A purely fake-timer
library is not used to keep the dependency count at zero.

`flush()` returns the result of the trailing call (or the last leading result if no
trailing call was pending). Because `undefined` is both a valid return value from the
wrapped function and the sentinel for "no synchronous value available" (calls that
were dropped and not yet flushed), there is no way to distinguish "the function ran
and returned undefined" from "the call was dropped" via the return value alone.
Use `.flush()` to force evaluation if you need the result.

## Exports

- `throttle(fn, intervalMs, options?)` — returns a wrapped function with two
  attached methods:
  - `.cancel()` — discards any pending trailing call and resets internal state.
  - `.flush()` — runs a pending trailing call immediately and returns its result.

`options.now` is an optional clock function returning epoch milliseconds; defaults to
`Date.now`.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

