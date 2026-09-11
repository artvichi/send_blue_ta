import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * The rendered width of an element, kept current on resize. For drawing in
 * real pixels: an SVG stretched with preserveAspectRatio="none" distorts every
 * shape in it, so a chart measures its box and lays itself out instead.
 */
export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
