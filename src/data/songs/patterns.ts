import type { SynthPattern } from '../../audio/songTypes';

/**
 * Pattern library for the procedural placeholder songs. 16 steps = one 4/4 bar.
 * Tokens: see SynthPattern in src/audio/songTypes.ts.
 */
const bars = (...b: string[]) => b.join('');

export const HARDCORE: Record<string, SynthPattern> = {
  intro: {
    kick: bars('................', '................', 'x.......x.......', 'x...x...x...x.x.'),
    snare: bars('................', '................', '................', '....x.......xxxx'),
    hat: bars('x...x...x...x...', 'x...x...x...x...', 'x.x.x.x.x.x.x.x.', 'x.x.x.x.x.x.....'),
    crash: bars('................', '................', 'x...............', '................'),
    guitar: bars('0---------------', '----------------', 'x.x.x.x.x.x.x.x.', 'x.x.x.x.3-3-5-5-'),
  },
  verse: {
    kick: bars('x...x..xx...x...', 'x...x..xx...x.x.'),
    snare: bars('....x.......x...', '....x.......x...'),
    hat: bars('x.x.x.x.x.x.x.x.', 'x.x.x.x.x.x.x.x.'),
    crash: bars('x...............', '................'),
    guitar: bars('x.xxx.x.3-3-x.x.', 'x.xxx.x.5-5-6-5-'),
  },
  chorus: {
    kick: bars('x...x...x...x...', 'x...x...x...x.x.'),
    snare: bars('..x...x...x...x.', '..x...x...x...xx'),
    hat: bars('x.x.x.x.x.x.x.x.', 'x.x.x.x.x.x.x.x.'),
    crash: bars('x...............', 'x...............'),
    openHat: true,
    guitar: bars('0-------5-------', '3-------7---6---'),
    lead: bars('c...c.a.c...f...', 'f...f.c.a...7...'),
  },
  breakdown: {
    kick: bars('x..x..x...x.x...', 'x..x..x...x.....'),
    snare: bars('........x.......', '........x.......'),
    hat: bars('x...x...x...x...', 'x...x...x...x...'),
    crash: bars('x...............', 'x.......x.......'),
    guitar: bars('x..x..x...x.x...', 'x..x..x...1-0-..'),
  },
  heavy: {
    kick: bars('x.......x..x....', 'x.......x.......'),
    snare: bars('........x.......', '........x.......'),
    hat: bars('................', '................'),
    crash: bars('x.......x.......', 'x.......x.......'),
    guitar: bars('x.......x..x....', 'x.......1---0---'),
  },
  outro: {
    kick: bars('x...............', '........x.x.x.x.', 'x...............', 'x...............'),
    snare: bars('................', '....x.x.xxxxxxxx', '................', '................'),
    hat: bars('................', '................', '................', '................'),
    crash: bars('x...............', '................', 'x...............', 'x...............'),
    tom: bars('................', 'x.x.x.x.........', '................', '................'),
    guitar: bars('0---------------', '----------------', '7---------------', '0---------------'),
  },
};

