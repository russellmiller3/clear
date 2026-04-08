// =============================================================================
// CLEAR LANGUAGE — TOKENIZER
// =============================================================================
//
// PURPOSE: Clear is a programming language designed for AI to WRITE and humans
// to READ. This tokenizer turns Clear source text into tokens for the parser.
//
// !! MAINTENANCE RULE: Update this diagram whenever you change the tokenizer's
// !! data flow, add new token types, or change synonym resolution.
//
// ARCHITECTURE:
//
//   Clear Source Text
//       │
//       ▼
//   ┌─────────────────────────────────────────────────────┐
//   │  tokenize(source)                                    │
//   │                                                      │
//   │  1. Split into lines (preserving indent depth)       │
//   │  2. For each line:                                   │
//   │     ┌──────────────────────────────────────────┐     │
//   │     │  tokenizeLine(text)                      │     │
//   │     │                                          │     │
//   │     │  a. Skip comments (# to EOL)             │     │
//   │     │  b. Match multi-word synonyms FIRST      │     │
//   │     │     (greedy, longest match wins)          │     │
//   │     │  c. Resolve single-word synonyms          │     │
//   │     │  d. Parse: strings, numbers, operators,   │     │
//   │     │     possessives (person's name),          │     │
//   │     │     identifiers, parens, brackets         │     │
//   │     │  e. Strip trailing colons (block openers) │     │
//   │     └──────────────────────────────────────────┘     │
//   │                                                      │
//   │  Output: [{ indent, tokens: [Token] }]               │
//   └─────────────────────────────────────────────────────┘
//       │
//       ▼
//   Array of TokenizedLine → fed to parser.js
//
// TOKEN TYPES:
//   KEYWORD ...... canonical keyword (resolved from synonym table)
//   IDENTIFIER ... variable or function name
//   NUMBER ....... numeric literal (JS number, not string)
//   STRING ....... string literal (single or double quotes)
//   OPERATOR ..... arithmetic: + - * / % **
//   ASSIGN ....... =
//   COMPARE ...... > < >= <=
//   LPAREN/RPAREN  ( )
//   LBRACKET/RBRACKET  [ ]
//   COMMA ........ ,
//   POSSESSIVE ... 's (person's → object + member)
//   COLON ........ : (block opener, stripped from line end)
//   DOT .......... . (decimal or member access)
//
// KEY INVARIANT: Synonyms are resolved during tokenization. By the time the
// parser sees tokens, every keyword is in canonical form. The parser never
// sees "define", "create", "make" — it sees the canonical equivalent.
//
// DEPENDENCIES: synonyms.js (REVERSE_LOOKUP, MULTI_WORD_SYNONYMS)
// DEPENDENTS:   parser.js (consumes tokenized output)
//
// =============================================================================

import { REVERSE_LOOKUP, MULTI_WORD_SYNONYMS } from './synonyms.js';

// Token types
export const TokenType = Object.freeze({
  KEYWORD: 'keyword',       // Canonical keyword (resolved from synonym)
  IDENTIFIER: 'identifier', // Variable or function name
  NUMBER: 'number',         // Numeric literal
  STRING: 'string',         // String literal
  OPERATOR: 'operator',     // Arithmetic: + - * / % **
  ASSIGN: 'assign',         // =
  COMPARE: 'compare',       // >, <, >=, <=
  LPAREN: 'lparen',         // (
  RPAREN: 'rparen',         // )
  LBRACKET: 'lbracket',     // [
  RBRACKET: 'rbracket',     // ]
  COMMA: 'comma',           // ,
  DOT: 'dot',               // . (property access — silent alias, canonical is 's)
  POSSESSIVE: 'possessive',  // 's (person's name)
  COMMENT: 'comment',       // # rest of line
  NEWLINE: 'newline',       // End of line
  COLON: 'colon',           // : (block opener or route param)
  LBRACE: 'lbrace',         // {
  RBRACE: 'rbrace',         // }
});

// Single-character token map
const SINGLE_CHAR_TOKENS = {
  '(': TokenType.LPAREN,
  ')': TokenType.RPAREN,
  '[': TokenType.LBRACKET,
  ']': TokenType.RBRACKET,
  ',': TokenType.COMMA,
  '+': TokenType.OPERATOR,
  '-': TokenType.OPERATOR,
  '/': TokenType.OPERATOR,
};

/**
 * Tokenize a single line of Clear source code.
 *
 * @param {string} line - One line of source text
 * @param {number} lineNumber - 1-based line number (for error reporting)
 * @returns {Array<{type: string, value: string|number, canonical?: string, line: number, column: number}>}
 */
