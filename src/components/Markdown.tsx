import { Fragment, type ReactNode } from "react";

/**
 * Tiny Markdown renderer for agent-written prose: "## " headings, "- " bullets,
 * **bold**, *italic* and paragraphs. It builds React elements (no HTML strings),
 * so nothing the model writes can inject markup.
 */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  // **bold**, *italic*, and [label](https://…) links (web addresses only; opened in a new tab).
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={m.index} className="font-semibold text-text">{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<em key={m.index}>{m[2]}</em>);
    else
      out.push(
        <a
          key={m.index}
          href={m[4]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted underline decoration-faint underline-offset-4 hover:text-text focus-visible:outline-2 focus-visible:outline-dawn"
        >
          {m[3]}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push(<p key={blocks.length}>{inline(para.join(" "))}</p>);
      para = [];
    }
    if (bullets.length) {
      blocks.push(
        <ul key={blocks.length} className="list-disc space-y-1.5 pl-5 marker:text-faint">
          {bullets.map((b, i) => (
            <li key={i}>{inline(b)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (!line) flush();
    else if (heading) {
      flush();
      blocks.push(
        <h3 key={blocks.length} className="pt-2 font-sans text-sm font-medium text-muted">
          {heading[1].replace(/\*\*/g, "")}
        </h3>,
      );
    } else if (bullet) {
      if (para.length) flush();
      bullets.push(bullet[1]);
    } else {
      if (bullets.length) flush();
      para.push(line);
    }
  }
  flush();
  return <div className={`space-y-4 ${className}`}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
