import { useEffect, useRef, useCallback, type RefObject } from "react";

export function useDebouncedResize(
  containerRef: RefObject<HTMLDivElement | null>,
  onResize: () => void,
  delayMs = 150,
) {
  const onResizeRef = useRef(onResize);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  const handleResize = useCallback(() => {
    if (containerRef.current) {
      onResizeRef.current();
    }
  }, [containerRef]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(handleResize, delayMs);
    };
    window.addEventListener("resize", debounced);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", debounced);
    };
  }, [handleResize, delayMs]);
}
