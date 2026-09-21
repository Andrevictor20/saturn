export interface WallpaperThemePalette {
  primary: string;
  primaryHover: string;
  contrastText: string;
  accent: string;
  glassShadow: string;
  dominantHex: string;
  secondaryHex: string;
}

export const DEFAULT_WALLPAPER_PALETTE: WallpaperThemePalette = {
  primary: '#818cf8',
  primaryHover: '#6366f1',
  contrastText: '#ffffff',
  accent: 'rgba(99, 102, 241, 0.12)',
  glassShadow: 'inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.2), 0 16px 40px -10px rgba(99, 102, 241, 0.25)',
  dominantHex: '#818cf8',
  secondaryHex: '#c084fc',
};

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function calculateLuminance(r: number, g: number, b: number): number {
  return 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
}

export function calculateContrastText(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return calculateLuminance(r, g, b) > 0.52 ? '#000000' : '#ffffff';
}

interface ColorCluster {
  count: number;
  rSum: number;
  gSum: number;
  bSum: number;
  sSum: number;
  lSum: number;
  hSum: number;
  isNeutral: boolean;
}

/**
 * Extracts true-chroma color palette directly from raw pixel buffer.
 * Performs fine 10-degree hue binning + dedicated neutral bins,
 * keeping the real average RGB and natural saturation instead of forcing synthetic saturation.
 */
