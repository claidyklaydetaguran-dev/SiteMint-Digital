import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

interface RotatingWordProps {
  words: string[];
  intervalMs?: number;
  className?: string;
}

export function RotatingWord({ words, intervalMs = 2200, className }: RotatingWordProps) {
  const [index, setIndex] = useState(0);
  const prefersReducedMotion = useReducedMotion();
  const widestWord = useRef(
    words.reduce((longest, word) => (word.length > longest.length ? word : longest), words[0] ?? "")
  );

  useEffect(() => {
    if (prefersReducedMotion) return;
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % words.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [words, intervalMs, prefersReducedMotion]);

  if (prefersReducedMotion) {
    return (
      <span className={className} data-testid="text-rotating-word">
        {words[0]}
      </span>
    );
  }

  return (
    <span
      className={`relative inline-grid align-bottom ${className ?? ""}`}
      data-testid="text-rotating-word"
    >
      <span className="invisible whitespace-nowrap" aria-hidden="true" style={{ gridArea: "1 / 1" }}>
        {widestWord.current}
      </span>
      <span className="sr-only">{words[index]}</span>
      <AnimatePresence mode="wait">
        <motion.span
          key={words[index]}
          style={{ gridArea: "1 / 1" }}
          className="whitespace-nowrap"
          aria-hidden="true"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
