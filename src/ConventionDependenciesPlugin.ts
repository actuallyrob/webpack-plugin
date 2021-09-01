import { BaseIncludePlugin, AddDependency } from "./BaseIncludePlugin";
import { preserveModuleName } from "./PreserveModuleNamePlugin";
import minimatch = require("minimatch");
import path = require("path");
import * as webpack from 'webpack';

export type Convention = (filename: string) => string;

export class ConventionDependenciesPlugin extends BaseIncludePlugin {
  conventions: Convention[];

  /**
   * glob: a pattern that filters which files are affected
   */
  constructor(
    private glob: string,
    conventions: string | Convention | (string | Convention)[] = [".html", ".htm"]
  ) {
    super();
    if (!Array.isArray(conventions)) conventions = [conventions];
    this.conventions = conventions.map(c => typeof c === "string"
      ? swapExtension.bind(null, c)
      : c
    );
  }

  parser(compilation: webpack.Compilation, parser: webpack.javascript.JavascriptParser, addDependency: AddDependency) {
    const root = path.resolve();

    parser.hooks.program.tap("Aurelia:ConventionDependencies", () => {
      const { resource: file, rawRequest } = parser.state.current;
      if (!file) {
        return;
      }
      // We don't want to bring in dependencies of the async! loader
      if (/^async[!?]/.test(rawRequest)) {
        return;
      }
      if (!minimatch(path.relative(root, file), this.glob, {dot: true})) {
        return;
      }

      for (let c of this.conventions) {
        try {
          const probe = c(file);
          // Check if file exists
          (compilation.inputFileSystem as typeof import('fs')).statSync(probe);
          let relative = path.relative(path.dirname(file), probe);
          if (!relative.startsWith(".")) {
            relative = "./" + relative;
          }
          addDependency(relative);
          // If the module has a conventional dependency, make sure we preserve its name as well.
          // This solves the pattern where a VM is statically loaded, e.g. `import { ViewModel } from "x"`
          // and then passed to Aurelia, e.g. with `aurelia-dialog`.
          // At this point Aurelia must determine the origin of the module to be able to look for 
          // a conventional view, and so the module name must be preserved although it's never loaded 
          // by `aurelia-loader`. See also aurelia/metadata#51.
          parser.state.current[preserveModuleName] = true;
        } 
        catch (ex) { }
      }
    });
  }
};

function swapExtension(newExtension: string, file: string) {
  return file.replace(/\.[^\\/.]*$/, "") + newExtension;
}