export function tokenizeLine(line, lineNumber = 1) {
  const tokens = [];
  let pos = 0;

  while (pos < line.length) {
    // Skip whitespace
    if (line[pos] === ' ' || line[pos] === '\t') {
      pos++;
      continue;
    }

    // Comment: # to end of line
    if (line[pos] === '#') {
      tokens.push({
        type: TokenType.COMMENT,
        value: line.slice(pos + 1).trim(),
        line: lineNumber,
        column: pos + 1,
      });
      break;
    }

    // Possessive: person's → IDENTIFIER(person) + POSSESSIVE
    // Must come BEFORE string literal check.
    // Rule: 's after a word char, followed by space/end/non-word = possessive
    if (line[pos] === "'" && pos > 0 && isWordChar(line[pos - 1]) &&
        pos + 1 < line.length && line[pos + 1] === 's' &&
        (pos + 2 >= line.length || !isWordChar(line[pos + 2]))) {
      tokens.push({
        type: TokenType.POSSESSIVE,
        value: "'s",
        line: lineNumber,
        column: pos + 1,
      });
      pos += 2; // skip 's
      continue;
    }

    // String literal: "..." or '...'
    if (line[pos] === '"' || line[pos] === "'") {
      const quote = line[pos];
      const start = pos;
      pos++; // skip opening quote
      let str = '';
      while (pos < line.length && line[pos] !== quote) {
        if (line[pos] === '\\' && pos + 1 < line.length) {
          pos++; // skip escape character
          if (line[pos] === 'n') str += '\n';
          else if (line[pos] === 't') str += '\t';
          else str += line[pos];
        } else {
          str += line[pos];
        }
        pos++;
      }
      if (pos < line.length) pos++; // skip closing quote
      tokens.push({
        type: TokenType.STRING,
        value: str,
        line: lineNumber,
        column: start + 1,
      });
      continue;
    }

    // Number literal (including negative numbers at start of line or after operator)
    if (
      isDigit(line[pos]) ||
      (line[pos] === '-' && pos + 1 < line.length && isDigit(line[pos + 1]) &&
        (tokens.length === 0 || isOperatorOrOpen(tokens[tokens.length - 1])))
    ) {
      const start = pos;
      if (line[pos] === '-') pos++;
      while (pos < line.length && isDigit(line[pos])) pos++;
      if (pos < line.length && line[pos] === '.' && pos + 1 < line.length && isDigit(line[pos + 1])) {
        pos++; // skip decimal point
        while (pos < line.length && isDigit(line[pos])) pos++;
      }
      tokens.push({
        type: TokenType.NUMBER,
        value: parseFloat(line.slice(start, pos)),
        line: lineNumber,
        column: start + 1,
      });
      continue;
    }

    // Multi-character operators: **, >=, <=
    if (pos + 1 < line.length) {
      const twoChar = line.slice(pos, pos + 2);
      if (twoChar === '**') {
        tokens.push({ type: TokenType.OPERATOR, value: '**', line: lineNumber, column: pos + 1 });
        pos += 2;
        continue;
      }
      if (twoChar === '>=' || twoChar === '<=') {
        tokens.push({ type: TokenType.COMPARE, value: twoChar, line: lineNumber, column: pos + 1 });
        pos += 2;
        continue;
      }
    }

    // Comparison operators (single char)
    if (line[pos] === '>' || line[pos] === '<') {
      tokens.push({ type: TokenType.COMPARE, value: line[pos], line: lineNumber, column: pos + 1 });
      pos++;
      continue;
    }

    // Assignment or equality: = vs ==
    if (line[pos] === '=') {
      if (pos + 1 < line.length && line[pos + 1] === '=') {
        tokens.push({ type: TokenType.COMPARE, value: '==', line: lineNumber, column: pos + 1 });
        pos += 2;
      } else {
        tokens.push({ type: TokenType.ASSIGN, value: '=', line: lineNumber, column: pos + 1 });
        pos++;
      }
      continue;
    }

    // Asterisk: could be * or ** (** already handled above)
    if (line[pos] === '*') {
      tokens.push({ type: TokenType.OPERATOR, value: '*', line: lineNumber, column: pos + 1 });
      pos++;
      continue;
    }

    // Caret: ^ is an alias for ** (power operator)
    if (line[pos] === '^') {
      tokens.push({ type: TokenType.OPERATOR, value: '**', line: lineNumber, column: pos + 1 });
      pos++;
      continue;
    }

    // Dot: property access (person.name)
    // Only if preceded by an identifier/keyword token (not a number — decimals handled above)
    if (line[pos] === '.') {
      tokens.push({ type: TokenType.DOT, value: '.', line: lineNumber, column: pos + 1 });
      pos++;
      continue;
    }

    // Colon: block opener or route param — parser decides meaning
    if (line[pos] === ':') {
      tokens.push({ type: TokenType.COLON, value: ':', line: lineNumber, column: pos + 1 });
      pos++;
      continue;
    }

    // Braces: interpolation — parser decides meaning
    if (line[pos] === '{') {
      tokens.push({ type: TokenType.LBRACE, value: '{', line: lineNumber, column: pos + 1 });
      pos++;
      continue;
    }
    if (line[pos] === '}') {
      tokens.push({ type: TokenType.RBRACE, value: '}', line: lineNumber, column: pos + 1 });
      pos++;
      continue;
    }

    // Single-character tokens
    if (SINGLE_CHAR_TOKENS[line[pos]]) {
      tokens.push({
        type: SINGLE_CHAR_TOKENS[line[pos]],
        value: line[pos],
        line: lineNumber,
        column: pos + 1,
      });
      pos++;
      continue;
    }

    // Words: keywords, identifiers, multi-word synonyms
    if (isWordChar(line[pos])) {
      // Try multi-word synonym match (greedy, longest first)
      const remaining = line.slice(pos).toLowerCase();
      let matchedSynonym = null;
      for (const phrase of MULTI_WORD_SYNONYMS) {
        if (remaining.startsWith(phrase) &&
            (remaining.length === phrase.length || !isWordChar(remaining[phrase.length]))) {
          matchedSynonym = phrase;
          break;
        }
      }

      if (matchedSynonym) {
        const canonical = REVERSE_LOOKUP[matchedSynonym];
        tokens.push({
          type: TokenType.KEYWORD,
          value: matchedSynonym,
          canonical,
          rawValue: matchedSynonym,
          line: lineNumber,
          column: pos + 1,
        });
        pos += matchedSynonym.length;
        continue;
      }

      // Single word
      const start = pos;
      while (pos < line.length && isWordChar(line[pos])) pos++;
      const word = line.slice(start, pos);
      const lower = word.toLowerCase();

      // Check if it's a keyword synonym
      const canonical = REVERSE_LOOKUP[lower];
      if (canonical) {
        tokens.push({
          type: TokenType.KEYWORD,
          value: word,
          canonical,
          rawValue: lower,
          line: lineNumber,
          column: start + 1,
        });
      } else {
        tokens.push({
          type: TokenType.IDENTIFIER,
          value: word,
          line: lineNumber,
          column: start + 1,
        });
      }
      continue;
    }

    // Unknown character — skip with warning (parser will handle errors)
    pos++;
  }

  return tokens;
}

