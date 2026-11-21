// Seeded random numbers for SOLMAR HEAT.
//
// Every random choice in the city, the traffic and the missions comes from
// one of these generators, so the same seed always builds the same city.
// Nothing here reads the clock or Math.random: the game is deterministic.

/** A small, fast seeded PRNG (mulberry32). `seed` is any 32-bit integer. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A friendly wrapper around a seeded stream: uniform floats, integer ranges,
 * picks, coin flips and shuffles, all reproducible from the seed.
 */
export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    /** Next float in [0, 1). */
    next,
    /** Float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** Integer in [min, max] inclusive. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** One element of `items`, uniformly. */
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
    /** True with probability `p` (0..1). */
    chance(p) {
      return next() < p;
    },
    /** A shuffled copy of `items` (Fisher-Yates, driven by this stream). */
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
  };
}

/** Clamp `v` into [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** Linear interpolation between `a` and `b` by `t` (0..1). */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
