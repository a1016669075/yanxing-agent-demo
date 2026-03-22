const fs = require("fs");
const path = require("path");

const root = __dirname;
const outDir = path.join(root, "pages-dist");

const filesToCopy = [
  "index.html",
  "styles.css",
];

const dirsToCopy = ["assets", "src"];

function removeDir(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function copyFile(relativePath) {
  const from = path.join(root, relativePath);
  const to = path.join(outDir, relativePath);
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function copyDir(relativePath) {
  const from = path.join(root, relativePath);
  const to = path.join(outDir, relativePath);
  ensureDir(path.dirname(to));
  fs.cpSync(from, to, { recursive: true });
}

removeDir(outDir);
ensureDir(outDir);

filesToCopy.forEach((file) => copyFile(file));
dirsToCopy.forEach((dir) => copyDir(dir));

fs.writeFileSync(path.join(outDir, ".nojekyll"), "");

console.log(`Prepared GitHub Pages bundle at ${outDir}`);
