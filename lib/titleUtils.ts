/**
 * Utility functions for extracting and managing titles from markdown content
 */

/**
 * Extract title from markdown content using the first H1 header
 */
export function extractTitleFromContent(content: string): string {
  if (!content.trim()) {
    return '';
  }

  // Look for the first H1 header (# Title)
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match && h1Match[1]) {
    return h1Match[1].trim();
  }

  // Fallback: use first non-empty line if it's short enough to be a title
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    // Consider it a title if it's under 100 characters and doesn't contain markdown syntax
    if (firstLine.length <= 100 && !firstLine.includes('![') && !firstLine.includes('](')) {
      return firstLine;
    }
  }

  // Final fallback: generate a title
  return `Untitled Post - ${new Date().toLocaleDateString()}`;
}

/**
 * Generate placeholder text that guides users to use H1 format
 */
export function getContentPlaceholder(type: 'blog' | 'memo'): string {
  if (type === 'blog') {
    return `# Your post title here...

Start writing your blog post content here. You can use:

- **Bold text**
- *Italic text*
- [Links](https://example.com)
- ![Images](image-url)
- \`code\` snippets

## Subheadings
Use ## for sections and ### for subsections.`;
  }

  return 'Share a quick thought or idea...';
}

/**
 * Check if content has a proper H1 title
 */
export function hasH1Title(content: string): boolean {
  return /^#\s+.+$/m.test(content);
}

/**
 * Get the content without the title (removes the first H1 if present)
 */
export function getContentWithoutTitle(content: string): string {
  const h1Match = content.match(/^(#\s+.+\n?)/m);
  if (h1Match) {
    return content.replace(h1Match[0], '').trim();
  }
  return content;
}