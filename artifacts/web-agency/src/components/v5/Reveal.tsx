/**
 * SiteMint V5 — the global motion foundation (V5-BLUEPRINT §11).
 *
 * Rules this file exists to satisfy:
 *  1. animate opacity and transform only (the CSS in tokens-v5.css does the
 *     actual animating; this file only toggles classes and a stagger index).
 *  2. headline reveal = word-group clip-rise, 420 ms, stagger 60 ms
 *     (`words` prop → `.sm-reveal-words` + one `.sm-reveal__word` per word).
 *  3. supporting copy = one group, 240 ms, 16 px rise (the default, no
 *     `words` prop).
 *  5. IntersectionObserver threshold 0.35, once (both are overridable).
 *  8. `prefers-reduced-motion: reduce` renders the final state immediately —
 *     the observer is never even created; `useRevealV5` short-circuits to
 *     "in view" before the browser hands back a single animation frame.
 *
 * Progressive by construction: the very first render (including any
 * server/static render, and every render before this component's effects
 * run) carries NO `.sm-reveal` class, so content sits at its final,
 * fully-visible position with no JavaScript. The `.sm-reveal` class — the
 * one that actually applies `opacity: 0` — is added only inside a `useEffect`
 * after mount, and `.sm-reveal--in` follows once the section is in view (or
 * immediately, under reduced motion). Nothing is ever hidden from a reader
 * whose JavaScript never runs.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
  type RefObject,
} from "react";

export interface UseRevealV5Options {
  /** IntersectionObserver threshold. Rule 5 default: 0.35. */
  threshold?: number;
  /** Stop observing after the first reveal. Rule 5 default: true. */
  once?: boolean;
}

export interface UseRevealV5Result {
  /** True once the component has mounted — gates adding `.sm-reveal`. */
  mounted: boolean;
  /** True once the observed element has crossed the threshold. */
  inView: boolean;
  /** True when the viewer has `prefers-reduced-motion: reduce`. */
  reducedMotion: boolean;
}

/**
 * Drives the reveal lifecycle for one element. Mount the returned `mounted`
 * flag as the gate for the `.sm-reveal` class and `inView` as the gate for
 * `.sm-reveal--in` — see `<Reveal>` below for the concrete wiring.
 */
export function useRevealV5(
  ref: RefObject<Element | null>,
  { threshold = 0.35, once = true }: UseRevealV5Options = {},
): UseRevealV5Result {
  const [mounted, setMounted] = useState(false);
  const [inView, setInView] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Progressive enhancement (rule 8's other half): the element renders at
  // rest with no reveal class at all until this effect fires post-mount.
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    // Rule 8: reduced motion never creates an observer — the final state is
    // rendered immediately, with no animation frame spent deciding it.
    if (reducedMotion) {
      setInView(true);
      return;
    }
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.unobserve(entry.target);
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, threshold, once]);

  return { mounted, inView: reducedMotion ? true : inView, reducedMotion };
}

export interface RevealProps {
  /** Element/component to render as. Defaults to `div`. */
  as?: ElementType;
  /** Whole-group delay in ms, mapped to `--sm-reveal-delay` (§11 rule 2/3). */
  delay?: number;
  /**
   * Headline mode (rule 2): splits string children into one
   * `.sm-reveal__word` per word, each carrying its own
   * `--sm-stagger-index` so `tokens-v5.css`'s 60 ms stagger applies per
   * word. Only meaningful when `children` is a plain string.
   */
  words?: boolean;
  className?: string;
  children: ReactNode;
  /** Forwarded to `useRevealV5`. */
  threshold?: number;
  once?: boolean;
}

/**
 * The one motion primitive every V5 section should reach for (§11: "a single
 * `useRevealV5()` hook + `<Reveal>` wrapper"). Wrap supporting copy as-is for
 * the 240 ms/16 px rise; pass `words` with a plain-string headline for the
 * 420 ms clip-rise stagger.
 */
export function Reveal({
  as: Tag = "div",
  delay = 0,
  words = false,
  className,
  children,
  threshold,
  once,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const { mounted, inView } = useRevealV5(ref, { threshold, once });

  const classes = [mounted && "sm-reveal", words && "sm-reveal-words", inView && "sm-reveal--in", className]
    .filter(Boolean)
    .join(" ");

  const style: CSSProperties | undefined = delay
    ? ({ "--sm-reveal-delay": `${delay}ms` } as CSSProperties)
    : undefined;

  if (words && typeof children === "string") {
    // Keep whitespace as its own token so word spacing survives the split.
    const tokens = children.split(/(\s+)/);
    let wordIndex = 0;
    return (
      <Tag ref={ref} className={classes} style={style}>
        {tokens.map((token, i) => {
          if (token === "" || /^\s+$/.test(token)) return token;
          const wordStyle = {
            "--sm-stagger-index": wordIndex++,
          } as CSSProperties;
          return (
            <span key={i} className="sm-reveal__word" style={wordStyle}>
              <span>{token}</span>
            </span>
          );
        })}
      </Tag>
    );
  }

  return (
    <Tag ref={ref} className={classes} style={style}>
      {children}
    </Tag>
  );
}

export default Reveal;
