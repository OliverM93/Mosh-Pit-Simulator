import type { Genre, SectionType, SongDefinition, SongSectionDef } from '../audio/songTypes';

/**
 * User content: the player's own audio files and logos, described in
 * `public/user-content/songs.json` (git-ignored – never committed, the repo is public).
 * Pure parsing/validation; loading and audio analysis live in src/game/userContent.ts.
 */

export interface UserSectionMarker {
  type: SectionType;
  /** "m:ss", "m:ss.s" or seconds. */
  start: string | number;
  pulseBeats?: number;
  label?: string;
}

export interface UserSongEntry {
  id: string;
  file: string;
  title: string;
  artist: string;
  genre: Genre;
  bpm?: number;
  offsetSec?: number;
  beatsPerBar: number;
  /** Default pulse for all sections (2 = dance on the half-time feel of fast songs). */
  pulseBeats?: number;
  sections: UserSectionMarker[];
  /** Band logo image (stage banner). */
  logo?: string;
  blurb: string;
}

export interface UserMerchEntry {
  band: string;
  logo: string;
}

export interface UserContent {
  songs: UserSongEntry[];
  merch: UserMerchEntry[];
  errors: string[];
}

const SECTION_TYPES: SectionType[] = ['intro', 'verse', 'chorus', 'breakdown', 'heavy', 'outro'];
const GENRES: Genre[] = ['hardcore', 'beatdown', 'metalcore', 'hardcore-punk'];

/** "1:42" → 102, "1:42.5" → 102.5, 95 → 95. NaN if invalid. */
export function parseTimestamp(v: string | number): number {
  if (typeof v === 'number') return v;
  const m = /^\s*(?:(\d+):)?(\d+(?:\.\d+)?)\s*$/.exec(v);
  if (!m) return NaN;
  return (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]);
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Validate the raw JSON. Invalid songs are skipped with an error message instead of breaking the game. */
export function parseUserContent(raw: unknown): UserContent {
  const out: UserContent = { songs: [], merch: [], errors: [] };
  if (!raw || typeof raw !== 'object') {
    out.errors.push('songs.json: expected an object with "songs"');
    return out;
  }
  const obj = raw as { songs?: unknown; merch?: unknown };
  const songs = Array.isArray(obj.songs) ? obj.songs : [];
  songs.forEach((s, i) => {
    const e = s as Record<string, unknown>;
    const where = `songs[${i}]`;
    if (typeof e.file !== 'string' || typeof e.title !== 'string' || typeof e.artist !== 'string') {
      out.errors.push(`${where}: "file", "title" and "artist" are required`);
      return;
    }
    const bpm = typeof e.bpm === 'number' ? e.bpm : undefined;
    if (bpm !== undefined && (bpm < 40 || bpm > 300)) {
      out.errors.push(`${where}: bpm ${bpm} out of range`);
      return;
    }
    const markers: UserSectionMarker[] = [];
    for (const m of Array.isArray(e.sections) ? e.sections : []) {
      const mm = m as Record<string, unknown>;
      if (!SECTION_TYPES.includes(mm.type as SectionType) || Number.isNaN(parseTimestamp(mm.start as string))) {
        out.errors.push(`${where}: invalid section ${JSON.stringify(m)}`);
        continue;
      }
      markers.push({
        type: mm.type as SectionType,
        start: mm.start as string | number,
        pulseBeats: typeof mm.pulseBeats === 'number' ? mm.pulseBeats : undefined,
        label: typeof mm.label === 'string' ? mm.label : undefined,
      });
    }
    out.songs.push({
      id: typeof e.id === 'string' ? e.id : `user_${slug(`${e.artist}_${e.title}`)}`,
      file: e.file,
      title: e.title,
      artist: e.artist,
      genre: GENRES.includes(e.genre as Genre) ? (e.genre as Genre) : 'hardcore',
      bpm,
      offsetSec: typeof e.offsetSec === 'number' ? e.offsetSec : undefined,
      beatsPerBar: typeof e.beatsPerBar === 'number' ? e.beatsPerBar : 4,
      pulseBeats: typeof e.pulseBeats === 'number' ? e.pulseBeats : undefined,
      sections: markers,
      logo: typeof e.logo === 'string' ? e.logo : undefined,
      blurb: typeof e.blurb === 'string' ? e.blurb : 'Your song.',
    });
  });
  for (const m of Array.isArray(obj.merch) ? obj.merch : []) {
    const mm = m as Record<string, unknown>;
    if (typeof mm.band === 'string' && typeof mm.logo === 'string') out.merch.push({ band: mm.band.toUpperCase(), logo: mm.logo });
    else out.errors.push(`merch: invalid entry ${JSON.stringify(m)}`);
  }
  return out;
}

export interface SongTiming {
  bpm: number;
  offsetSec: number;
  /** Length of the audio file in seconds. */
  durationSec: number;
}

/**
 * Turn an entry + timing into a playable SongDefinition. Section timestamps
 * snap to the nearest bar; music before the first marker is an intro;
 * breakdowns and heavy parts get a beatdrop on their first beat.
 */
export function buildUserSong(entry: UserSongEntry, timing: SongTiming, baseUrl = './user-content/'): SongDefinition {
  const barSec = (60 / timing.bpm) * entry.beatsPerBar;
  const totalBars = Math.max(1, Math.floor((timing.durationSec - timing.offsetSec) / barSec));
  const markers = entry.sections
    .map((m) => ({ ...m, bar: Math.round((parseTimestamp(m.start) - timing.offsetSec) / barSec) }))
    .filter((m) => m.bar >= 0 && m.bar < totalBars)
    .sort((a, b) => a.bar - b.bar);
  if (markers.length === 0 || markers[0]!.bar > 0) markers.unshift({ type: markers.length ? 'intro' : 'verse', start: 0, bar: 0, pulseBeats: undefined, label: undefined });

  const sections: SongSectionDef[] = [];
  markers.forEach((m, i) => {
    const end = i + 1 < markers.length ? markers[i + 1]!.bar : totalBars;
    if (end <= m.bar) return;
    const pulse = m.pulseBeats ?? (m.type === 'breakdown' || m.type === 'heavy' ? undefined : entry.pulseBeats);
    sections.push({
      type: m.type,
      bars: end - m.bar,
      ...(pulse && entry.beatsPerBar % pulse === 0 ? { pulseBeats: pulse } : {}),
      ...(m.label ? { label: m.label } : {}),
    });
  });

  let bar = 0;
  const events: SongDefinition['events'] = [];
  for (const s of sections) {
    if ((s.type === 'breakdown' || s.type === 'heavy') && bar > 0) events.push({ type: 'beatdrop', bar });
    bar += s.bars;
  }

  return {
    id: entry.id,
    title: entry.title,
    artist: entry.artist,
    genre: entry.genre,
    bpm: timing.bpm,
    beatsPerBar: entry.beatsPerBar,
    sections,
    events,
    audio: { kind: 'file', url: baseUrl + entry.file, offsetSec: timing.offsetSec },
    blurb: entry.blurb,
    ...(entry.logo ? { logoUrl: baseUrl + entry.logo } : {}),
  };
}
