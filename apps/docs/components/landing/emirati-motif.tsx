type MotifProps = {
  className?: string;
};

/** A quiet geometric rhythm inspired by Emirati Al Sadu weaving. */
export function EmiratiMotif({ className }: MotifProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 320 64"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M0 32h48m48 0h40m48 0h40m48 0h48M48 32 72 8l24 24-24 24-24-24Zm88 0 24-24 24 24-24 24-24-24Zm88 0 24-24 24 24-24 24-24-24Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="m60 32 12-12 12 12-12 12-12-12Zm88 0 12-12 12 12-12 12-12-12Zm88 0 12-12 12 12-12 12-12-12Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M0 5h320M0 59h320" stroke="currentColor" strokeOpacity=".3" strokeWidth="1" strokeDasharray="2 7" strokeLinecap="round" />
    </svg>
  );
}

export function HandDrawnSpark({ className }: MotifProps) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 80 80" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M39 6c1 18 7 27 28 32-19 2-28 10-31 31-3-18-11-27-29-30 19-4 28-13 32-33Z" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M65 8v12M59 14h12M12 60v9M8 65h9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
