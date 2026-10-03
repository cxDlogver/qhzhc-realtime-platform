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

module.exports = function typescriptTranspileLoader(source, inputSourceMap) {
  const callback = this.async();
  const typescript = loadTypeScript();
  const result = typescript.transpileModule(source, {
    fileName: this.resourcePath,
    compilerOptions: {
      target: typescript.ScriptTarget.ES2020,
      module: typescript.ModuleKind.ESNext,
      moduleResolution: typescript.ModuleResolutionKind.NodeJs,
      sourceMap: true,
      inlineSources: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      preserveConstEnums: true,
    },
    reportDiagnostics: true,
  });

  const diagnostics = result.diagnostics || [];
  for (const diagnostic of diagnostics) {
    const message = typescript.flattenDiagnosticMessageText(
      diagnostic.messageText,
      "\n",
    );
    if (diagnostic.category === typescript.DiagnosticCategory.Error) {
      this.emitError(new Error(message));
    } else {
      this.emitWarning(new Error(message));
    }
  }

  const sourceMap = result.sourceMapText
    ? JSON.parse(result.sourceMapText)
    : inputSourceMap;
  callback(null, result.outputText, sourceMap);
};
