"use client";

import { Fragment, type ReactNode } from "react";

// 较完备且安全的 Markdown 渲染（不使用 dangerouslySetInnerHTML）
// 支持：标题 / 粗体·斜体·删除线 / 行内代码 / 代码块 / 链接 /
//      无序与有序列表（含缩进嵌套）/ 引用 / 分隔线 / GFM 表格 / 段落

/* ---------------- 行内解析 ---------------- */

// 仅允许安全的链接协议，拦截 javascript: 等
function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^(https?:\/\/|mailto:|\/|#|\.\/|\.\.\/)/i.test(h)) return h;
  return null;
}

export type EvidenceClickHandler = (id: string) => void;

function renderInline(
  text: string,
  keyPrefix: string,
  onEvidenceClick?: EvidenceClickHandler
): ReactNode[] {
  const nodes: ReactNode[] = [];
  // 证据编号 [E1] | 链接 | 粗体 | 删除线 | 斜体 | 行内代码
  const regex =
    /(\[E\d+\]|\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  const pushText = (s: string) => {
    if (s) nodes.push(<Fragment key={`${keyPrefix}-t-${i++}`}>{s}</Fragment>);
  };
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) pushText(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyPrefix}-i-${i++}`;
    const em = /^\[(E\d+)\]$/.exec(tok);
    if (em) {
      const id = em[1];
      nodes.push(
        <button
          key={k}
          type="button"
          data-evidence-id={id}
          onClick={() => onEvidenceClick?.(id)}
          title={`查看证据 ${id}`}
          className="mx-0.5 inline-flex h-[15px] min-w-[15px] translate-y-[-3px] cursor-pointer items-center justify-center rounded-full border border-primary/40 bg-primary/10 px-1 text-[9px] font-bold text-primary align-middle transition hover:border-primary hover:bg-primary/25"
        >
          {id.slice(1)}
        </button>
      );
    } else if (tok.startsWith("[")) {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      const href = lm ? safeHref(lm[2]) : null;
      if (lm && href) {
        nodes.push(
          <a
            key={k}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            {lm[1]}
          </a>
        );
      } else {
        pushText(tok);
      }
    } else if (tok.startsWith("**") || tok.startsWith("__")) {
      nodes.push(
        <strong key={k} className="font-semibold text-ink">
          {tok.slice(2, -2)}
        </strong>
      );
    } else if (tok.startsWith("~~")) {
      nodes.push(
        <del key={k} className="text-muted line-through">
          {tok.slice(2, -2)}
        </del>
      );
    } else if (tok.startsWith("`")) {
      nodes.push(
        <code
          key={k}
          className="tnum rounded bg-surface-2 px-1.5 py-0.5 text-[0.85em] text-primary"
        >
          {tok.slice(1, -1)}
        </code>
      );
    } else {
      // *italic* 或 _italic_
      nodes.push(
        <em key={k} className="italic text-ink-2">
          {tok.slice(1, -1)}
        </em>
      );
    }
    last = regex.lastIndex;
  }
  pushText(text.slice(last));
  return nodes;
}

/* ---------------- 块级解析 ---------------- */

type Align = "left" | "center" | "right";

const isTableSep = (s: string) =>
  /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(s);

