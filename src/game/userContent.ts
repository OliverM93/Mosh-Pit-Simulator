import type { AudioEngine } from '../audio/AudioEngine';
import type { SongDefinition } from '../audio/songTypes';
import { estimateTempo, type TempoEstimate } from '../audio/tempo';
import { buildUserSong, parseUserContent, type UserContent, type UserSongEntry } from '../data/userSongs';

const BASE = './user-content/';

export interface PreparedSong {
  song: SongDefinition;
  buffer: AudioBuffer;
  /** Present when BPM/offset were detected automatically. */
  estimate: TempoEstimate | null;
}

/**
 * Loads the player's own songs and logos from public/user-content/ (git-ignored).
 * Missing folder or manifest = no user content, the game runs normally.
 */
export class UserContentLoader {
  content: UserContent = { songs: [], merch: [], errors: [] };
  /** Merch logos in manifest order (null = text only). */
  merchLogos: { band: string; image: HTMLImageElement | null }[] = [];
  private prepared = new Map<string, PreparedSong>();

  async load(): Promise<void> {
    try {
      const res = await fetch(`${BASE}songs.json`, { cache: 'no-store' });
      if (!res.ok) return;
      this.content = parseUserContent(await res.json());
    } catch {
      return; // no manifest / invalid JSON → no user content
    }
    for (const e of this.content.errors) console.warn(`[user-content] ${e}`);
    this.merchLogos = await Promise.all(
      this.content.merch.map(async (m) => ({ band: m.band, image: await loadImage(BASE + m.logo) })),
    );
  }

  isUserSong(id: string): boolean {
    return this.content.songs.some((s) => s.id === id);
  }

  /** Menu entries for user songs (real timing is resolved on selection). */
  listing(): SongDefinition[] {
    return this.content.songs.map((e) => ({
      id: e.id,
      title: e.title,
      artist: e.artist,
      genre: e.genre,
      bpm: e.bpm ?? 0,
      beatsPerBar: e.beatsPerBar,
      sections: [{ type: 'verse', bars: 1 }],
      events: [],
      audio: { kind: 'file', url: BASE + e.file, offsetSec: e.offsetSec ?? 0 },
      blurb: e.blurb,
    }));
  }

  /** Fetch + decode the audio, detect BPM/offset if not given, build the timeline. Cached per song. */
  async prepare(id: string, engine: AudioEngine): Promise<PreparedSong> {
    const cached = this.prepared.get(id);
    if (cached) return cached;
    const entry = this.content.songs.find((s) => s.id === id) as UserSongEntry;
    const ctx = engine.ctx;
    if (!ctx) throw new Error('Audio not unlocked');
    const res = await fetch(BASE + entry.file);
    if (!res.ok) throw new Error(`Could not load ${entry.file} (${res.status})`);
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    let estimate: TempoEstimate | null = null;
    let bpm = entry.bpm;
    let offsetSec = entry.offsetSec;
    if (bpm === undefined || offsetSec === undefined) {
      estimate = estimateTempo(downmix(buffer), buffer.sampleRate / 2);
      bpm ??= estimate.bpm;
      if (offsetSec === undefined) {
        // With a manual BPM only the phase is needed: re-use the detected beat phase on that grid.
        const spb = 60 / bpm;
        offsetSec = ((estimate.offsetSec % spb) + spb) % spb;
      }
      console.info(
        `[user-content] ${entry.artist} – ${entry.title}: detected bpm ${estimate.bpm}, offsetSec ${estimate.offsetSec.toFixed(3)} ` +
          `(confidence ${(estimate.confidence * 100).toFixed(0)}%). Put these into songs.json to lock them.`,
      );
    }
    const song = buildUserSong(entry, { bpm, offsetSec, durationSec: buffer.duration });
    const prepared = { song, buffer, estimate };
    this.prepared.set(id, prepared);
    return prepared;
  }
}

/** Mono mix at half the sample rate – plenty for onset detection, 2× faster. */
function downmix(buffer: AudioBuffer): Float32Array {
  const n = Math.floor(buffer.length / 2);
  const out = new Float32Array(n);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const ch of channels) v += ch[i * 2]! + ch[i * 2 + 1]!;
    out[i] = v / (2 * channels.length);
  }
  return out;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn(`[user-content] logo not found: ${url}`);
      resolve(null);
    };
    img.src = url;
  });
}
