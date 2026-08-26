import { ChevronDown } from "lucide-react";

export type DocTocItem = { text: string; id: string };

/**
 * Table of contents for a long public document.
 *
 * Two renders, one list. Below `sm` it is a collapsed `<details>` — a twelve
 * chapter list at a 44px touch row is ~500px of contents standing between the
 * title and the first paragraph, which on a phone reads as the document
 * refusing to start. From `sm` up it is a plain always-open `<nav>`, where the
 * same list is two short columns and costs nothing.
 *
 * They are separate elements rather than one `<details>` toggled by a media
 * query because `open` is DOM state, not style: modern engines hide closed
 * details content through `::details-content`, which no breakpoint can undo.
 * Only one is ever displayed (the other is `display:none`, so assistive tech
 * skips it).
 */
export function DocContents({ toc }: { toc: DocTocItem[] }) {
  const list = (
    <ol className="ui-public-doc-toc-list">
      {toc.map((item, i) => (
        <li key={item.id}>
          <a href={`#${item.id}`} className="ui-public-doc-toc-link">
            <span className="ui-public-doc-toc-num">{String(i + 1).padStart(2, "0")}</span>
            <span>{item.text}</span>
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <details className="ui-public-doc-toc sm:hidden">
        <summary className="ui-public-doc-toc-title">
          Contents · {toc.length} sections
          <ChevronDown className="ui-public-doc-toc-caret" aria-hidden />
        </summary>
        {list}
      </details>

      <nav className="ui-public-doc-toc hidden sm:block" aria-label="Table of contents">
        <div className="ui-public-doc-toc-title">Contents</div>
        {list}
      </nav>
    </>
  );
}
