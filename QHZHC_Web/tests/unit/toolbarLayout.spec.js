/* eslint-env jest, node */
import fs from "fs";
import path from "path";
const readText = (...args) => fs.readFileSync(...args).replace(/\r\n/g, "\n");
import { parseComponent } from "vue-template-compiler";

describe("data visualization toolbar layout", () => {
  test("preserves the original map component layout", () => {
    const source = readText(
      path.resolve(
        __dirname,
        "../../src/views/DataVisualization/dataVisualization.vue",
      ),
      "utf-8",
    );
    const template = parseComponent(source).template.content;

    expect(template).toMatch(/<PlanimetricMap\s+v-show="mapType == 1"/);
    expect(template).toMatch(/<StereoscopicMap\s+v-if="mapType === 2"/);
  });

  test("map loading state does not leave an invisible click-blocking mask", () => {
    const source = readText(
      path.resolve(
        __dirname,
        "../../src/views/DataVisualization/dataVisualization.vue",
      ),
      "utf-8",
    );
    const mainSource = readText(
      path.resolve(__dirname, "../../src/main.ts"),
      "utf-8",
    );
    const template = parseComponent(source).template.content;
    const runtimeStylePath = path.resolve(
      __dirname,
      "../../src/assets/css/map-runtime-fixes.scss",
    );

    expect(template).toContain('<div class="map" v-loading="loading">');
    expect(source).not.toContain("map-runtime-fixes.scss");
    expect(mainSource).toContain(
      'import "./assets/css/map-runtime-fixes.scss";',
    );
    expect(fs.existsSync(runtimeStylePath)).toBe(true);
    const runtimeStyle = fs.existsSync(runtimeStylePath)
      ? readText(runtimeStylePath, "utf-8")
      : "";
    expect(runtimeStyle).toMatch(
      /\.map\s*>\s*\.el-loading-mask\.el-loading-fade-leave-active\s*\{[\s\S]*pointer-events:\s*none;/,
    );
  });

  test("gas selector renders options as a two-column card grid", () => {
    const source = readText(
      path.resolve(
        __dirname,
        "../../src/views/DataVisualization/dataVisualization.vue",
      ),
      "utf-8",
    );
    const style = parseComponent(source).styles.map((block) => block.content).join("\n");

    expect(style).toEqual(
      expect.stringContaining(".gas-select {\n            position: absolute;"),
    );
    expect(style).toEqual(expect.stringContaining("width: 220px;"));
    expect(style).toEqual(expect.stringContaining("display: grid;"));
    expect(style).toEqual(
      expect.stringContaining("grid-template-columns: repeat(2, minmax(0, 1fr));"),
    );
    expect(style).toEqual(expect.stringContaining("gap: 8px;"));
    expect(style).toEqual(expect.stringContaining(".gas-item.active {"));
    expect(style).toEqual(
      expect.stringContaining("background: linear-gradient("),
    );
  });
});
