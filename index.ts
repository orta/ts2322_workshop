import { readFileSync } from "fs"
import ts, { NodeBuilderFlags, Type, TypeFormatFlags } from "../TypeScript/built/local/typescript"
import * as tsVFS from "@typescript/vfs"
import { formatCodeSpan } from "./printErrorLine"
import chalk from "chalk"
import stripAnsi from "strip-ansi"
import { TypeNode } from "typescript"

// https://gist.github.com/orta/f80db73c6e8211211e3d224a5ab47624

// const code = `
// type B = { a: { b: string } }
// type C = { a: { c: string } }

// const a = { a: { b: 1 }, c :2, d: 3 }
// let b:B | C = { a: { b: "ok"} }

// b = a
// `

const code = `var b1: { f(x: string, y: number): void, g: number };
var b2: { f(x: number): void, g: number };
b1 = b2;`

const compilerOptions = {
  Lib: [],
} satisfies ts.CompilerOptions

function compile(): void {
  const fsMap = new Map<string, string>()
  fsMap.set("index.ts", code)
  fsMap.set("/lib.d.ts", readFileSync("../TypeScript/built/local/lib.es5.d.ts", "utf8"))
  fsMap.set("/lib.decorators.d.ts", "// NOOP")
  fsMap.set("/lib.dom.d.ts", "// NOOP")
  fsMap.set("/lib.decorators.legacy.d.ts", "// NOOP")

  const system = tsVFS.createSystem(fsMap)
  const host = tsVFS.createVirtualCompilerHost(system, compilerOptions, ts as any)
  const terminalWidth = system.getWidthOfTerminal?.() ?? process.stdout.columns
  //   console.log('Terminal size: ' +  + 'x' + process.stdout.rows);

  const program = ts.createProgram({
    rootNames: [...fsMap.keys()],
    options: compilerOptions,
    host: host.compilerHost as any,
  })

  // @ts-expect-error
  ts.Debug.enableDebugInfo()

  let emitResult = program.emit()

  let allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics)

  allDiagnostics.forEach(diagnostic => {
    // @ts-ignore
    const [source, target, sourceStack, targetStack]: [Type, Type, Type[], Type[]] = diagnostic.relatedTypes || []
    const indent = "  "

    if (diagnostic.file) {
      let { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start!)
      const loc = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!)

      // Header
      const leftSide = `● ${diagnostic.file.fileName}:${line + 1}:${character + 1}`
      const rightSide = `TS${diagnostic.code}`
      console.log(leftSide.padEnd(terminalWidth - rightSide.length) + rightSide)

      // Code
      console.log(formatCodeSpan(diagnostic.file, diagnostic.start!, diagnostic.length!, indent))

      // console.log(message);
    } else {
      console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
    }

    if (diagnostic && diagnostic.file && diagnostic.code === 2322 && source && target && typeof diagnostic.messageText === "object") {
      const checker = program.getTypeChecker()
      const flags =
        NodeBuilderFlags.IgnoreErrors | TypeFormatFlags.AllowUniqueESSymbolType | TypeFormatFlags.UseAliasDefinedOutsideCurrentScope

      const sourceTypeNode = checker.typeToTypeNode(source, diagnostic.file, flags)
      const targetTypeNode = checker.typeToTypeNode(target, diagnostic.file, flags)

      // MAke the highlight  manually, as I'm not quite smart enough to do it from the sourceStack/targetStack

      let highlightPath: HighlightComponent[] = []
      const maybePath = diagnostic.messageText.next && diagnostic.messageText.next[0] && diagnostic.messageText.next[0].messageText
      if (maybePath && maybePath.endsWith("are incompatible between these types.")) {
        highlightPath = maybePath
          .split("'")
          .slice(1, -1)
          .join()
          .split(".")
          .map(s => ({ type: "field", name: s }))
      }

      if (maybePath && maybePath.endsWith("are incompatible.")) {
        highlightPath = maybePath
          .split("'")
          .slice(1, -1)
          .join()
          .split(".")
          .map(s => ({ type: "field", name: s }))

        const maybeParamsMessage = diagnostic?.messageText?.next?.[0]?.next?.[0]?.next?.[0]?.messageText
        // console.log({ maybeParamsMessage })

        if (
          maybeParamsMessage &&
          maybeParamsMessage.startsWith("Types of parameters") &&
          maybeParamsMessage.endsWith("are incompatible.")
        ) {
          const [_, sourceParam, __, targetParam] = maybeParamsMessage.split("'")
          highlightPath.push({ type: "param", name: sourceParam })
        }
      }

      if (sourceTypeNode && targetTypeNode) {
        const leftPrint = printTypeNodeForPreview(sourceTypeNode, diagnostic.file, 0, { typeStack: sourceStack, highlightPath })
        const rightPrint = printTypeNodeForPreview(targetTypeNode, diagnostic.file, 0, { typeStack: targetStack, highlightPath })

        const leftName = chalk.bold(variableDeclarationNameForType(source, "source"))
        const leftSuffix = getFirstNameForType(source)
        const leftTitle = `Type of '${leftName}'${leftSuffix ? ` (${leftSuffix})` : ""}`

        const leftTitleLength = stripAnsi(leftTitle).length
        const rightName = chalk.bold(variableDeclarationNameForType(target, "target"))
        // const leftSuffix = getFirstNameForType(source)
        const rightTitle = `is not assignable to type of '${rightName}'`

        const longestLeft = leftPrint.reduce((a, b) => Math.max(a, stripAnsi(b).length), 0)

        console.log(
          indent + leftTitle.padEnd(longestLeft + (leftTitle.length - leftTitleLength) + indent.length - 1) + "" + rightTitle + "\n",
        )

        const totalLines = Math.max(leftPrint.length, rightPrint.length)
        for (let i = 0; i < totalLines; i++) {
          const left = leftPrint[i] || ""
          const right = rightPrint[i] || ""
          const leftPad = left.padEnd(longestLeft)
          console.log(`${indent}${leftPad} ${line} ${right}`)
        }
      }
    } else {
      let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
      console.log(message)
    }

    let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    console.log("\n" + chalk.gray(message))
  })

  let exitCode = emitResult.emitSkipped ? 1 : 0
  console.log()
  console.log(`Process exiting with code '${exitCode}'.\n`)
  process.exit(exitCode)
}
const singleLinePrinter = ts.createPrinter({ omitTrailingSemicolon: true })

