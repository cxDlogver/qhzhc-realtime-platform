const path = require("node:path");

function loadTypeScript() {
  try {
    return require("typescript");
  } catch (_error) {
    return require(path.resolve(
      __dirname,
      "../../QHZHC_Server/node_modules/typescript",
    ));
  }
}

module.exports = {
  process(source, sourcePath) {
    const typescript = loadTypeScript();
    const result = typescript.transpileModule(source, {
      fileName: sourcePath,
      compilerOptions: {
        target: typescript.ScriptTarget.ES2020,
        module: typescript.ModuleKind.CommonJS,
        moduleResolution: typescript.ModuleResolutionKind.NodeJs,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        sourceMap: true,
      },
    });
    return { code: result.outputText, map: result.sourceMapText || undefined };
  },
};
