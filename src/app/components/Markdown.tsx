import type { JSX } from 'preact';

/**
 * A deliberately tiny markdown renderer for note previews: paragraphs,
 * bullet lists, quotes, headings, checkboxes, and [[wikilinks]] shown as
 * plain emphasis. No dependency, no HTML injection — everything renders
 * through text nodes.
 */

function renderInline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  const re = /\[\[([^\]]+)\]\]|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) parts.push(<em key={key++} class="wikilink">{m[1]}</em>);
    else if (m[2] !== undefined) parts.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[3] !== undefined) parts.push(<code key={key++}>{m[3]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ text }: { text: string }) {
  const blocks: JSX.Element[] = [];
  let list: string[] = [];
  let key = 0;

  const flushList = (): void => {
    if (list.length > 0) {
      blocks.push(
        <ul key={key++}>
          {list.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(line);
    if (bullet) {
      list.push(bullet[1]!);
      continue;
    }
    flushList();
    if (line.trim() === '') continue;
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(<h4 key={key++}>{renderInline(heading[2]!)}</h4>);
    } else if (line.startsWith('> ')) {
      blocks.push(<blockquote key={key++}>{renderInline(line.slice(2))}</blockquote>);
    } else {
      blocks.push(<p key={key++}>{renderInline(line)}</p>);
    }
  }
  flushList();
  return <div class="md">{blocks}</div>;
}
