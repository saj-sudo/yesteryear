import { describe, expect, it } from 'vitest';
import { isRateLimitError, withBackoff } from '../../src/providers/capacities/rateLimit';

const rateLimited = Object.assign(new Error('slow down'), {
  code: 'cap_rate_limit_exceeded',
  status: 429,
});

describe('withBackoff', () => {
  it('retries a simulated 429 with growing delays, then succeeds', async () => {
    const delays: number[] = [];
    let calls = 0;
    const result = await withBackoff(
      () => {
        calls += 1;
        return calls < 3 ? Promise.reject(rateLimited) : Promise.resolve('ok');
      },
      {
        sleep: (ms) => {
          delays.push(ms);
          return Promise.resolve();
        },
        random: () => 1, // deterministic: full base delay
      },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(delays).toEqual([1000, 2000]);
  });

  it('gives up after maxRetries and rethrows the 429', async () => {
    let calls = 0;
    await expect(
      withBackoff(
        () => {
          calls += 1;
          return Promise.reject(rateLimited);
        },
        { maxRetries: 2, sleep: () => Promise.resolve() },
      ),
    ).rejects.toBe(rateLimited);
    expect(calls).toBe(3);
  });

  it('does not retry other errors', async () => {
    let calls = 0;
    const boom = new Error('not found');
    await expect(
      withBackoff(() => {
        calls += 1;
        return Promise.reject(boom);
      }),
    ).rejects.toBe(boom);
    expect(calls).toBe(1);
  });

  it('caps the delay at maxDelayMs', async () => {
    const delays: number[] = [];
    let calls = 0;
    await withBackoff(
      () => {
        calls += 1;
        return calls < 5 ? Promise.reject(rateLimited) : Promise.resolve('ok');
      },
      {
        maxRetries: 4,
        maxDelayMs: 2500,
        sleep: (ms) => {
          delays.push(ms);
          return Promise.resolve();
        },
        random: () => 1,
      },
    );
    expect(delays).toEqual([1000, 2000, 2500, 2500]);
  });
});

describe('isRateLimitError', () => {
  it('recognizes the SDK error code and raw 429s, nothing else', () => {
    expect(isRateLimitError(rateLimited)).toBe(true);
    expect(isRateLimitError({ status: 429 })).toBe(true);
    expect(isRateLimitError({ code: 'cap_not_found' })).toBe(false);
    expect(isRateLimitError(new Error('x'))).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
  });
});
