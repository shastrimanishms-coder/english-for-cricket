import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

/**
 * Minimal, safe rich-text rendering for CMS page content (moved here
 * from src/app/p/[slug].tsx in Round 78 so the help popups and the
 * Support page render the same format). The content is parsed into
 * React Native elements - it is never injected as HTML.
 * Supported markup (anything else renders as literal text):
 *  - Paragraphs are split on blank lines; single line breaks inside a
 *    paragraph are preserved.
 *  - Lines starting '# ', '## ' or '### ' are headings.
 *  - Consecutive lines starting '- ' or '* ' form a bullet list.
 *  - **bold** and *italic* spans work inline.
 * Content without any markup renders as the same plain paragraphs it
 * always did.
 */
export function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <Text key={key} className="font-bold">
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <Text key={key} className="italic">
          {part.slice(1, -1)}
        </Text>
      );
    }
    return part;
  });
}

function headingNode(line: string, key: string): ReactNode | null {
  if (line.startsWith('### ')) {
    return (
      <Text key={key} className="font-display text-lg font-semibold text-navy mt-4 mb-3">
        {renderInline(line.slice(4), key)}
      </Text>
    );
  }
  if (line.startsWith('## ')) {
    return (
      <Text key={key} className="font-display text-xl font-semibold text-navy mt-5 mb-3">
        {renderInline(line.slice(3), key)}
      </Text>
    );
  }
  if (line.startsWith('# ')) {
    return (
      <Text key={key} className="font-display text-2xl font-semibold text-navy mt-6 mb-3">
        {renderInline(line.slice(2), key)}
      </Text>
    );
  }
  return null;
}

function renderBlock(lines: string[], key: string): ReactNode {
  // A heading line may share its block with the lines that follow
  // it (the help texts are written that way: a "## How to use"
  // heading directly above its "- " steps). Peel the heading off
  // and render the rest of the block after it.
  if (lines.length > 1) {
    const heading = headingNode(lines[0], `${key}-h`);
    if (heading) {
      return (
        <View key={key}>
          {heading}
          {renderBlock(lines.slice(1), `${key}-r`)}
        </View>
      );
    }
  }
  if (lines.length === 1) {
    const heading = headingNode(lines[0], key);
    if (heading) return heading;
  }

  const isBulletList = lines.every((line) => line.startsWith('- ') || line.startsWith('* '));
  if (isBulletList) {
    return (
      <View key={key} className="mb-4">
        {lines.map((line, lineIndex) => (
          <View key={`${key}-${lineIndex}`} className="flex-row mb-1.5">
            <Text className="font-sans text-base text-gold-dark leading-relaxed mr-2">•</Text>
            <Text className="flex-1 font-sans text-base text-slate-600 leading-relaxed">
              {renderInline(line.slice(2), `${key}-${lineIndex}`)}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  return (
    <Text key={key} className="font-sans text-base text-slate-600 leading-relaxed mb-4">
      {renderInline(lines.join('\n'), key)}
    </Text>
  );
}

export function renderRichText(content: string): ReactNode {
  const blocks = content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  return blocks.map((block, blockIndex) =>
    renderBlock(block.split('\n'), `block-${blockIndex}`)
  );
}
