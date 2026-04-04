'use strict';

/**
 * tests/__mocks__/ioredis.js
 *
 * Global ioredis mock — used by all test files that do NOT provide their own
 * jest.mock('ioredis', factory) call.
 *
 * Mapped via moduleNameMapper in jest config (package.json).
 * Prevents real TCP connections and the "Force exiting Jest / exit code 1"
 * caused by ioredis keeping the event loop alive after tests finish.
 *
 * sessionContextService.test.js uses its own jest.mock('ioredis', ...) which
 * takes precedence over this mapper for that file only.
 */

const store = new Map();

class RedisMock {
  constructor() {
    this.status = 'ready';
  }

  async get(key) {
    return store.get(key) ?? null;
  }

  async setex(key, _ttl, value) {
    store.set(key, value);
    return 'OK';
  }

  // No-op event listener — ioredis emits 'connect', 'error', 'reconnecting'
  on() {
    return this;
  }

  async quit() {
    this.status = 'end';
    return 'OK';
  }

  disconnect() {
    this.status = 'end';
  }
}

module.exports = RedisMock;
