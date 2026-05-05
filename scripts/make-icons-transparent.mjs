import fs from "fs";
import zlib from "zlib";

const files = [
  "src/assets/icon-16.png",
  "src/assets/icon-32.png",
  "src/assets/icon-48.png",
  "src/assets/icon-128.png"
];

for (const file of files) {
  const input = await fs.promises.readFile(file);
  const png = decodePng(input);
  const rgba = png.rgba;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const a = rgba[i + 3];
    if (a === 0) continue;
    if (r >= 250 && g >= 250 && b >= 250) {
      rgba[i + 3] = 0;
    }
  }
  const out = encodePng(png.width, png.height, rgba);
  await fs.promises.writeFile(file, out);
}

function decodePng(buffer) {
  const signature = buffer.slice(0, 8);
  const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!signature.equals(expected)) {
    throw new Error("Invalid PNG signature");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.slice(offset + 4, offset + 8).toString("ascii");
    const data = buffer.slice(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8) {
    throw new Error("Unsupported bit depth");
  }
  if (colorType !== 6 && colorType !== 2) {
    throw new Error("Unsupported color type");
  }

  const compressed = Buffer.concat(idatChunks);
  const raw = zlib.inflateSync(compressed);
  const bpp = colorType === 6 ? 4 : 3;
  const rowBytes = width * bpp;
  const rgba = Buffer.alloc(width * height * 4);
  let rawOffset = 0;
  let prevRow = null;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset];
    rawOffset += 1;
    const row = raw.slice(rawOffset, rawOffset + rowBytes);
    rawOffset += rowBytes;

    const unfiltered = unfilterRow(row, prevRow, bpp, filter);
    prevRow = unfiltered;

    for (let x = 0; x < width; x += 1) {
      const srcIdx = x * bpp;
      const dstIdx = (y * width + x) * 4;
      rgba[dstIdx] = unfiltered[srcIdx];
      rgba[dstIdx + 1] = unfiltered[srcIdx + 1];
      rgba[dstIdx + 2] = unfiltered[srcIdx + 2];
      rgba[dstIdx + 3] = colorType === 6 ? unfiltered[srcIdx + 3] : 255;
    }
  }

  return { width, height, rgba };
}

function unfilterRow(row, prevRow, bpp, filter) {
  const out = Buffer.alloc(row.length);
  for (let i = 0; i < row.length; i += 1) {
    const raw = row[i];
    const left = i >= bpp ? out[i - bpp] : 0;
    const up = prevRow ? prevRow[i] : 0;
    const upLeft = prevRow && i >= bpp ? prevRow[i - bpp] : 0;
    let value = 0;

    switch (filter) {
      case 0:
        value = raw;
        break;
      case 1:
        value = (raw + left) & 0xff;
        break;
      case 2:
        value = (raw + up) & 0xff;
        break;
      case 3:
        value = (raw + Math.floor((left + up) / 2)) & 0xff;
        break;
      case 4:
        value = (raw + paeth(left, up, upLeft)) & 0xff;
        break;
      default:
        throw new Error("Unsupported filter");
    }
    out[i] = value;
  }
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(raw);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function chunk(type, dataBuf) {
  const typeBuf = Buffer.from(type);
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(dataBuf.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, dataBuf]));
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([lengthBuf, typeBuf, dataBuf, crcBuf]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
