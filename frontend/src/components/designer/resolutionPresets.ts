/**
 * Chrome-aware resolution presets for absolute-mode screen design.
 *
 * The app's header and collapsed sidebar consume screen space, so the canvas
 * target resolution should represent the usable area, not the raw display
 * resolution. This module provides presets that subtract chrome dimensions
 * and a helper for custom resolutions.
 */

export const HEADER_HEIGHT = 56;
export const SIDEBAR_COLLAPSED_WIDTH = 80;

export interface ResolutionPreset {
  /** Display label (e.g., "1920 × 1080 (Full HD)") */
  label: string;
  /** Storage key used in preferences (e.g., "1920x1080") */
  key: string;
  /** Raw screen width */
  rawWidth: number;
  /** Raw screen height */
  rawHeight: number;
  /** Usable canvas width (raw minus collapsed sidebar) */
  canvasWidth: number;
  /** Usable canvas height (raw minus header) */
  canvasHeight: number;
}

/** Subtract app chrome (header + collapsed sidebar) from raw screen dimensions. */
export function computeCanvasDimensions(rawW: number, rawH: number): { width: number; height: number } {
  return {
    width: rawW - SIDEBAR_COLLAPSED_WIDTH,
    height: rawH - HEADER_HEIGHT,
  };
}

function preset(label: string, rawW: number, rawH: number): ResolutionPreset {
  const canvas = computeCanvasDimensions(rawW, rawH);
  return {
    label,
    key: `${rawW}x${rawH}`,
    rawWidth: rawW,
    rawHeight: rawH,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
  };
}

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  preset('1920 × 1080 (Full HD)', 1920, 1080),
  preset('1366 × 768 (HD)', 1366, 768),
  preset('1280 × 800 (8″ Panel)', 1280, 800),
  preset('1024 × 600 (5″ Panel)', 1024, 600),
  preset('1024 × 768 (XGA)', 1024, 768),
];

/** Find a preset by its storage key, or undefined if not found. */
export function findPreset(key: string): ResolutionPreset | undefined {
  return RESOLUTION_PRESETS.find(p => p.key === key);
}
