import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface StreamingTextProps {
  text: string;
  className?: string;
  speed?: number; // ms per character
}

/**
 * Smooth per-character streaming text with a subtle blinking caret.
 */
export const StreamingText = ({
  text,
  className,
  speed = 50,
}: StreamingTextProps) => {
  const [index, setIndex] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTime = useRef<number | null>(null);

  useEffect(() => {
    setIndex(0);
    lastTime.current = null;

    const step = (time: number) => {
      if (lastTime.current == null) lastTime.current = time;
      const delta = time - lastTime.current;
      if (delta >= speed) {
        setIndex((i) => Math.min(i + Math.floor(delta / speed), text.length));
        lastTime.current = time;
      }
      if ((rafRef.current = requestAnimationFrame(step))) {
        // continue
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [text, speed]);

  const visible = text.slice(0, index);
  const hidden = text.slice(index);

  return (
    <span className={cn("streaming", className)}>
      <span className="streaming-visible">{visible}</span>
      <span className="streaming-hidden" aria-hidden>
        {hidden}
      </span>
    </span>
  );
};

export default StreamingText;
