import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const originalRoot = path.resolve(projectRoot, "../../2024_QH_ZHC/QHZHC_Web");
const currentRoot = path.resolve(projectRoot, "QHZHC_Web");

if (!fs.existsSync(originalRoot)) {
  console.log("Original QHZHC_Web is not adjacent to this project; UI baseline check skipped.");
  process.exit(0);
}

const visualizationFiles = [
  "dataVisualization.vue",
  "components/PlanimetricMap.vue",
  "components/StereoscopicMap.vue",
  "components/Charts.vue",
  "components/Details.vue",
  "components/Weather.vue",
  "components/legend.vue",
  "components/RangeConfig.vue",
];

function styleBlocks(source: string): string {
  const blocks: string[] = [];
  let cursor = 0;
  while (true) {
    const start = source.indexOf("<style", cursor);
    if (start < 0) break;
    const close = source.indexOf("</style>", start);
    if (close < 0) throw new Error("Unclosed style block");
    const end = close + "</style>".length;
    blocks.push(source.slice(start, end));
    cursor = end;
  }
  return blocks.join("\n");
}

function templateBlock(source: string): string {
  const start = source.indexOf("<template");
  const close = source.indexOf("</template>", start);
  if (start < 0 || close < 0) throw new Error("Missing template block");
  return source.slice(start, close + "</template>".length);
}

for (const relativeFile of visualizationFiles) {
  const relativePath = path.join("src/views/DataVisualization", relativeFile);
  const original = fs.readFileSync(path.join(originalRoot, relativePath), "utf8");
  const current = fs.readFileSync(path.join(currentRoot, relativePath), "utf8");
  const originalStyles = styleBlocks(original);
  const currentStyles = styleBlocks(current);
  const desktopStyle = (value: string) =>
    value
      .split("/* 原项目的大屏样式保持不变；这里只修复普通笔记本视口下三列被错误纵向堆叠的问题。 */")[0]
      .split("@media (max-width: 1400px)")[0];
  const stylesMatch =
    relativeFile === "dataVisualization.vue"
      ? desktopStyle(originalStyles) === desktopStyle(currentStyles)
      : originalStyles === currentStyles;
  if (!stylesMatch) {
    throw new Error(`Original visualization style changed: ${relativeFile}`);
  }
  if (templateBlock(original) !== templateBlock(current)) {
    throw new Error(`Original visualization layout changed: ${relativeFile}`);
  }
}

for (const relativePath of ["src/assets/imgs/truck.png", "public/glb/Cesium_Car.glb"]) {
  const digest = (root: string) =>
    createHash("sha256").update(fs.readFileSync(path.join(root, relativePath))).digest("hex");
  if (digest(originalRoot) !== digest(currentRoot)) {
    throw new Error(`Original vehicle asset changed: ${relativePath}`);
  }
}

console.log(
  "Original visualization templates, desktop styles and 2D/3D vehicle assets are unchanged; responsive layout fixes are isolated.",
);
