// STUB — foundation owner's version wins at integration.
//
// V5-BLUEPRINT.md §11/§2 specifies a shared `useRevealV5()` hook + `<Reveal>`
// wrapper in `components/v5/`, owned by the Brand & Design-System Lead
// (parallel worktree). This file exists only so `HomeV5` and other V5 public
// pages have something to import against while that worktree lands; it is
// intentionally minimal and does not implement the full motion spec
// (word-group clip-rise, stagger, `--sm-*` motion tokens) described in
// V5-BLUEPRINT §11. Replace this whole file with the foundation owner's
// implementation at integration — do not extend it.
//
// Behaviour kept deliberately safe in the meantime:
//   - progressive enhancement: content is visible before JS/observer runs;
//   - `prefers-reduced-motion: reduce` renders the final state immediately;
//   - IntersectionObserver-driven, fires once, matches the `useReveal` (v3)
//     pattern already used across the public site so it composes cleanly.

import {
  useEffect,
  useRef,
  type ElementType,
  type ReactNode,
} from "react";

export interface RevealProps {
  /** Element type to render. Defaults to "div". */
  as?: ElementType;
  /** Stagger delay in milliseconds, applied via `transition-delay`. */
  delay?: number;
  /**
   * When true, splits text children into per-word `<span>`s so a headline can
   * clip-rise word by word. The stub renders words with a shared delay step
   * rather than the full per-word stagger the real component will do.
   */
  words?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Reveal({
  as: Tag = "div",
  delay = 0,
  words = false,
  className,
  children,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      node.setAttribute("data-revealed", "");
      return;
    }
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) {
      node.setAttribute("data-revealed", "");
      return;
    }
    node.setAttribute("data-reveal-ready", "");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-revealed", "");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const style = delay ? { transitionDelay: `${delay}ms` } : undefined;

  if (words && typeof children === "string") {
    const parts = children.split(" ");
    return (
      <Tag
        ref={ref}
        className={["sm-reveal", "sm-reveal--words", className].filter(Boolean).join(" ")}
        style={style}
      >
        {parts.map((word, i) => (
          <span className="sm-reveal__word" key={`${word}-${i}`}>
            {word}
            {i < parts.length - 1 ? " " : ""}
          </span>
        ))}
      </Tag>
    );
  }

  return (
    <Tag
      ref={ref}
      className={["sm-reveal", className].filter(Boolean).join(" ")}
      style={style}
    >
      {children}
    </Tag>
  );
}

export default Reveal;