const splitRow = (s: string): string[] => {
  let t = s.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  // 处理转义的竖线 \|
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "\\" && t[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (t[i] === "|") {
      cells.push(cur);
      cur = "";
    } else {
      cur += t[i];
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
};

const parseAligns = (sep: string): Align[] =>
  splitRow(sep).map((c) => {
    const l = c.startsWith(":");
    const r = c.endsWith(":");
    if (l && r) return "center";
    if (r) return "right";
    return "left";
  });

const alignCls: Record<Align, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function Markdown({
  content,
  onEvidenceClick,
}: {
  content: string;
  onEvidenceClick?: EvidenceClickHandler;
}) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const nk = () => `b-${key++}`;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const trimmed = line.trim();

    // 空行
    if (!trimmed) {
      i++;
      continue;
    }

    // 代码块 ```lang
    const fence = /^```(.*)$/.exec(trimmed);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i]);
        i++;
      }
      i++; // 跳过结束 ```
      blocks.push(
        <pre
          key={nk()}
          className="my-3 overflow-x-auto rounded-xl border border-line bg-surface-2/70 p-3 text-xs leading-relaxed"
        >
          <code className="tnum text-ink-2">{code.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // 表格：当前行像表格行，且下一行是分隔行
    if (/\|/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line);
      const aligns = parseAligns(lines[i + 1]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && /\|/.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      const colCls = (c: number) => alignCls[aligns[c] ?? "left"];
      blocks.push(
        <div key={nk()} className="my-3 overflow-x-auto rounded-xl border border-line">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surface-2/70">
                {header.map((h, c) => (
                  <th
                    key={c}
                    className={`border-b border-line px-3 py-2 font-semibold text-ink ${colCls(c)}`}
                  >
                    {renderInline(h, `th-${key}-${c}`, onEvidenceClick)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="even:bg-surface-2/30">
                  {header.map((_, c) => (
                    <td
                      key={c}
                      className={`border-b border-line/60 px-3 py-2 text-ink-2 ${colCls(c)}`}
                    >
                      {renderInline(r[c] ?? "", `td-${key}-${ri}-${c}`, onEvidenceClick)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // 分隔线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<hr key={nk()} className="my-4 border-line" />);
      i++;
      continue;
    }

    // 标题
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      const level = h[1].length;
      const cls =
        level <= 2
          ? "font-display mt-5 mb-2 text-lg font-bold text-ink flex items-center gap-2"
          : "mt-4 mb-1.5 text-base font-semibold text-ink";
      const k = nk();
      blocks.push(
        <div key={k} className={cls}>
          {level <= 2 && (
            <span className="h-3.5 w-1 shrink-0 rounded-full bg-gradient-to-b from-primary to-cyan" />
          )}
          <span>{renderInline(h[2], k, onEvidenceClick)}</span>
        </div>
      );
      i++;
      continue;
    }

    // 引用块（连续 > 行）
    if (trimmed.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      const k = nk();
      blocks.push(
        <blockquote
          key={k}
          className="my-3 rounded-r-lg border-l-2 border-primary/50 bg-primary/5 px-3 py-2 text-xs text-muted"
        >
          {renderInline(quote.join(" "), k, onEvidenceClick)}
        </blockquote>
      );
      continue;
    }

    // 列表（无序 / 有序，支持缩进嵌套）
    const isListLine = (s: string) =>
      /^(\s*)([-*+]|\d+[.)])\s+/.test(s.replace(/\t/g, "    "));
    if (isListLine(line)) {
      const items: { indent: number; ordered: boolean; text: string }[] = [];
      while (i < lines.length && isListLine(lines[i]) && lines[i].trim()) {
        const expanded = lines[i].replace(/\t/g, "    ");
        const lm = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(expanded)!;
        items.push({
          indent: lm[1].length,
          ordered: /\d/.test(lm[2]),
          text: lm[3],
        });
        i++;
      }
      blocks.push(<Fragment key={nk()}>{renderList(items, 0, `ls-${key}`, onEvidenceClick)}</Fragment>);
      continue;
    }

    // 段落（合并连续非空、非块级行）
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```/.test(lines[i].trim()) &&
      !/^(#{1,6})\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith(">") &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
      !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i].replace(/\t/g, "    ")) &&
      !(/\|/.test(lines[i]) && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      para.push(lines[i].trim());
      i++;
    }
    const k = nk();
    blocks.push(
      <p key={k} className="my-2 text-sm leading-relaxed text-ink-2">
        {renderInline(para.join(" "), k, onEvidenceClick)}
      </p>
    );
  }

  return <div className="fs-markdown">{blocks}</div>;
}

/* 递归渲染列表，按缩进分组形成嵌套结构 */
function renderList(
  items: { indent: number; ordered: boolean; text: string }[],
  start: number,
  keyPrefix: string,
  onEvidenceClick?: EvidenceClickHandler
): ReactNode {
  if (start >= items.length) return null;
  const baseIndent = items[start].indent;
  const ordered = items[start].ordered;
  const lis: ReactNode[] = [];
  let i = start;
  while (i < items.length && items[i].indent >= baseIndent) {
    if (items[i].indent > baseIndent) {
      // 交给上一项处理，理论不会进入；安全跳过
      i++;
      continue;
    }
    const current = items[i];
    // 收集其子项
    let j = i + 1;
    while (j < items.length && items[j].indent > baseIndent) j++;
    const children =
      j > i + 1 ? renderList(items, i + 1, `${keyPrefix}-${i}c`, onEvidenceClick) : null;
    lis.push(
      <li key={`${keyPrefix}-${i}`} className="pl-0.5">
        <span>{renderInline(current.text, `${keyPrefix}-${i}t`, onEvidenceClick)}</span>
        {children}
      </li>
    );
    i = j;
  }
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      key={`${keyPrefix}-${start}-tag`}
      className={`my-2 space-y-1.5 pl-5 text-sm leading-relaxed text-ink-2 ${
        ordered ? "list-decimal" : "list-disc"
      } ${baseIndent > 0 ? "mt-1.5" : ""}`}
    >
      {lis}
    </Tag>
  );
}
