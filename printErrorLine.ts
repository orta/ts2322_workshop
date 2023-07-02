import ts, { NodeBuilderFlags, Type, TypeFormatFlags } from "../TypeScript/built/local/typescript";

/// This is all C&P'd

const underlineColor = "\u001b[91m";
const newline = "\n";

export function formatCodeSpan(file: ts.SourceFile, start: number, length: number, indent: string) {
  const { line: firstLine, character: firstLineChar } = ts.getLineAndCharacterOfPosition(file, start);
  const { line: lastLine, character: lastLineChar } = ts.getLineAndCharacterOfPosition(file, start + length);
  const lastLineInFile = ts.getLineAndCharacterOfPosition(file, file.text.length).line;

  const gutterWidth = 1;
  const hasMoreThanFiveLines = lastLine - firstLine >= 4;
  // Dedent all of the code lines consistently
  let whitespaceToTrim = Number.MAX_VALUE;
  for (let i = firstLine; i <= lastLine; i++) {
    if (hasMoreThanFiveLines && firstLine + 1 < i && i < lastLine - 1) {
      i = lastLine - 1;
    }

    const lineStart = ts.getPositionOfLineAndCharacter(file, i, 0);
    const lineEnd = i < lastLineInFile ? ts.getPositionOfLineAndCharacter(file, i + 1, 0) : file.text.length;
    const lineContent = file.text.slice(lineStart, lineEnd);
    whitespaceToTrim = Math.min(whitespaceToTrim, startWhitespaceCount(lineContent));
  }

  let context = "";
  for (let i = firstLine; i <= lastLine; i++) {
    context += newline;
    // If the error spans over 5 lines, we'll only show the first 2 and last 2 lines,
    // so we'll skip ahead to the second-to-last line.
    if (hasMoreThanFiveLines && firstLine + 1 < i && i < lastLine - 1) {
      context += indent + formatColorAndReset(padLeft(ellipsis, gutterWidth), gutterStyleSequence) + gutterSeparator + newline;
      i = lastLine - 1;
    }

    const lineStart = ts.getPositionOfLineAndCharacter(file, i, 0);
    const lineEnd = i < lastLineInFile ? ts.getPositionOfLineAndCharacter(file, i + 1, 0) : file.text.length;
    let lineContent = file.text.slice(lineStart, lineEnd);
    lineContent = lineContent.slice(whitespaceToTrim); // remove preceding whitespace
    lineContent = lineContent.trimEnd(); // trim from end
    lineContent = lineContent.replace(/\t/g, " "); // convert tabs to single spaces

    // Output the gutter and the actual contents of the line.
    const gutterLine = "|";
    context += indent + padLeft(gutterLine, gutterWidth) + gutterSeparator;
    context += lineContent + newline;

    // Output the error span for the line using an underline.
    context += indent + padLeft("", gutterWidth) + gutterSeparator;
    context += underlineColor;
    if (i === firstLine) {
      // If we're on the last line, then limit it to the last character of the last line.
      // Otherwise, we'll just underline the rest of the line, giving 'slice' no end position.
      const lastCharForLine = i === lastLine ? lastLineChar : undefined;

      context += lineContent.slice(0, firstLineChar - whitespaceToTrim).replace(/\S/g, " ");
      const amendedLastChar = lastCharForLine ? lastCharForLine - whitespaceToTrim : undefined;
      context += lineContent.slice(firstLineChar - whitespaceToTrim, amendedLastChar).replace(/./g, "▔");
    } else if (i === lastLine) {
      context += lineContent.slice(0, lastLineChar).replace(/./g, "▔");
    } else {
      // Underline the entire line.
      context += lineContent.replace(/./g, "▔");
    }
    context += resetEscapeSequence;
  }
  return context;
}
const gutterStyleSequence = "\u001b[7m";
const gutterSeparator = " ";
const resetEscapeSequence = "\u001b[0m";
const ellipsis = "...";
const halfIndent = "  ";
const indent = "    ";
export function startWhitespaceCount(s: string) {
  for (let i = 0; i < s.length; i++) {
    if (!isWhiteSpaceLike(s.charCodeAt(i))) return i;
  }
  return s.length;
}

/** @internal */
export function formatColorAndReset(text: string, formatStyle: string) {
  return formatStyle + text + resetEscapeSequence;
}

/**
 * Returns string left-padded with spaces or zeros until it reaches the given length.
 *
 * @param s String to pad.
 * @param length Final padded length. If less than or equal to 's.length', returns 's' unchanged.
 * @param padString Character to use as padding (default " ").
 *
 * @internal
 */
export function padLeft(s: string, length: number, padString: " " | "0" = " ") {
  return length <= s.length ? s : padString.repeat(length - s.length) + s;
}

export function isWhiteSpaceLike(ch: number): boolean {
  return isWhiteSpaceSingleLine(ch) || isLineBreak(ch);
}

