import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
const distDir = path.resolve(rootDir, args.dist || "dist");
const outDir = path.resolve(rootDir, args.out || "artifacts");
const packageJsonPath = path.resolve(rootDir, "package.json");
const manifestPath = path.join(distDir, "manifest.json");
const crcTable = createCrcTable();

if (!args["skip-build"]) {
  await execFileAsync(process.execPath, [path.resolve(rootDir, "scripts/build.js")], {
    cwd: rootDir,
    stdio: "inherit"
  });
}

const packageJson = await readJson(packageJsonPath);
const manifest = await readJson(manifestPath);
const sourceVersion = manifest.version || packageJson.version;
const packageVersion = getPackageVersion(sourceVersion);

manifest.version = packageVersion;
manifest.version_name = args["version-name"] || process.env.PACKAGE_VERSION_NAME || packageVersion;
await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

await fs.promises.mkdir(outDir, { recursive: true });

const packageName = sanitizeName(args.name || packageJson.name || "extension");
const zipPath = path.join(outDir, `${packageName}-${packageVersion}.zip`);
await createZipFromDirectory(distDir, zipPath);

const metadata = {
  name: packageJson.name,
  sourceVersion,
  version: packageVersion,
  manifest: "dist/manifest.json",
  zipPath: path.relative(rootDir, zipPath).replaceAll(path.sep, "/"),
  gitSha: process.env.GITHUB_SHA || null,
  gitRef: process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || null,
  pullRequest: process.env.PR_NUMBER || process.env.GITHUB_EVENT_NUMBER || null,
  workflowRunId: process.env.GITHUB_RUN_ID || null,
  workflowRunNumber: process.env.GITHUB_RUN_NUMBER || null,
  packagedAt: new Date().toISOString()
};
const metadataPath = path.join(outDir, "package-info.json");
await fs.promises.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

console.log(`Packaged ${metadata.zipPath}`);
console.log(`Package version ${packageVersion}`);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      continue;
    }

    const [key, inlineValue] = value.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }

    const nextValue = values[index + 1];
    if (!nextValue || nextValue.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = nextValue;
    index += 1;
  }
  return parsed;
}

async function readJson(filePath) {
  return JSON.parse(await fs.promises.readFile(filePath, "utf8"));
}

function getPackageVersion(baseVersion) {
  const explicitVersion = args.version || process.env.PACKAGE_VERSION;
  if (explicitVersion) {
    return validateChromeVersion(explicitVersion);
  }

  const baseParts = parseChromeVersion(baseVersion);
  const basePrefix = baseParts.slice(0, 3);
  while (basePrefix.length < 3) {
    basePrefix.push(0);
  }

  const requestedBuild =
    args["build-number"] ||
    process.env.PACKAGE_BUILD_NUMBER ||
    process.env.GITHUB_RUN_NUMBER;
  const baseBuild = baseParts[3] || 0;
  const buildNumber = requestedBuild
    ? Number.parseInt(requestedBuild, 10)
    : Math.max(baseBuild + 1, Math.floor(Date.now() / 1000) % 65535);

  if (!Number.isInteger(buildNumber) || buildNumber < 0 || buildNumber > 65535) {
    throw new Error(
      `Package build number must be an integer from 0 to 65535; received ${requestedBuild}`
    );
  }

  const version = [...basePrefix, Math.max(buildNumber, baseBuild + 1)].join(".");
  return validateChromeVersion(version);
}

function validateChromeVersion(version) {
  parseChromeVersion(version);
  return version;
}

function parseChromeVersion(version) {
  if (typeof version !== "string" || !/^\d+(\.\d+){0,3}$/.test(version)) {
    throw new Error(`Invalid Chrome extension version: ${version}`);
  }

  const parts = version.split(".").map((part) => Number.parseInt(part, 10));
  for (const part of parts) {
    if (!Number.isInteger(part) || part < 0 || part > 65535) {
      throw new Error(`Invalid Chrome extension version segment in ${version}`);
    }
  }
  return parts;
}

function sanitizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "");
}

async function createZipFromDirectory(sourceDir, targetFile) {
  const files = await listFiles(sourceDir);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const filePath of files) {
    const relativePath = path.relative(sourceDir, filePath).replaceAll(path.sep, "/");
    const nameBuffer = Buffer.from(relativePath);
    const data = await fs.promises.readFile(filePath);
    const stat = await fs.promises.stat(filePath);
    const crc = crc32(data);
    const { dosDate, dosTime } = toDosDateTime(stat.mtime);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(10, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(10, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(files.length, 8);
  endRecord.writeUInt16LE(files.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  await fs.promises.writeFile(targetFile, Buffer.concat([...localParts, centralDirectory, endRecord]));
}

async function listFiles(sourceDir) {
  const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(sourceDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function toDosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  };
}

function createCrcTable() {
  return new Uint32Array(256).map((_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}
