import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { 
  type WallpaperThemePalette, 
  extractPaletteFromImage, 
  DEFAULT_WALLPAPER_PALETTE 
} from "../utils/wallpaperPalette";
import { getAuthHeaders } from "../utils/auth";

export type Theme = "dark" | "light" | "system";
export type ColorVariant = 
  | "zinc" 
  | "rose" 
  | "blue" 
  | "green" 
  | "catppuccin" 
  | "tokyonight"
  | "gruvbox"
  | "nord"
  | "dracula"
  | "oled"
  | "synthwave"
  | "wallpaper";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  defaultColor?: ColorVariant;
  storageKey?: string;
  colorStorageKey?: string;
  avatarStorageKey?: string;
  wallpaperStorageKey?: string;
  wallpaperOpacityKey?: string;
  wallpaperBlurKey?: string;
};

export type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  color: ColorVariant;
  setColor: (color: ColorVariant) => void;
  customAvatar: string | null;
  setCustomAvatar: (avatar: string | null) => void;
  wallpaperUrl: string | null;
  setWallpaperUrl: (url: string | null) => void;
  wallpaperOpacity: number;
  setWallpaperOpacity: (opacity: number) => void;
  wallpaperBlur: number;
  setWallpaperBlur: (blur: number) => void;
  wallpaperPalette: WallpaperThemePalette | null;
  reloadCustomization: () => Promise<void>;
};