/** Does not include line breaks. For that, see isWhiteSpaceLike. */
export function isWhiteSpaceSingleLine(ch: number): boolean {
  // Note: nextLine is in the Zs space, and should be considered to be a whitespace.
  // It is explicitly not a line-break as it isn't in the exact set specified by EcmaScript.
  return (
    ch === CharacterCodes.space ||
    ch === CharacterCodes.tab ||
    ch === CharacterCodes.verticalTab ||
    ch === CharacterCodes.formFeed ||
    ch === CharacterCodes.nonBreakingSpace ||
    ch === CharacterCodes.nextLine ||
    ch === CharacterCodes.ogham ||
    (ch >= CharacterCodes.enQuad && ch <= CharacterCodes.zeroWidthSpace) ||
    ch === CharacterCodes.narrowNoBreakSpace ||
    ch === CharacterCodes.mathematicalSpace ||
    ch === CharacterCodes.ideographicSpace ||
    ch === CharacterCodes.byteOrderMark
  );
}

export function isLineBreak(ch: number): boolean {
  // ES5 7.3:
  // The ECMAScript line terminator characters are listed in Table 3.
  //     Table 3: Line Terminator Characters
  //     Code Unit Value     Name                    Formal Name
  //     \u000A              Line Feed               <LF>
  //     \u000D              Carriage Return         <CR>
  //     \u2028              Line separator          <LS>
  //     \u2029              Paragraph separator     <PS>
  // Only the characters in Table 3 are treated as line terminators. Other new line or line
  // breaking characters are treated as white space but not as line terminators.

  return (
    ch === CharacterCodes.lineFeed ||
    ch === CharacterCodes.carriageReturn ||
    ch === CharacterCodes.lineSeparator ||
    ch === CharacterCodes.paragraphSeparator
  );
}

/** @internal */
export const enum CharacterCodes {
  nullCharacter = 0,
  maxAsciiCharacter = 0x7f,

  lineFeed = 0x0a, // \n
  carriageReturn = 0x0d, // \r
  lineSeparator = 0x2028,
  paragraphSeparator = 0x2029,
  nextLine = 0x0085,

  // Unicode 3.0 space characters
  space = 0x0020, // " "
  nonBreakingSpace = 0x00a0, //
  enQuad = 0x2000,
  emQuad = 0x2001,
  enSpace = 0x2002,
  emSpace = 0x2003,
  threePerEmSpace = 0x2004,
  fourPerEmSpace = 0x2005,
  sixPerEmSpace = 0x2006,
  figureSpace = 0x2007,
  punctuationSpace = 0x2008,
  thinSpace = 0x2009,
  hairSpace = 0x200a,
  zeroWidthSpace = 0x200b,
  narrowNoBreakSpace = 0x202f,
  ideographicSpace = 0x3000,
  mathematicalSpace = 0x205f,
  ogham = 0x1680,

  // Unicode replacement character produced when a byte sequence is invalid
  replacementCharacter = 0xfffd,

  _ = 0x5f,
  $ = 0x24,

  _0 = 0x30,
  _1 = 0x31,
  _2 = 0x32,
  _3 = 0x33,
  _4 = 0x34,
  _5 = 0x35,
  _6 = 0x36,
  _7 = 0x37,
  _8 = 0x38,
  _9 = 0x39,

  a = 0x61,
  b = 0x62,
  c = 0x63,
  d = 0x64,
  e = 0x65,
  f = 0x66,
  g = 0x67,
  h = 0x68,
  i = 0x69,
  j = 0x6a,
  k = 0x6b,
  l = 0x6c,
  m = 0x6d,
  n = 0x6e,
  o = 0x6f,
  p = 0x70,
  q = 0x71,
  r = 0x72,
  s = 0x73,
  t = 0x74,
  u = 0x75,
  v = 0x76,
  w = 0x77,
  x = 0x78,
  y = 0x79,
  z = 0x7a,

  A = 0x41,
  B = 0x42,
  C = 0x43,
  D = 0x44,
  E = 0x45,
  F = 0x46,
  G = 0x47,
  H = 0x48,
  I = 0x49,
  J = 0x4a,
  K = 0x4b,
  L = 0x4c,
  M = 0x4d,
  N = 0x4e,
  O = 0x4f,
  P = 0x50,
  Q = 0x51,
  R = 0x52,
  S = 0x53,
  T = 0x54,
  U = 0x55,
  V = 0x56,
  W = 0x57,
  X = 0x58,
  Y = 0x59,
  Z = 0x5a,

  ampersand = 0x26, // &
  asterisk = 0x2a, // *
  at = 0x40, // @
  backslash = 0x5c, // \
  backtick = 0x60, // `
  bar = 0x7c, // |
  caret = 0x5e, // ^
  closeBrace = 0x7d, // }
  closeBracket = 0x5d, // ]
  closeParen = 0x29, // )
  colon = 0x3a, // :
  comma = 0x2c, // ,
  dot = 0x2e, // .
  doubleQuote = 0x22, // "
  equals = 0x3d, // =
  exclamation = 0x21, // !
  greaterThan = 0x3e, // >
  hash = 0x23, // #
  lessThan = 0x3c, // <
  minus = 0x2d, // -
  openBrace = 0x7b, // {
  openBracket = 0x5b, // [
  openParen = 0x28, // (
  percent = 0x25, // %
  plus = 0x2b, // +
  question = 0x3f, // ?
  semicolon = 0x3b, // ;
  singleQuote = 0x27, // '
  slash = 0x2f, // /
  tilde = 0x7e, // ~

  backspace = 0x08, // \b
  formFeed = 0x0c, // \f
  byteOrderMark = 0xfeff,
  tab = 0x09, // \t
  verticalTab = 0x0b, // \v
}