const line = "│"

type PrintNodeConfig = {
  noPadding?: boolean
  highlightPath?: HighlightComponent[]
  typeStack: ts.Type[]
}

// Type should list all the things we could possibly highlight
type HighlightComponent = { type: "field" | "return" | "param"; name: string }

function getFirstNameForType(type: ts.Type) {
  // console.log({ s: type.getSymbol(), d: type.getSymbol()?.getDeclarations() })
  const declarations = type.getSymbol()?.getDeclarations() ?? []

  // debugger
  return ts.getNameOfDeclaration(declarations[0]) ?? ""
}

function printTypeNodeForPreview(typeNode: ts.TypeNode, sourceFile: ts.SourceFile, depth = 0, config: PrintNodeConfig) {
  const lines: string[] = []

  const highlightNode = config.highlightPath?.[depth]

  if (typeNode.kind === ts.SyntaxKind.TypeLiteral) {
    lines.push("{")

    typeNode.forEachChild(node => {
      // debugger
      if (ts.isMethodSignature(node) && node.type) {
        const padding = "".padEnd((depth + 1) * 2)

        let name = node.name.escapedText.toString()
        const isHighlighted = highlightNode && highlightNode.name === name && highlightNode.type === "field"
        if (isHighlighted) name = chalk.bold(name)

        const params = node.parameters
          .map(p => {
            let name = p.name.escapedText.toString()
            const paramNode = config.highlightPath?.[depth + 1]
            const paramIsHighlighted = highlightNode && paramNode?.name === name && paramNode?.type === "param"
            const wrap = paramIsHighlighted ? chalk.bold : chalk.gray

            const type = !p.type ? "any" : printTypeNodeForPreview(p.type, sourceFile, 0, config).join("")
            return wrap(`${name}: ${type.trim()}`)
          })
          .join(", ")

        const returnType = printTypeNodeForPreview(node.type, sourceFile, 0, config).join("")
        lines.push(`${padding}${name}(${params}): ${returnType}`)
      } else if (ts.isPropertySignature(node) && node.type) {
        let type = printTypeNodeForPreview(node.type, sourceFile, depth + 1, config).join("")

        let field: string = node.name.escapedText.toString()
        const isHighlighted = highlightNode && highlightNode.name === field && highlightNode.type === "field"
        if (isHighlighted) {
          field = chalk.bold(field)
        }

        if (isHighlighted && config.highlightPath?.length === depth + 1) {
          type = chalk.bold.underline(type)
        }
        const padding = "".padEnd((depth + 1) * 2)
        lines.push(`${padding}${field}: ${type} `)
      } else {
        const type = printTypeNodeForPreview(node, sourceFile, depth + 1, config)

        lines.push("".padEnd(depth * 2) + type.join(""))
      }
    })

    //   const isTypeLiteral = typeNode.kind === ts.SyntaxKind.TypeLiteral;

    //   console.log(typeNode);
    // if(typeNode.kind === ts.SyntaxKind.) {
    lines.push("}")
  } else {
    const text = singleLinePrinter.printNode(ts.EmitHint.Unspecified, typeNode, sourceFile)
    const padding = "".padEnd(depth * 2)

    lines.push(padding + text)
  }
  return lines
}

// E.g we want to say "a is not assignable to type b" - this gets the a and b
const variableDeclarationNameForType = (type: Type, side: "source" | "target") => {
  const symbol = type.getSymbol()
  if (symbol) {
    const declarations = symbol.getDeclarations()
    // debugger
    for (const declaration of declarations || []) {
      // debugger
      // if ("name" in declaration && "getText" in declaration.name) {
      //   return declaration.name.getText()
      // }

      if (ts.isUnionTypeNode(declaration)) {
        const types = declaration.types.map(t => t.getText())
        return types.join(" | ")
      }

      if (ts.isTypeLiteralNode(declaration)) {
        if (ts.isTypeAliasDeclaration(declaration.parent)) {
          return declaration.parent.name.getText()
        }
      }
      // if (ts.isTypeAliasDeclaration(declaration)) {
      //   return declaration.name.getText();
      // }
      // if (ts.isInterfaceDeclaration(declaration)) {
      //   return declaration.name.getText();
      // }
      // if (ts.isClassDeclaration(declaration)) {
      //   return declaration.name?.getText() ?? "Class";
      // }
      // if(ts.isFunctionDeclaration(declaration)) {
      //   return declaration.name?.getText() ?? "Function";
      // }
      if (ts.isVariableDeclaration(declaration.parent)) {
        return declaration.parent.name.getText()
      }
      if (ts.isPropertyAssignment(declaration.parent)) {
        return declaration.parent.name.getText()
      }
    }
    return "[unknown]"
  } else {
    if (type.isUnion()) {
      const types = type.types.map(t => variableDeclarationNameForType(t, side))
      return types.join(" | ")
    }

    if (type.isIntersection()) {
      const types = type.types.map(t => variableDeclarationNameForType(t, side))
      return types.join(" & ")
    }
  }
}

compile()