const initialState: ThemeProviderState = {
  theme: "dark",
  setTheme: () => null,
  color: "zinc",
  setColor: () => null,
  customAvatar: null,
  setCustomAvatar: () => null,
  wallpaperUrl: null,
  setWallpaperUrl: () => null,
  wallpaperOpacity: 0.5,
  setWallpaperOpacity: () => null,
  wallpaperBlur: 0,
  setWallpaperBlur: () => null,
  wallpaperPalette: null,
  reloadCustomization: async () => {},
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  defaultColor = "zinc",
  storageKey = "vite-ui-theme",
  colorStorageKey = "vite-ui-color",
  avatarStorageKey = "saturn-custom-avatar",
  wallpaperStorageKey = "saturn-wallpaper-url",
  wallpaperOpacityKey = "saturn-wallpaper-opacity",
  wallpaperBlurKey = "saturn-wallpaper-blur",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );
  
  const [color, setColor] = useState<ColorVariant>(() => {
    const saved = localStorage.getItem(colorStorageKey);
    if (saved === 'onedark') return 'oled';
    return (saved as ColorVariant) || defaultColor;
  });

  const [customAvatar, setCustomAvatar] = useState<string | null>(
    () => localStorage.getItem(avatarStorageKey) || null
  );

  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(
    () => localStorage.getItem(wallpaperStorageKey) || null
  );

  const [wallpaperOpacity, setWallpaperOpacity] = useState<number>(() => {
    const saved = localStorage.getItem(wallpaperOpacityKey);
    return saved !== null ? parseFloat(saved) : 0.5;
  });

  const [wallpaperBlur, setWallpaperBlur] = useState<number>(() => {
    const saved = localStorage.getItem(wallpaperBlurKey);
    return saved !== null ? parseFloat(saved) : 0;
  });

  const [wallpaperPalette, setWallpaperPalette] = useState<WallpaperThemePalette | null>(null);

  useEffect(() => {
    let active = true;
    const root = window.document.documentElement;

    if (color !== 'wallpaper') {
      root.style.removeProperty('--saturn-400');
      root.style.removeProperty('--saturn-500');
      root.style.removeProperty('--saturn-600');
      root.style.removeProperty('--saturn-contrast');
      root.style.removeProperty('--color-saturn-400');
      root.style.removeProperty('--color-saturn-500');
      root.style.removeProperty('--color-saturn-600');
      root.style.removeProperty('--accent');
      root.style.removeProperty('--glass-shadow');
      return;
    }

    const isDark = theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : theme === 'dark';

    const applyPalette = (pal: WallpaperThemePalette) => {
      setWallpaperPalette(pal);
      root.style.setProperty('--saturn-400', pal.primary);
      root.style.setProperty('--saturn-500', pal.primary);
      root.style.setProperty('--saturn-600', pal.primaryHover);
      root.style.setProperty('--saturn-contrast', pal.contrastText);
      root.style.setProperty('--color-saturn-400', pal.primary);
      root.style.setProperty('--color-saturn-500', pal.primary);
      root.style.setProperty('--color-saturn-600', pal.primaryHover);
      root.style.setProperty('--accent', pal.accent);
      root.style.setProperty('--glass-shadow', pal.glassShadow);
    };

    if (!wallpaperUrl) {
      applyPalette(DEFAULT_WALLPAPER_PALETTE);
      return;
    }

    extractPaletteFromImage(wallpaperUrl, isDark).then((pal) => {
      if (!active) return;
      applyPalette(pal);
    });

    return () => {
      active = false;
    };
  }, [color, wallpaperUrl, theme]);

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);
  
  useEffect(() => {
    const root = window.document.documentElement;
    Array.from(root.classList)
      .filter((cls) => cls.startsWith("theme-"))
      .forEach((cls) => root.classList.remove(cls));
    root.classList.add(`theme-${color}`);
  }, [color]);

  useEffect(() => {
    const updateFavicon = () => {
      let resolvedTheme: "dark" | "light" = "dark";
      if (theme === "system") {
        resolvedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      } else {
        resolvedTheme = theme === "light" ? "light" : "dark";
      }

      // Fallback to zinc if custom SVG favicon isn't generated for new colors
      const knownSvgs = ["zinc", "rose", "blue", "green", "catppuccin", "tokyonight"];
      const faviconColor = knownSvgs.includes(color) ? color : "zinc";
      const iconPath = `/icons/saturn/saturn-${faviconColor}-${resolvedTheme}.svg`;
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        link.type = "image/svg+xml";
        document.head.appendChild(link);
      }
      link.href = iconPath;
    };

    updateFavicon();

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => updateFavicon();
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, [theme, color]);

  const reloadCustomization = useCallback(async () => {
    try {
      const res = await fetch('/api/system/customization');
      if (!res.ok) return;
      const data = await res.json();
      if (!data) return;

      if (data.theme) {
        setTheme(data.theme);
        localStorage.setItem(storageKey, data.theme);
      }
      if (data.color) {
        const finalColor = data.color === 'onedark' ? 'oled' : data.color;
        setColor(finalColor);
        localStorage.setItem(colorStorageKey, finalColor);
      }
      if (data.custom_avatar !== undefined) {
        setCustomAvatar(data.custom_avatar);
        if (data.custom_avatar) localStorage.setItem(avatarStorageKey, data.custom_avatar);
        else localStorage.removeItem(avatarStorageKey);
      }
      if (data.wallpaper_url !== undefined) {
        setWallpaperUrl(data.wallpaper_url);
        if (data.wallpaper_url) localStorage.setItem(wallpaperStorageKey, data.wallpaper_url);
        else localStorage.removeItem(wallpaperStorageKey);
      }
      if (data.wallpaper_opacity !== undefined) {
        setWallpaperOpacity(data.wallpaper_opacity);
        localStorage.setItem(wallpaperOpacityKey, data.wallpaper_opacity.toString());
      }
      if (data.wallpaper_blur !== undefined) {
        setWallpaperBlur(data.wallpaper_blur);
        localStorage.setItem(wallpaperBlurKey, data.wallpaper_blur.toString());
      }
    } catch {
      // Ignore network errors
    }
  }, [storageKey, colorStorageKey, avatarStorageKey, wallpaperStorageKey, wallpaperOpacityKey, wallpaperBlurKey]);

  useEffect(() => {
    reloadCustomization();
  }, [reloadCustomization]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        setTheme(e.newValue as Theme);
      } else if (e.key === colorStorageKey && e.newValue) {
        setColor(e.newValue === 'onedark' ? 'oled' : (e.newValue as ColorVariant));
      } else if (e.key === avatarStorageKey) {
        setCustomAvatar(e.newValue);
      } else if (e.key === wallpaperStorageKey) {
        setWallpaperUrl(e.newValue);
      } else if (e.key === wallpaperOpacityKey && e.newValue) {
        const val = parseFloat(e.newValue);
        if (!isNaN(val)) setWallpaperOpacity(val);
      } else if (e.key === wallpaperBlurKey && e.newValue) {
        const val = parseFloat(e.newValue);
        if (!isNaN(val)) setWallpaperBlur(val);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [storageKey, colorStorageKey, avatarStorageKey, wallpaperStorageKey, wallpaperOpacityKey, wallpaperBlurKey]);

  const syncToBackend = (partial: {
    theme?: Theme;
    color?: ColorVariant;
    custom_avatar?: string | null;
    wallpaper_url?: string | null;
    wallpaper_opacity?: number;
    wallpaper_blur?: number;
  }) => {
    const payload = {
      theme: partial.theme ?? theme,
      color: partial.color ?? color,
      custom_avatar: partial.custom_avatar !== undefined ? partial.custom_avatar : customAvatar,
      wallpaper_url: partial.wallpaper_url !== undefined ? partial.wallpaper_url : wallpaperUrl,
      wallpaper_opacity: partial.wallpaper_opacity ?? wallpaperOpacity,
      wallpaper_blur: partial.wallpaper_blur ?? wallpaperBlur,
    };
    fetch('/api/system/customization', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  };

  const value: ThemeProviderState = {
    theme,
    setTheme: (t: Theme) => {
      localStorage.setItem(storageKey, t);
      setTheme(t);
      syncToBackend({ theme: t });
    },
    color,
    setColor: (c: ColorVariant) => {
      localStorage.setItem(colorStorageKey, c);
      setColor(c);
      syncToBackend({ color: c });
    },
    customAvatar,
    setCustomAvatar: (avatar: string | null) => {
      if (avatar) {
        localStorage.setItem(avatarStorageKey, avatar);
      } else {
        localStorage.removeItem(avatarStorageKey);
      }
      setCustomAvatar(avatar);
      syncToBackend({ custom_avatar: avatar });
    },
    wallpaperUrl,
    setWallpaperUrl: (url: string | null) => {
      if (url) {
        localStorage.setItem(wallpaperStorageKey, url);
      } else {
        localStorage.removeItem(wallpaperStorageKey);
      }
      setWallpaperUrl(url);
      syncToBackend({ wallpaper_url: url });
    },
    wallpaperOpacity,
    setWallpaperOpacity: (opacity: number) => {
      localStorage.setItem(wallpaperOpacityKey, opacity.toString());
      setWallpaperOpacity(opacity);
      syncToBackend({ wallpaper_opacity: opacity });
    },
    wallpaperBlur,
    setWallpaperBlur: (blur: number) => {
      localStorage.setItem(wallpaperBlurKey, blur.toString());
      setWallpaperBlur(blur);
      syncToBackend({ wallpaper_blur: blur });
    },
    wallpaperPalette,
    reloadCustomization,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