export const BEATDOWN: Record<string, SynthPattern> = {
  intro: {
    kick: bars('................', '................', 'x.....x.....x...', 'x.....x.....xxxx'),
    snare: bars('................', '................', '................', '........x.x.xxxx'),
    hat: bars('x...x...x...x...', 'x...x...x...x...', 'x...x...x...x...', 'x...x...x.......'),
    crash: bars('x...............', '................', 'x...............', '................'),
    guitar: bars('1---------------', '0---------------', 'x.....x.....x...', 'x.....x.....1-0-'),
  },
  verse: {
    kick: bars('x..x..x.x..x..x.', 'x..x..x.x...x...'),
    snare: bars('....x.......x...', '....x.......x...'),
    hat: bars('x.x.x.x.x.x.x.x.', 'x.x.x.x.x.x.x.x.'),
    crash: bars('x...............', '................'),
    guitar: bars('x..x..x.x..x..x.', 'x..x..x.3-..5-..'),
  },
  chorus: {
    kick: bars('x...x...x...x...', 'x...x...x..xx...'),
    snare: bars('....x.......x...', '....x.......x...'),
    hat: bars('x.x.x.x.x.x.x.x.', 'x.x.x.x.x.x.x.x.'),
    crash: bars('x.......x.......', 'x.......x.......'),
    openHat: true,
    guitar: bars('0-------3-------', '5-------6---3---'),
  },
  breakdown: {
    kick: bars('x.....x.....x...', 'x.....x.....x.x.'),
    snare: bars('........x.......', '........x.......'),
    hat: bars('x...x...x...x...', 'x...x...x...x...'),
    crash: bars('x...............', 'x.......x.......'),
    guitar: bars('x.....x.....x...', 'x.....x.....1.0.'),
  },
  heavy: {
    kick: bars('x...........x...', 'x.......x.......'),
    snare: bars('........x.......', '........x.......'),
    hat: bars('................', '................'),
    crash: bars('x.......x.......', 'x.......x.......'),
    guitar: bars('x...........1---', 'x.......6---1---'),
  },
  outro: {
    kick: bars('x...............', 'x...............'),
    snare: bars('................', '................'),
    hat: bars('................', '................'),
    crash: bars('x...............', 'x...............'),
    guitar: bars('1---------------', '0---------------'),
  },
};

export const PUNK: Record<string, SynthPattern> = {
  intro: {
    kick: bars('................', 'x...x...x...x...'),
    snare: bars('................', '..x...x...x.xxxx'),
    hat: bars('x...x...x...x...', 'x.x.x.x.x.x.....'),
    crash: bars('................', 'x...............'),
    guitar: bars('0.0.0.0.0.0.0.0.', '5.5.5.5.7.7.7.7.'),
  },
  verse: {
    kick: bars('x...x...x...x...', 'x...x...x...x...'),
    snare: bars('..x...x...x...x.', '..x...x...x...x.'),
    hat: bars('x.x.x.x.x.x.x.x.', 'x.x.x.x.x.x.x.x.'),
    crash: bars('x...............', '................'),
    guitar: bars('0.0.0.0.5.5.5.5.', '3.3.3.3.7.7.6.6.'),
  },
  chorus: {
    kick: bars('x..xx..xx..xx..x', 'x..xx..xx..xx.xx'),
    snare: bars('....x.......x...', '....x.......x...'),
    hat: bars('x.x.x.x.x.x.x.x.', 'x.x.x.x.x.x.x.x.'),
    crash: bars('x.......x.......', 'x.......x.......'),
    openHat: true,
    guitar: bars('0-------3-------', '5-------3---0---'),
    lead: bars('7.7.7.7.a.a.a.a.', 'c.c.a.a.7.7.5.5.'),
  },
  breakdown: {
    kick: bars('x.......x.x.....', 'x.......x.x.x...'),
    snare: bars('........x.......', '........x.......'),
    hat: bars('x...x...x...x...', 'x...x...x...x...'),
    crash: bars('x...............', 'x...............'),
    guitar: bars('x...x...x.x.x...', 'x...x...x.x.3-5-'),
  },
  heavy: {
    kick: bars('x.......x...x...', 'x.......x.......'),
    snare: bars('........x.......', '........x.......'),
    hat: bars('x.......x.......', 'x.......x.......'),
    crash: bars('x.......x.......', 'x.......x.......'),
    guitar: bars('x.......x...x...', '1-------0-------'),
  },
  outro: {
    kick: bars('x...x...x...x...', 'x...............'),
    snare: bars('..x...x...x.xxxx', '................'),
    hat: bars('x.x.x.x.x.x.x.x.', '................'),
    crash: bars('x...............', 'x...............'),
    guitar: bars('0.0.0.0.5.5.7.7.', '0---------------'),
  },
};