export function extractPaletteFromPixels(
  data: Uint8ClampedArray | number[],
  isDark = true
): WallpaperThemePalette {
  if (!data || data.length < 4) {
    return DEFAULT_WALLPAPER_PALETTE;
  }

  // 36 chromatic hue bins (10° each) + 3 neutral bins (Dark, Mid, Light grayscale)
  const NUM_HUE_BINS = 36;
  const bins: ColorCluster[] = Array.from({ length: NUM_HUE_BINS + 3 }, (_, idx) => ({
    count: 0,
    rSum: 0,
    gSum: 0,
    bSum: 0,
    sSum: 0,
    lSum: 0,
    hSum: 0,
    isNeutral: idx >= NUM_HUE_BINS,
  }));

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const [h, s, l] = rgbToHsl(r, g, b);

    // Skip absolute blown-out extremes that contain zero chromatic value
    if (l < 3 || l > 97) continue;

    let targetBinIdx: number;
    if (s < 12) {
      // Achromatic / neutral pixel
      if (l < 33) targetBinIdx = NUM_HUE_BINS; // dark neutral
      else if (l < 66) targetBinIdx = NUM_HUE_BINS + 1; // mid neutral
      else targetBinIdx = NUM_HUE_BINS + 2; // light neutral
    } else {
      // Chromatic pixel mapped to 10° hue bin (0..35)
      targetBinIdx = Math.floor(h / 10) % NUM_HUE_BINS;
    }

    const bin = bins[targetBinIdx];
    bin.count += 1;
    bin.rSum += r;
    bin.gSum += g;
    bin.bSum += b;
    bin.sSum += s;
    bin.lSum += l;
    bin.hSum += h;
  }

  // Rank clusters based on frequency, authentic chromatic richness, and UI usability
  interface ScoredCluster {
    idx: number;
    score: number;
    count: number;
    avgR: number;
    avgG: number;
    avgB: number;
    avgH: number;
    avgS: number;
    avgL: number;
    isNeutral: boolean;
  }

  const scoredClusters: ScoredCluster[] = bins
    .map((b, idx) => {
      if (b.count === 0) {
        return {
          idx,
          score: 0,
          count: 0,
          avgR: 0,
          avgG: 0,
          avgB: 0,
          avgH: 0,
          avgS: 0,
          avgL: 0,
          isNeutral: b.isNeutral,
        };
      }

      const avgR = b.rSum / b.count;
      const avgG = b.gSum / b.count;
      const avgB = b.bSum / b.count;
      const avgS = b.sSum / b.count;
      const avgL = b.lSum / b.count;
      const avgH = b.isNeutral ? 0 : (b.hSum / b.count) % 360;

      // Realistic scoring: prefer represented colors, balancing natural saturation without artificial penalty
      let score: number;
      if (b.isNeutral) {
        // Neutral wallpapers (monochrome/dark) get a clean weight
        const centerDistance = Math.abs(avgL - 50) / 100;
        score = b.count * 0.45 * Math.max(0.2, 1 - centerDistance);
      } else {
        // Chromatic: score proportional to count and true saturation
        const saturationFactor = 0.4 + 0.6 * Math.min(1.0, avgS / 65);
        const lightnessFactor = Math.max(0.2, 1 - Math.abs(avgL - 52) / 90);
        score = b.count * saturationFactor * lightnessFactor;
      }

      return {
        idx,
        score,
        count: b.count,
        avgR,
        avgG,
        avgB,
        avgH,
        avgS,
        avgL,
        isNeutral: b.isNeutral,
      };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scoredClusters.length === 0) {
    return DEFAULT_WALLPAPER_PALETTE;
  }

  const primaryCluster = scoredClusters[0];

  // Calibrate Primary: Preserve TRUE image hue & authentic saturation.
  // Only lightly adjust lightness for WCAG accessible contrast against text and background.
  let prR: number;
  let prG: number;
  let prB: number;
  let hovR: number;
  let hovG: number;
  let hovB: number;

  if (primaryCluster.isNeutral) {
    // For neutral wallpapers, produce an elegant slate/graphite tone
    const targetL = isDark ? 62 : 36;
    const hoverL = isDark ? 52 : 28;
    const [r, g, b] = hslToRgb(220, 10, targetL);
    const [hr, hg, hb] = hslToRgb(220, 10, hoverL);
    prR = r; prG = g; prB = b;
    hovR = hr; hovG = hg; hovB = hb;
  } else {
    const trueH = primaryCluster.avgH;
    // Keep true saturation bounded within a legible range (min 24%, max 88%)
    const calibratedS = Math.max(24, Math.min(88, primaryCluster.avgS));

    // Adapt lightness comfortably for dark or light UI mode
    const targetL = isDark
      ? Math.max(46, Math.min(66, primaryCluster.avgL > 40 ? primaryCluster.avgL : 56))
      : Math.max(34, Math.min(48, primaryCluster.avgL < 50 ? primaryCluster.avgL : 40));

    const hoverL = isDark ? Math.max(38, targetL - 8) : Math.max(26, targetL - 6);

    const [r, g, b] = hslToRgb(trueH, calibratedS, targetL);
    const [hr, hg, hb] = hslToRgb(trueH, calibratedS, hoverL);
    prR = r; prG = g; prB = b;
    hovR = hr; hovG = hg; hovB = hb;
  }

  const primaryHex = rgbToHex(prR, prG, prB);
  const primaryHoverHex = rgbToHex(hovR, hovG, hovB);
  const contrastText = calculateContrastText(primaryHex);

  // Extract authentic Secondary Color from distinct clusters in the image
  // Search for the highest-ranking cluster that has sufficient perceptual color distance
  let secondaryHex = primaryHoverHex;
  const minColorDistance = 42; // Euclidean RGB distance threshold

  for (let i = 1; i < scoredClusters.length; i++) {
    const cand = scoredClusters[i];
    const dist = Math.sqrt(
      Math.pow(cand.avgR - primaryCluster.avgR, 2) +
      Math.pow(cand.avgG - primaryCluster.avgG, 2) +
      Math.pow(cand.avgB - primaryCluster.avgB, 2)
    );

    if (dist >= minColorDistance) {
      if (cand.isNeutral) {
        const secL = isDark ? 68 : 38;
        const [sr, sg, sb] = hslToRgb(215, 8, secL);
        secondaryHex = rgbToHex(sr, sg, sb);
      } else {
        const secS = Math.max(22, Math.min(80, cand.avgS));
        const secL = isDark
          ? Math.max(50, Math.min(70, cand.avgL > 40 ? cand.avgL : 60))
          : Math.max(36, Math.min(50, cand.avgL < 50 ? cand.avgL : 42));
        const [sr, sg, sb] = hslToRgb(cand.avgH, secS, secL);
        secondaryHex = rgbToHex(sr, sg, sb);
      }
      break;
    }
  }

  // If no sufficiently distinct second cluster exists (monochromatic image),
  // derive an authentic analogous shade
  if (secondaryHex === primaryHoverHex) {
    if (primaryCluster.isNeutral) {
      const [sr, sg, sb] = hslToRgb(220, 8, isDark ? 72 : 32);
      secondaryHex = rgbToHex(sr, sg, sb);
    } else {
      const secH = (primaryCluster.avgH + 28) % 360;
      const [sr, sg, sb] = hslToRgb(secH, Math.max(24, primaryCluster.avgS * 0.9), isDark ? 64 : 44);
      secondaryHex = rgbToHex(sr, sg, sb);
    }
  }

  // Refined soft accent (non-intrusive hover tint) and subtle glass shadow
  const accent = `rgba(${prR}, ${prG}, ${prB}, 0.10)`;
  const glassShadow = `inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.2), 0 16px 36px -8px rgba(${prR}, ${prG}, ${prB}, 0.22)`;

  return {
    primary: primaryHex,
    primaryHover: primaryHoverHex,
    contrastText,
    accent,
    glassShadow,
    dominantHex: primaryHex,
    secondaryHex,
  };
}

/**
 * Loads an image from a URL, renders it onto a memory canvas and extracts
 * an authentic, true-chroma theme palette.
 */
export async function extractPaletteFromImage(
  imageUrl: string,
  isDark = true
): Promise<WallpaperThemePalette> {
  return new Promise((resolve) => {
    if (!imageUrl || typeof window === 'undefined') {
      return resolve(DEFAULT_WALLPAPER_PALETTE);
    }

    const img = new window.Image();
    img.crossOrigin = 'anonymous';

    const timer = setTimeout(() => {
      resolve(DEFAULT_WALLPAPER_PALETTE);
    }, 2500);

    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          return resolve(DEFAULT_WALLPAPER_PALETTE);
        }

        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const palette = extractPaletteFromPixels(imageData.data, isDark);
        resolve(palette);
      } catch {
        resolve(DEFAULT_WALLPAPER_PALETTE);
      }
    };

    img.onerror = () => {
      clearTimeout(timer);
      resolve(DEFAULT_WALLPAPER_PALETTE);
    };

    img.src = imageUrl;
  });
}
