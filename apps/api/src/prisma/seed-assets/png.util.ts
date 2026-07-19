/**
 * Dependency-free PNG encoder for seed-script placeholder images.
 * No canvas/sharp/etc — just CRC32 + zlib (built into Node) writing raw
 * RGBA scanlines straight into PNG chunks. Good enough for small (<300px)
 * solid-shape placeholders (avatars, a logo emblem, a signature squiggle,
 * a stamp ring); not a general-purpose image library.
 */
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

export type Rgba = [number, number, number, number];

/** Encodes an RGBA pixel buffer (row-major, width*height*4 bytes) as a PNG. */
export function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (none)
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idatData = deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: truecolor + alpha
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Builds an RGBA buffer by evaluating `paint` for every pixel. */
function paintImage(
  width: number,
  height: number,
  paint: (x: number, y: number) => Rgba,
): Buffer {
  const buf = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y);
      const i = (y * width + x) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
    }
  }
  return buf;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) ?? [];
  if (!m[1]) return [43, 108, 176];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function shade([r, g, b]: [number, number, number], factor: number): [number, number, number] {
  return [
    Math.max(0, Math.min(255, Math.round(r * factor))),
    Math.max(0, Math.min(255, Math.round(g * factor))),
    Math.max(0, Math.min(255, Math.round(b * factor))),
  ];
}

/** Generic person-avatar placeholder: tinted background, head circle + shoulder arc. */
export function makeAvatarPng(colorHex: string, size = 160): Buffer {
  const fg = hexToRgb(colorHex);
  const bg = shade(fg, 1.55);
  const cx = size / 2;
  const headCy = size * 0.38;
  const headR = size * 0.21;
  const shoulderCy = size * 1.05;
  const shoulderR = size * 0.46;

  const rgba = paintImage(size, size, (x, y) => {
    const dHead = Math.hypot(x - cx, y - headCy);
    const dShoulder = Math.hypot(x - cx, y - shoulderCy);
    if (dHead <= headR || dShoulder <= shoulderR) {
      return [fg[0], fg[1], fg[2], 255];
    }
    return [bg[0], bg[1], bg[2], 255];
  });
  return encodePng(size, size, rgba);
}

/** Simple concentric-circle emblem — stands in for a school logo. */
export function makeLogoPng(colorHex: string, size = 256): Buffer {
  const fg = hexToRgb(colorHex);
  const dark = shade(fg, 0.7);
  const light = shade(fg, 1.5);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.46;
  const midR = size * 0.36;
  const innerR = size * 0.16;

  const rgba = paintImage(size, size, (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    if (d > outerR) return [255, 255, 255, 0];
    if (d > midR) return [...dark, 255] as Rgba;
    if (d > innerR) return [...fg, 255] as Rgba;
    return [...light, 255] as Rgba;
  });
  return encodePng(size, size, rgba);
}

/** A wavy black stroke on a transparent background — stands in for a signature. */
export function makeSignaturePng(width = 300, height = 120): Buffer {
  const rgba = paintImage(width, height, () => [0, 0, 0, 0]);
  const set = (x: number, y: number, a: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = (y * width + x) * 4;
    rgba[i] = 25; rgba[i + 1] = 25; rgba[i + 2] = 35; rgba[i + 3] = a;
  };
  for (let x = 15; x < width - 15; x++) {
    const t = x - 15;
    const yc =
      height / 2 +
      Math.sin(t * 0.09) * (height * 0.22) +
      Math.sin(t * 0.03 + 1) * (height * 0.12);
    for (let dy = -2; dy <= 2; dy++) {
      const a = dy === 0 ? 255 : 255 - Math.abs(dy) * 70;
      set(x, Math.round(yc) + dy, Math.max(0, a));
    }
  }
  return encodePng(width, height, rgba);
}

/** A double-ring circle — stands in for an official school stamp. */
export function makeStampPng(colorHex: string, size = 200): Buffer {
  const fg = hexToRgb(colorHex);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.46;
  const outerRingWidth = size * 0.035;
  const innerR = size * 0.34;
  const innerRingWidth = size * 0.025;

  const rgba = paintImage(size, size, (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    const onOuter = d <= outerR && d >= outerR - outerRingWidth;
    const onInner = d <= innerR && d >= innerR - innerRingWidth;
    if (onOuter || onInner) return [...fg, 235] as Rgba;
    return [255, 255, 255, 0];
  });
  return encodePng(size, size, rgba);
}
