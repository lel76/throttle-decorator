import { test } from 'node:test';
import assert from 'node:assert/strict';
import { throttle } from '../src/index.js';

function createClock() {
  const state = { t: 1000 };
  return {
    now: () => state.t,
    advance(ms) { state.t += ms; },
    set(ms) { state.t = ms; },
    value: () => state.t,
  };
}

function flushTimers(ms) {
  // eslint-disable-next-line no-constant-condition
  let remaining = ms;
  while (remaining > 0) {
    const step = Math.min(remaining, 1);
    const before = process.uptime();
    const deadline = before + step / 1000;
    while (process.uptime() < deadline) { /* spin */ }
    remaining -= step;
  }
}

function advanceTimers(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await test('leading call fires immediately on first invocation', () => {
  const clock = createClock();
  let calls = 0;
  const fn = throttle(() => ++calls, 100, { now: clock.now });

  const result = fn();
  assert.equal(calls, 1);
  assert.equal(result, 1);
});

await test('second call within interval is dropped, trailing scheduled', async () => {
  const clock = createClock();
  const calls = [];
  const fn = throttle((n) => { calls.push(n); return n; }, 100, { now: clock.now });

  fn(1);
  clock.advance(50);
  const r2 = fn(2);
  assert.equal(r2, undefined);
  assert.deepEqual(calls, [1]);

  await advanceTimers(50);
  assert.deepEqual(calls, [1, 2]);
});

await test('trailing call uses most recent arguments', async () => {
  const clock = createClock();
  const calls = [];
  const fn = throttle((n) => { calls.push(n); return n; }, 100, { now: clock.now });

  fn(1);
  clock.advance(10);
  fn(2);
  clock.advance(10);
  fn(3);
  clock.advance(10);
  fn(4);

  assert.deepEqual(calls, [1]);
  await advanceTimers(90);
  assert.deepEqual(calls, [1, 4]);
});

await test('after interval elapses, leading edge fires again', async () => {
  const clock = createClock();
  const calls = [];
  const fn = throttle((n) => calls.push(n), 100, { now: clock.now });

  fn(1);
  clock.advance(100);
  fn(2);
  assert.deepEqual(calls, [1, 2]);
});

await test('cancel prevents pending trailing call', async () => {
  const clock = createClock();
  const calls = [];
  const fn = throttle((n) => calls.push(n), 100, { now: clock.now });

  fn(1);
  clock.advance(10);
  fn(2);
  fn.cancel();
  await advanceTimers(200);
  assert.deepEqual(calls, [1]);
});

await test('cancel resets internal state so next call is leading', () => {
  const clock = createClock();
  let calls = 0;
  const fn = throttle(() => ++calls, 100, { now: clock.now });

  fn();
  clock.advance(10);
  fn();
  fn.cancel();

  clock.advance(5);
  fn();
  assert.equal(calls, 2);
});

await test('flush executes pending trailing call immediately', () => {
  const clock = createClock();
  const calls = [];
  const fn = throttle((n) => { calls.push(n); return n * 10; }, 100, { now: clock.now });

  fn(1);
  clock.advance(10);
  const r2 = fn(2);
  assert.equal(r2, undefined);
  const flushed = fn.flush();
  assert.deepEqual(calls, [1, 2]);
  assert.equal(flushed, 20);
});

await test('flush when no pending call returns last leading result', () => {
  const clock = createClock();
  const fn = throttle((n) => n * 10, 100, { now: clock.now });

  const r1 = fn(3);
  assert.equal(r1, 30);
  assert.equal(fn.flush(), 30);
});

await test('leading call returns fn return value synchronously', () => {
  const clock = createClock();
  const fn = throttle((x) => x + 1, 50, { now: clock.now });

  assert.equal(fn(5), 6);
});

await test('preserves this binding on leading call', () => {
  const clock = createClock();
  const obj = {
    base: 100,
    method: throttle(function (n) { return this.base + n; }, 100, { now: clock.now }),
  };

  assert.equal(obj.method(5), 105);
});

await test('preserves this binding on trailing call', async () => {
  const clock = createClock();
  const seen = [];
  const obj = {
    name: 'ctx',
    method: throttle(function (n) { seen.push({ name: this.name, n }); return n; }, 100, { now: clock.now }),
  };

  obj.method(1);
  clock.advance(10);
  obj.method(2);
  await advanceTimers(90);

  assert.deepEqual(seen, [
    { name: 'ctx', n: 1 },
    { name: 'ctx', n: 2 },
  ]);
});

await test('intervalMs of 0 allows every call through immediately', () => {
  const clock = createClock();
  const calls = [];
  const fn = throttle((n) => { calls.push(n); return n; }, 0, { now: clock.now });

  fn(1);
  fn(2);
  fn(3);
  assert.deepEqual(calls, [1, 2, 3]);
});

await test('throws on non-function fn', () => {
  assert.throws(() => throttle('nope', 100), { name: 'TypeError' });
});

await test('throws on negative intervalMs', () => {
  assert.throws(() => throttle(() => {}, -1), { name: 'TypeError' });
});
