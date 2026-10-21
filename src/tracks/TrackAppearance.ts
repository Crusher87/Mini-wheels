import {
  DataTexture,
  LinearFilter,
  NearestFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from "three";

export const TRACK_MATERIAL_IDS = Object.freeze([
  "track.asphalt",
  "track.concrete",
  "track.dirt",
  "track.ice",
  "track.neon",
  "track.racing-stripes",
  "track.checker",
  "track.arrows",
  "track.rainbow",
  "track.sunset",
] as const);

export type TrackMaterialId = (typeof TRACK_MATERIAL_IDS)[number];
export type TrackPatternPixel = readonly [number, number, number, number];

export interface TrackMaterialAppearance {
  readonly color: number;
  readonly roughness: number;
  readonly metalness: number;
  readonly emissive: number;
  readonly emissiveIntensity: number;
  readonly transparent: boolean;
  readonly opacity: number;
}

export function isTrackMaterialId(value: string): value is TrackMaterialId {
  return TRACK_MATERIAL_IDS.includes(value as TrackMaterialId);
}

export function trackMaterialAppearance(materialId: string): TrackMaterialAppearance {
  switch (materialId) {
    case "track.concrete":
      return appearance(0x8b98a3, 0.94);
    case "track.dirt":
      return appearance(0x9a5d2e, 0.98);
    case "track.ice":
      return { ...appearance(0x76dff2, 0.18), transparent: true, opacity: 0.82 };
    case "track.neon":
      return appearance(0xa83cff, 0.42, 0.25, 0x441166, 0.85);
    case "track.racing-stripes":
    case "track.checker":
    case "track.arrows":
      return appearance(0xffffff, 0.72);
    case "track.rainbow":
      return appearance(0xffffff, 0.38, 0.08, 0x252525, 0.2);
    case "track.sunset":
      return appearance(0xffffff, 0.52, 0.04, 0x441020, 0.35);
    default:
      return appearance(0x34485c, 0.82);
  }
}

export function createTrackPatternTexture(materialId: string, size = 64): DataTexture | null {
  if (trackPatternPixel(materialId, 0, 0) === null) {
    return null;
  }
  const safeSize = Math.max(8, Math.min(256, Math.trunc(size)));
  const data = new Uint8Array(safeSize * safeSize * 4);
  for (let y = 0; y < safeSize; y += 1) {
    for (let x = 0; x < safeSize; x += 1) {
      const pixel = trackPatternPixel(materialId, (x + 0.5) / safeSize, (y + 0.5) / safeSize);
      const offset = (y * safeSize + x) * 4;
      const color = pixel ?? [255, 255, 255, 255];
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = color[3];
    }
  }
  const texture = new DataTexture(data, safeSize, safeSize, RGBAFormat, UnsignedByteType);
  texture.name = `generated:${materialId}`;
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  const crisp =
    materialId === "track.checker" ||
    materialId === "track.racing-stripes" ||
    materialId === "track.arrows";
  texture.magFilter = crisp ? NearestFilter : LinearFilter;
  texture.minFilter = crisp ? NearestFilter : LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function trackPatternPixel(
  materialId: string,
  horizontal: number,
  longitudinal: number,
): TrackPatternPixel | null {
  const u = repeat(horizontal);
  const v = repeat(longitudinal);
  switch (materialId) {
    case "track.racing-stripes": {
      const centerDistance = Math.abs(u - 0.5);
      if (centerDistance < 0.055) {
        return [244, 248, 250, 255];
      }
      if (centerDistance < 0.13) {
        return [226, 48, 58, 255];
      }
      return [42, 55, 70, 255];
    }
    case "track.checker": {
      const light = (Math.floor(u * 8) + Math.floor(v * 8)) % 2 === 0;
      return light ? [235, 240, 242, 255] : [30, 39, 49, 255];
    }
    case "track.arrows": {
      const arrowDistance = Math.abs(Math.abs(u - 0.5) - (0.3 - v * 0.24));
      const arrow = v < 0.82 && arrowDistance < 0.055;
      return arrow ? [255, 184, 46, 255] : [38, 59, 76, 255];
    }
    case "track.rainbow": {
      const [red, green, blue] = hsvToRgb(repeat(u * 0.92 + v * 0.16), 0.82, 0.96);
      return [red, green, blue, 255];
    }
    case "track.sunset": {
      const wave = (Math.sin(v * Math.PI * 2) + 1) / 2;
      return [255, Math.round(72 + wave * 80), Math.round(66 + (1 - wave) * 118), 255];
    }
    default:
      return null;
  }
}

function appearance(
  color: number,
  roughness: number,
  metalness = 0,
  emissive = 0x000000,
  emissiveIntensity = 0,
): TrackMaterialAppearance {
  return {
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
    transparent: false,
    opacity: 1,
  };
}

function repeat(value: number): number {
  return value - Math.floor(value);
}

function hsvToRgb(
  hue: number,
  saturation: number,
  value: number,
): readonly [number, number, number] {
  const sector = Math.floor(hue * 6);
  const fraction = hue * 6 - sector;
  const low = value * (1 - saturation);
  const down = value * (1 - fraction * saturation);
  const up = value * (1 - (1 - fraction) * saturation);
  const rgb =
    sector % 6 === 0
      ? [value, up, low]
      : sector % 6 === 1
        ? [down, value, low]
        : sector % 6 === 2
          ? [low, value, up]
          : sector % 6 === 3
            ? [low, down, value]
            : sector % 6 === 4
              ? [up, low, value]
              : [value, low, down];
  return rgb.map((channel) => Math.round(channel * 255)) as unknown as readonly [
    number,
    number,
    number,
  ];
}
