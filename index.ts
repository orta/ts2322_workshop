import { readFileSync } from "fs";
import ts, { NodeBuilderFlags, Type, TypeFormatFlags } from "../TypeScript/built/local/typescript";
import * as tsVFS from "@typescript/vfs";
import { formatCodeSpan } from "./printErrorLine";

// https://gist.github.com/orta/f80db73c6e8211211e3d224a5ab47624

const code = `
const a = { a: { b: 1 }, c :2, d: 3 }
let b = { a: { b: "ok" } }

b = a
`;

const compilerOptions = {
  Lib: [],
} satisfies ts.CompilerOptions;

function compile(): void {
  const fsMap = new Map<string, string>();
  fsMap.set("index.ts", code);
  fsMap.set("/lib.d.ts", readFileSync("../TypeScript/built/local/lib.es5.d.ts", "utf8"));
  fsMap.set("/lib.decorators.d.ts", "// NOOP");
  fsMap.set("/lib.dom.d.ts", "// NOOP");
  fsMap.set("/lib.decorators.legacy.d.ts", "// NOOP");

  const system = tsVFS.createSystem(fsMap);
  const host = tsVFS.createVirtualCompilerHost(system, compilerOptions, ts as any);
  const terminalWidth = system.getWidthOfTerminal?.() ?? process.stdout.columns;
  //   console.log('Terminal size: ' +  + 'x' + process.stdout.rows);

  const program = ts.createProgram({
    rootNames: [...fsMap.keys()],
    options: compilerOptions,
    host: host.compilerHost as any,
  });

  // @ts-expect-error
  ts.Debug.enableDebugInfo();

  let emitResult = program.emit();

  let allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

  allDiagnostics.forEach(diagnostic => {
    // console.log(diagnostic);
    // @ts-ignore
    const [source, target]: [Type, Type] = diagnostic.relatedTypes || [];

    if (diagnostic.file) {
      let { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start!);
      const loc = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);

      // Header
      const leftSide = `● ${diagnostic.file.fileName}:${line + 1}:${character + 1}`;
      const rightSide = `TS${diagnostic.code}`;
      console.log(leftSide.padEnd(terminalWidth - rightSide.length) + rightSide);

      // Code
      console.log(formatCodeSpan(diagnostic.file, diagnostic.start!, diagnostic.length!, ""));

      // console.log(message);
    } else {
      console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    }

    if (diagnostic && diagnostic.file && diagnostic.code === 2322 && source && target && typeof diagnostic.messageText === "object") {
      const checker = program.getTypeChecker();
      const flags =
        NodeBuilderFlags.IgnoreErrors | TypeFormatFlags.AllowUniqueESSymbolType | TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

      const sourceTypeNode = checker.typeToTypeNode(source, diagnostic.file, flags);
      const targetTypeNode = checker.typeToTypeNode(target, diagnostic.file, flags);

      const typePath = diagnostic.messageText.messageText;
      if (sourceTypeNode && targetTypeNode) {
        console.log(typePath, "\n");
        const leftPrint = printTypeNodeForPreview(sourceTypeNode, diagnostic.file);
        const rightPrint = printTypeNodeForPreview(targetTypeNode, diagnostic.file);
        const longestLeft = leftPrint.reduce((a, b) => Math.max(a, b.length), 0);

        const totalLines = Math.max(leftPrint.length, rightPrint.length);
        for (let i = 0; i < totalLines; i++) {
          const left = leftPrint[i] || "";
          const right = rightPrint[i] || "";
          const leftPad = left.padEnd(longestLeft);
          console.log(`${leftPad} ${""}| ${right}`);
        }
      }
    } else {
      let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      console.log(message);
    }
  });

  let exitCode = emitResult.emitSkipped ? 1 : 0;
  console.log();
  console.log(`Process exiting with code '${exitCode}'.\n`);
  process.exit(exitCode);
}
const singleLinePrinter = ts.createPrinter({ omitTrailingSemicolon: true });

compile();
//  index.ts:4:1                                                                        TS2322

const line = "│";

function printTypeNodeForPreview(typeNode: ts.TypeNode, sourceFile: ts.SourceFile) {
  const lines: string[] = [];

  //   console.log(typeNode.__debugKind);
  //   console.log(typeNode.__debugNodeFlags);
  //   console.log(typeNode.__debugModifierFlags);

  if (typeNode.kind === ts.SyntaxKind.TypeLiteral) {
    lines.push("{");

    typeNode.forEachChild(node => {
      if (ts.isPropertySignature(node)) {
        //   console.log(node.name);
        //   const name = node.name.getText(sourceFile);
        //   const type = node.type?.getText(sourceFile);
        const type = printTypeNodeForPreview(node.type!, sourceFile).join("");
        // console.log(node);
        lines.push(`  ${node.name.escapedText}: ${type}`);
      } else {
        //   const lines = singleLingPrinter(node, sourceFile);
        const type = printTypeNodeForPreview(node, sourceFile);
        lines.push(type.join(" "));
      }

      // console.log(node);
      // console.log(node.__debugKind);
      // console.log(node.__debugNodeFlags);
      // console.log(node.__debugModifierFlags);
      //   console.log(node.__debugFlags);
      //   console.log(node.__debugTransformFlags);
      //   console.log(node.__debugCheckFlags);
      //   console.log(node.__debugFlowNodeFlags);
      //   console.log(node.__debugFlowFlags);
      //   console.log(node.__debugFlowAssignmentFlags);
      //   console.log(node.__debugFlowData);
      //   console.log(node.__debugFlowDataComputed);
    });

    //   const isTypeLiteral = typeNode.kind === ts.SyntaxKind.TypeLiteral;

    //   console.log(typeNode);
    // if(typeNode.kind === ts.SyntaxKind.) {
    lines.push("}");
  } else {
    const text = singleLinePrinter.printNode(ts.EmitHint.Unspecified, typeNode, sourceFile);
    lines.push(text);
  }
  return lines;
}
