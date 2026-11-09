// A pointing hand pressing a button: the index finger presses a dark dot while rings ripple out
// from it, over and over. Drawn pointing up; `direction="right"` turns it to point at a button on
// its right. Decorative only (aria-hidden). Still, with the rings shown, for reduced motion.

export function TapHand({ direction = "up", className = "" }: { direction?: "up" | "right"; className?: string }) {
  return (
    <span className={`taphand taphand--${direction} ${className}`} aria-hidden="true">
      <svg viewBox="2 -8 60 72" width="100%" height="100%" focusable="false">
        {/* the button being pressed, centred on the fingertip */}
        <g className="taphand__target" fill="none">
          <circle className="taphand__ring taphand__ring--2" cx="30" cy="10" r="19" />
          <circle className="taphand__ring taphand__ring--1" cx="30" cy="10" r="13.5" />
          <circle className="taphand__dot" cx="30" cy="10" r="8.5" />
        </g>
        {/* the hand, tilted a little like a real finger reaching in */}
        <g className="taphand__hand" strokeLinejoin="round" strokeLinecap="round">
          <g transform="rotate(-14 30 10)">
            <path
              className="taphand__shape"
              d="M26 33V10a4 4 0 0 1 8 0V28.5a3.7 3.7 0 0 1 7.4 0V31a3.5 3.5 0 0 1 7 0V34a3.3 3.3 0 0 1 6.6 0V44c0 8.3-5.6 14-13.4 14h-6.4c-4 0-6.9-1.6-9.3-4.8L13.6 43.7a3.7 3.7 0 0 1 5.6-4.8L26 45.5Z"
            />
            <path className="taphand__line" d="M34 28.5v7.5M41.4 31v6M48.4 34v5" fill="none" />
          </g>
        </g>
      </svg>
    </span>
  );
}
