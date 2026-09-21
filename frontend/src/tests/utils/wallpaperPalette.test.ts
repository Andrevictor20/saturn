import { describe, it, expect } from 'vitest';
import {
  extractPaletteFromImage,
  extractPaletteFromPixels,
  calculateContrastText,
  rgbToHsl,
  hslToRgb,
  DEFAULT_WALLPAPER_PALETTE
} from '../../utils/wallpaperPalette';

describe('wallpaperPalette utility', () => {
  it('returns default fallback palette when imageUrl is empty or invalid', async () => {
    const palEmpty = await extractPaletteFromImage('');
    expect(palEmpty).toEqual(DEFAULT_WALLPAPER_PALETTE);
    expect(palEmpty.primary).toBe('#818cf8');
    expect(palEmpty.contrastText).toBe('#ffffff');
  });

  it('provides well-formed hex colors and contrast text in default palette', () => {
    expect(DEFAULT_WALLPAPER_PALETTE.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(DEFAULT_WALLPAPER_PALETTE.primaryHover).toMatch(/^#[0-9a-f]{6}$/i);
    expect(['#000000', '#ffffff']).toContain(DEFAULT_WALLPAPER_PALETTE.contrastText);
    expect(DEFAULT_WALLPAPER_PALETTE.accent).toContain('rgba(');
  });

  it('handles simulated image load failure gracefully by returning fallback palette', async () => {
    const result = await extractPaletteFromImage('https://invalid-non-existent-domain-saturn.xyz/test.jpg');
    expect(result).toBeDefined();
    expect(result.primary).toMatch(/^#[0-9a-f]{6}$/i);
  });

  describe('True-Chroma Pixel Palette Extraction', () => {
    it('correctly identifies authentic green hues from a simulated nature/forest wallpaper', () => {
      // Create a pixel buffer representing a green wallpaper (e.g. RGB: 34, 139, 34 forest green)
      const pixels: number[] = [];
      for (let i = 0; i < 200; i++) {
        pixels.push(40, 160, 50, 255); // Vibrant emerald/forest green
      }
      for (let i = 0; i < 50; i++) {
        pixels.push(30, 120, 40, 255); // Darker foliage green
      }

      const palette = extractPaletteFromPixels(pixels, true);
      expect(palette.primary).toMatch(/^#[0-9a-f]{6}$/i);
      
      // Parse RGB from hex
      const r = parseInt(palette.primary.slice(1, 3), 16);
      const g = parseInt(palette.primary.slice(3, 5), 16);
      const b = parseInt(palette.primary.slice(5, 7), 16);

      // Authentic green must have Green significantly higher than Red and Blue
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    });

    it('correctly identifies authentic ocean blue hues without synthetic violet distortion', () => {
      const pixels: number[] = [];
      for (let i = 0; i < 200; i++) {
        pixels.push(14, 116, 184, 255); // Deep ocean blue
      }

      const palette = extractPaletteFromPixels(pixels, true);
      const r = parseInt(palette.primary.slice(1, 3), 16);
      const g = parseInt(palette.primary.slice(3, 5), 16);
      const b = parseInt(palette.primary.slice(5, 7), 16);

      expect(b).toBeGreaterThan(r);
      expect(b).toBeGreaterThan(g);
      expect(palette.dominantHex).toBe(palette.primary);
    });

    it('extracts distinct authentic secondary color when image has dual dominant tones', () => {
      const pixels: number[] = [];
      // 70% Blue pixels
      for (let i = 0; i < 140; i++) {
        pixels.push(20, 100, 200, 255);
      }
      // 30% Warm Amber/Orange sunset pixels
      for (let i = 0; i < 60; i++) {
        pixels.push(240, 140, 30, 255);
      }

      const palette = extractPaletteFromPixels(pixels, true);
      expect(palette.primary).not.toBe(palette.secondaryHex);
      expect(palette.secondaryHex).toMatch(/^#[0-9a-f]{6}$/i);

      // Secondary color should capture the warm sunset component (high Red)
      const secR = parseInt(palette.secondaryHex.slice(1, 3), 16);
      const secB = parseInt(palette.secondaryHex.slice(5, 7), 16);
      expect(secR).toBeGreaterThan(secB);
    });

    it('handles grayscale and monochromatic wallpapers gracefully without breaking', () => {
      const grayPixels: number[] = [];
      for (let i = 0; i < 200; i++) {
        grayPixels.push(60, 60, 60, 255);
      }

      const palette = extractPaletteFromPixels(grayPixels, true);
      expect(palette.primary).toBeDefined();
      expect(palette.contrastText).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  describe('Color Math and Contrast Validation', () => {
    it('computes correct WCAG high contrast text for light and dark backgrounds', () => {
      expect(calculateContrastText('#ffffff')).toBe('#000000'); // white background needs black text
      expect(calculateContrastText('#09090b')).toBe('#ffffff'); // dark background needs white text
      expect(calculateContrastText('#facc15')).toBe('#000000'); // bright yellow needs dark text
      expect(calculateContrastText('#1e1b4b')).toBe('#ffffff'); // dark indigo needs white text
    });

    it('round-trips RGB to HSL and back with minimal loss', () => {
      const [h, s, l] = rgbToHsl(59, 130, 246);
      const [r, g, b] = hslToRgb(h, s, l);
      expect(Math.abs(r - 59)).toBeLessThanOrEqual(2);
      expect(Math.abs(g - 130)).toBeLessThanOrEqual(2);
      expect(Math.abs(b - 246)).toBeLessThanOrEqual(2);
    });
  });
});
