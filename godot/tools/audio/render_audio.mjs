// Bundles render_entry.ts and runs it in headless Chromium; writes WAVs, converts them to OGG (ffmpeg) into
// godot/assets/audio/. Usage (repo root): node godot/tools/audio/render_audio.mjs
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Playwright is installed globally in the dev environment (not a project dependency).
const { chromium } = createRequire(import.meta.url)('playwright');

const here = path.dirname(new URL(import.meta.url).pathname);
const outDir = path.join(here, '..', '..', 'assets', 'audio');
const tmp = fs.mkdtempSync('/tmp/moshaudio-');
execFileSync('npx', ['rolldown', path.join(here, 'render_entry.ts'), '--format', 'iife', '--file', path.join(tmp, 'bundle.js'), '--platform', 'browser'], { stdio: 'inherit' });
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ path: path.join(tmp, 'bundle.js') });
const files = await page.evaluate(() => window.renderAll());
await browser.close();
for (const [name, data] of Object.entries(files)) {
  const target = path.join(outDir, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (name.endsWith('.json')) {
    fs.writeFileSync(target, JSON.stringify(data, null, 1));
    continue;
  }
  const wavPath = path.join(tmp, path.basename(name));
  fs.writeFileSync(wavPath, Buffer.from(data, 'base64'));
  const ogg = target.replace(/\.wav$/, '.ogg');
  // SFX are peak-normalised to -1 dBFS (the synth renders them at mixer level); the song keeps its own master.
  let gain = 0;
  if (name.startsWith('sfx/')) {
    const probe = spawnSync('ffmpeg', ['-i', wavPath, '-af', 'volumedetect', '-f', 'null', '-']).stderr;
    const m = /max_volume: (-?[0-9.]+) dB/.exec(probe.toString()) ?? [];
    gain = m[1] ? -1 - Number(m[1]) : 0;
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-af', `volume=${gain}dB`, '-c:a', 'libvorbis', '-q:a', '5', ogg]);
  console.log('wrote', path.relative(process.cwd(), ogg), fs.statSync(ogg).size, 'bytes');
}
