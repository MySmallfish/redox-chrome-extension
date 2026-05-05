import { build, context } from "esbuild";
import fs from "fs";
import path from "path";

const watch = process.argv.includes("--watch");
const outdir = "dist";

const staticFiles = [
  { src: "src/popup/popup.html", dest: "dist/popup.html" },
  { src: "src/popup/popup.css", dest: "dist/popup.css" },
  { src: "src/manifest.json", dest: "dist/manifest.json" }
];
const staticDirs = [
  { src: "src/assets", dest: "dist/assets" },
  { src: "data", dest: "dist/data" }
];

const buildConfig = {
  entryPoints: {
    popup: "src/popup/popup.js",
    contentScript: "src/content/contentScript.js",
    background: "src/background.js"
  },
  bundle: true,
  outdir,
  format: "iife",
  target: "es2020",
  sourcemap: watch,
  logLevel: "info",
  legalComments: "none"
};

if (watch) {
  const ctx = await context(buildConfig);
  await ctx.watch();
  await copyStatic();
  watchStatic();
  console.log("Watching for changes...");
} else {
  await fs.promises.rm(outdir, { recursive: true, force: true });
  await build(buildConfig);
  await copyStatic();
}

async function copyStatic() {
  for (const file of staticFiles) {
    await ensureDir(path.dirname(file.dest));
    await fs.promises.copyFile(file.src, file.dest);
  }
  for (const dir of staticDirs) {
    await copyDir(dir.src, dir.dest);
  }
}

function watchStatic() {
  staticFiles.forEach((file) => {
    fs.watch(file.src, { persistent: true }, async () => {
      try {
        await ensureDir(path.dirname(file.dest));
        await fs.promises.copyFile(file.src, file.dest);
      } catch (error) {
        console.error("Failed to copy", file.src, error);
      }
    });
  });
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function copyDir(src, dest) {
  await ensureDir(dest);
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}


