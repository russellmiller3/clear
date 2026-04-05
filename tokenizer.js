// =============================================================================
// CLEAR LANGUAGE — TOKENIZER
// =============================================================================
//
// PURPOSE: Clear is a programming language designed for AI to WRITE and humans
// to READ. This tokenizer turns Clear source text into tokens for the parser.
//
// Handles:
//   - Multi-word synonym matching (greedy, longest-first)
//   - Resolving synonyms to canonical forms
//   - Number literals, string literals, operators, identifiers
//   - Possessive access (person's name)
//   - Trailing colons stripped (visual block openers like "try:" or "repeat 5 times:")
//   - Comments (# to end of line)
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

    // Strip trailing colon — purely visual block opener (like Python)
    // "try:" → "try", "repeat 5 times:" → "repeat 5 times"
    const cleaned = trimmed.endsWith(':') ? trimmed.slice(0, -1).trimEnd() : trimmed;

    const tokens = tokenizeLine(cleaned, i + 1);
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
