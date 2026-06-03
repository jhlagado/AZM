import { findLineCommentStart } from './line-comment-scanner.js';

/**
 * Remove an ASM80-style end-of-line comment (`;`), respecting quoted strings.
 */
export function stripLineComment(text: string): string {
  const commentStart = findLineCommentStart(text);
  return commentStart === undefined ? text : text.slice(0, commentStart);
}

/** Trailing `;` comment text, or undefined when absent or whitespace-only. */
export function extractLineComment(text: string): string | undefined {
  const commentStart = findLineCommentStart(text);
  if (commentStart === undefined) {
    return undefined;
  }
  const comment = text.slice(commentStart + 1).trim();
  return comment.length > 0 ? comment : undefined;
}
