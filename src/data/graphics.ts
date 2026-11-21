/**
 * Graphics presets. PS1 = original retro look; PS2 = sharper, smoother; HD =
 * native resolution without retro filters. Pure data, applied by the renderer.
 */
export type GraphicsPreset = 'ps1' | 'ps2' | 'hd';

export interface GraphicsSettings {
  label: string;
  /** Internal render height in pixels; 0 = native window height (capped). */
  renderHeight: number;
  /** PS1 vertex snapping on/off. */
  vertexSnap: boolean;
  /** Colour levels per channel (255 = no quantisation). */
  colorLevels: number;
  /** Ordered-dither strength 0..1. */
  dither: number;
  /** Scanline darkening 0..1. */
  scanlines: number;
  /** Geometry detail multiplier for character parts (segments). */
  detail: number;
}

export const GRAPHICS_PRESETS: Record<GraphicsPreset, GraphicsSettings> = {
  ps1: { label: 'PS1', renderHeight: 270, vertexSnap: true, colorLevels: 31, dither: 1, scanlines: 0.06, detail: 1 },
  ps2: { label: 'PS2', renderHeight: 540, vertexSnap: false, colorLevels: 63, dither: 0.5, scanlines: 0.03, detail: 2 },
  hd: { label: 'HD', renderHeight: 0, vertexSnap: false, colorLevels: 255, dither: 0, scanlines: 0, detail: 2 },
};

export const GRAPHICS_ORDER: GraphicsPreset[] = ['ps1', 'ps2', 'hd'];
