/**
 * The measuring half of the responsive container (docs/06 §11.2).
 *
 * Everything below this component takes width and height as props, so component tests render the
 * chart directly at fixed dimensions and assert deterministic SVG. This wrapper exists only to
 * supply those numbers in a browser, and renders nothing until it has a width — a chart drawn at
 * zero width is worse than one drawn a frame later.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface ResponsiveChartProps {
  height: number;
  /** Below this, a caller may reflow to fewer categories or another orientation (docs/06 §8). */
  minWidth?: number;
  children: (size: { width: number; height: number }) => ReactNode;
}

export function ResponsiveChart({ height, minWidth = 240, children }: ResponsiveChartProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      setWidth(element.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className="chart-responsive" ref={ref}>
      {width > 0 ? children({ width: Math.max(width, minWidth), height }) : null}
    </div>
  );
}
