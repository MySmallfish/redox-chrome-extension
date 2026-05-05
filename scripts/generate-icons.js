import sharp from "sharp";
import path from "path";
import fs from "fs";

const src = path.join("src", "assets", "logo-small.svg");
const outDir = path.join("src", "assets");
const sizes = [16, 32, 48, 128];

if (!fs.existsSync(src)) {
  throw new Error("logo-small.svg not found");
}

await Promise.all(
  sizes.map(async (size) => {
    const outFile = path.join(outDir, `icon-${size}.png`);
    await sharp(src).resize(size, size).png().toFile(outFile);
  })
);
