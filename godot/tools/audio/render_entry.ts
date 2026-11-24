/**
 * Offline render of the existing Web Audio synth (src/audio, Three.js project – imported read-only) into WAV files
 * for the Godot project: the test song and the SFX. Runs in headless Chromium (render_audio.mjs).
 * The engine is pointed at an OfflineAudioContext; the song scheduler is driven by a fake clock so every note is
 * scheduled exactly once before rendering.
 */
import { AudioEngine } from '../../../src/audio/AudioEngine';
import { SynthSongPlayer } from '../../../src/audio/SongPlayer';
import { Sfx } from '../../../src/audio/Sfx';
import { SongTimeline } from '../../../src/audio/SongTimeline';
import { SONGS } from '../../../src/data/songs';
import type { SynthAudioDef } from '../../../src/audio/songTypes';

const RATE = 44100;

async function offlineEngine(seconds: number): Promise<{ engine: AudioEngine; ctx: OfflineAudioContext; clock: { now: number } }> {
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(seconds * RATE), sampleRate: RATE });
  const clock = { now: 0 };
  Object.defineProperty(ctx, 'currentTime', { get: () => clock.now });
  (ctx as unknown as { resume: () => Promise<void> }).resume = async () => {};
  Object.defineProperty(ctx, 'state', { get: () => 'running' });
  const w = window as unknown as { AudioContext: unknown };
  w.AudioContext = function () {
    return ctx;
  };
  const engine = new AudioEngine();
  await engine.unlock();
  return { engine, ctx, clock };
}

function wav(buf: AudioBuffer): string {
  const n = buf.length;
  const ch = buf.numberOfChannels;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  out.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVEfmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, RATE, true);
  out.setUint32(28, RATE * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  str(36, 'data');
  out.setUint32(40, n * ch * 2, true);
  const data = [...Array(ch).keys()].map((c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      out.setInt16(o, Math.max(-1, Math.min(1, data[c]![i]!)) * 32767, true);
      o += 2;
    }
  }
  let bin = '';
  const bytes = new Uint8Array(out.buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function renderSong(index: number): Promise<{ wav: string; meta: unknown }> {
  const song = SONGS[index]!;
  const timeline = new SongTimeline(song);
  const seconds = timeline.totalBeats * timeline.secondsPerBeat + 2;
  const { engine, ctx, clock } = await offlineEngine(seconds);
  const player = new SynthSongPlayer(engine, timeline, song.audio as SynthAudioDef);
  await player.load();
  player.start(0.05);
  const p = player as unknown as { timer: number | null; schedule: () => void };
  if (p.timer !== null) window.clearInterval(p.timer);
  for (clock.now = 0; clock.now < seconds; clock.now += 0.1) p.schedule();
  clock.now = 0;
  const buf = await ctx.startRendering();
  const meta = {
    id: song.id, title: song.title, artist: song.artist, bpm: song.bpm, beatsPerBar: song.beatsPerBar, offset: 0.05,
    sections: song.sections, events: song.events ?? [],
  };
  return { wav: wav(buf), meta };
}

async function renderSfx(name: string, seconds: number, play: (sfx: Sfx) => void): Promise<string> {
  const { engine, ctx, clock } = await offlineEngine(seconds);
  const sfx = new Sfx(engine);
  clock.now = 0.01;
  play(sfx);
  clock.now = 0;
  return wav(await ctx.startRendering());
}

(window as unknown as { renderAll: () => Promise<Record<string, string | unknown>> }).renderAll = async () => {
  const out: Record<string, string | unknown> = {};
  const song = await renderSong(0);
  out['music/basement_rules.wav'] = song.wav;
  out['music/basement_rules.json'] = song.meta;
  out['sfx/impact_light.wav'] = await renderSfx('impact_light', 0.6, (s) => s.impact(0.4));
  out['sfx/impact_heavy.wav'] = await renderSfx('impact_heavy', 0.9, (s) => s.impact(1));
  out['sfx/whoosh.wav'] = await renderSfx('whoosh', 0.6, (s) => s.whoosh(0.8));
  out['sfx/cheer.wav'] = await renderSfx('cheer', 2.5, (s) => s.cheer(1));
  out['sfx/ooh.wav'] = await renderSfx('ooh', 1.6, (s) => s.ooh());
  out['sfx/bail.wav'] = await renderSfx('bail', 1.2, (s) => s.bail());
  out['sfx/crowd_loop.wav'] = await renderSfx('crowd_loop', 12, (s) => s.setAmbience(0.7));
  return out;
};
