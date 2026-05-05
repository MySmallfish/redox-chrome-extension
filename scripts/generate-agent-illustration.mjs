import fs from "fs";
import zlib from "zlib";

const width = 800;
const height = 240;
const scaleY = (y) => Math.round(y * 0.6);
const stroke = [0x00, 0xae, 0xef, 0xff];
const data = Buffer.alloc(width * height * 4, 0x00);

function setPixel(x, y, color = stroke) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const idx = (y * width + x) * 4;
  data[idx] = color[0];
  data[idx + 1] = color[1];
  data[idx + 2] = color[2];
  data[idx + 3] = color[3];
}

function drawPoint(x, y, thickness = 3) {
  const r = Math.floor(thickness / 2);
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      setPixel(x + dx, y + dy);
    }
  }
}

function drawLine(x0, y0, x1, y1, thickness = 3) {
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;

  while (true) {
    drawPoint(x, y, thickness);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function drawCircle(cx, cy, r, thickness = 3) {
  const step = Math.max(1, Math.floor(360 / (r * 6)));
  for (let deg = 0; deg < 360; deg += step) {
    const rad = (deg * Math.PI) / 180;
    const x = Math.round(cx + Math.cos(rad) * r);
    const y = Math.round(cy + Math.sin(rad) * r);
    drawPoint(x, y, thickness);
  }
}

function drawRect(x, y, w, h, thickness = 3) {
  drawLine(x, y, x + w, y, thickness);
  drawLine(x + w, y, x + w, y + h, thickness);
  drawLine(x + w, y + h, x, y + h, thickness);
  drawLine(x, y + h, x, y, thickness);
}

function drawPolyline(points, thickness = 3) {
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    drawLine(x0, y0, x1, y1, thickness);
  }
}

const s = (y) => scaleY(y);

// ground
 drawLine(60, s(340), 740, s(340));
// head
 drawCircle(180, s(120), Math.round(36 * 0.6));
// body and limbs
 drawLine(180, s(156), 180, s(250));
 drawLine(180, s(190), 120, s(235));
 drawLine(180, s(190), 260, s(210));
 drawLine(180, s(250), 150, s(320));
 drawLine(180, s(250), 220, s(320));
// tablet
 drawRect(300, s(170), 170, s(120));
 drawLine(260, s(210), 300, s(205));
 drawLine(350, s(190), 420, s(190));
 drawLine(350, s(215), 440, s(215));
 drawLine(350, s(240), 430, s(240));
// house
 drawPolyline([
  [520, s(150)],
  [600, s(90)],
  [680, s(150)]
]);
 drawRect(545, s(150), 110, s(90));
 drawPolyline([
  [585, s(240)],
  [585, s(190)],
  [615, s(190)],
  [615, s(240)]
]);
// accents
 drawLine(120, s(110), 90, s(90));
 drawLine(230, s(90), 250, s(70));
 drawLine(115, s(150), 85, s(155));

const raw = Buffer.alloc(height * (width * 4 + 1));
for (let y = 0; y < height; y += 1) {
  const rowStart = y * (width * 4 + 1);
  raw[rowStart] = 0;
  data.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
}

const compressed = zlib.deflateSync(raw);

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

function chunk(type, dataBuf) {
  const typeBuf = Buffer.from(type);
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(dataBuf.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, dataBuf]));
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([lengthBuf, typeBuf, dataBuf, crcBuf]);
}

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  signature,
  chunk("IHDR", ihdr),
  chunk("IDAT", compressed),
  chunk("IEND", Buffer.alloc(0))
]);

await fs.promises.writeFile("src/assets/agent-illustration.png", png);