/**
 * Tokenize an entire Clear program (multi-line string).
 * Tracks indentation level for each line (used for block structure).
 *
 * @param {string} source - Full Clear program source
 * @returns {Array<{tokens: Array<{type, value, canonical?, line, column}>, indent: number}>}
 *          Array of objects, one per non-empty line, with tokens and indentation level
 */
export function tokenize(source) {
  const lines = source.split('\n');
  const result = [];
  let inBlockComment = false;
  let blockCommentLines = [];
  let blockCommentStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Multi-line comment: ### ... ###
    if (trimmed === '###') {
      if (inBlockComment) {
        // Closing ###: emit accumulated comment lines as a single COMMENT token
        const commentText = blockCommentLines.join('\n');
        result.push({
          tokens: [{
            type: TokenType.COMMENT,
            value: commentText,
            line: blockCommentStartLine,
            column: 1,
          }],
          indent: 0,
        });
        inBlockComment = false;
        blockCommentLines = [];
      } else {
        // Opening ###
        inBlockComment = true;
        blockCommentStartLine = i + 1;
        blockCommentLines = [];
      }
      continue;
    }

    if (inBlockComment) {
      blockCommentLines.push(raw.trimEnd());
      continue;
    }

    if (trimmed === '') continue; // skip blank lines

    // Measure indentation: count leading spaces (tabs count as 2 spaces)
    let indent = 0;
    for (let j = 0; j < raw.length; j++) {
      if (raw[j] === ' ') indent++;
      else if (raw[j] === '\t') indent += 2;
      else break;
    }

    // Tokenize the full line — colons are preserved as COLON tokens.
    // Strip trailing COLON (block opener) at tokenizer level so all parsers
    // see a clean token array. Mid-line colons (route params) are preserved.
    const tokens = tokenizeLine(trimmed, i + 1);
    if (tokens.length > 0 && tokens[tokens.length - 1].type === TokenType.COLON) {
      tokens.pop();
    }
    result.push({ tokens, indent, raw: trimmed });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}

function isWordChar(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
         (ch >= '0' && ch <= '9') || ch === '_';
}

function isOperatorOrOpen(token) {
  return token.type === TokenType.OPERATOR ||
         token.type === TokenType.ASSIGN ||
         token.type === TokenType.COMPARE ||
         token.type === TokenType.LPAREN ||
         token.type === TokenType.LBRACKET ||
         token.type === TokenType.COMMA;
}
