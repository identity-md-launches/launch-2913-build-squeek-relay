export type IconName =
  | "arrow"
  | "left"
  | "right"
  | "sound"
  | "muted"
  | "help"
  | "wallet"
  | "close"
  | "bolt"
  | "snow"
  | "trophy"
  | "pause"
  | "play"
  | "link"
  | "check"
  | "refresh";
const paths: Record<IconName, React.ReactNode> = {
  arrow: (
    <>
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </>
  ),
  left: <path d="m14 6-6 6 6 6" />,
  right: <path d="m10 6 6 6-6 6" />,
  sound: (
    <>
      <path d="m11 5-6 5H2v4h3l6 5V5Z" />
      <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
    </>
  ),
  muted: (
    <>
      <path d="m11 5-6 5H2v4h3l6 5V5Z" />
      <path d="m16 9 6 6m0-6-6 6" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 0 1 5 .4c0 1.6-2.5 1.7-2.5 3.6m0 3h.01" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 7V5H5a2 2 0 0 0 0 4h16v11H5a2 2 0 0 1-2-2V7" />
      <path d="M21 12h-5v5h5m-2.5-2.5h.01" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  bolt: <path d="m13 2-8 12h6l-1 8 9-13h-6l1-7Z" />,
  snow: (
    <>
      <path d="M12 2v20M3.4 7l17.2 10M3.4 17 20.6 7M9 4l3 3 3-3M9 20l3-3 3 3M4 11l4-1-1-4m10 12-1-4 4-1M4 13l4 1-1 4M17 6l-1 4 4 1" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 3h10v6a5 5 0 0 1-10 0V3Zm5 11v6m-4 1h8M7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4" />
    </>
  ),
  pause: (
    <>
      <path d="M8 5v14M16 5v14" strokeWidth="4" />
    </>
  ),
  play: <path d="m9 5 11 7-11 7V5Z" />,
  link: (
    <>
      <path d="M14 4h6v6m0-6L10 14" />
      <path d="M11 4H4v16h16v-7" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  refresh: (
    <>
      <path d="M20 8a8 8 0 1 0 .4 7M20 3v5h-5" />
    </>
  ),
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function HamsterMark() {
  return (
    <svg
      className="hamster-mark"
      width="38"
      height="38"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 19C-1 8 12 1 17 11h6C28 1 41 8 33 19c5 17-31 17-26 0Z"
        fill="currentColor"
      />
      <path
        d="M10 15c-3-6 2-7 5-2m10 0c3-5 8-4 5 2"
        stroke="#0b1316"
        strokeWidth="2"
      />
      <ellipse cx="20" cy="25" rx="12" ry="8" fill="#fff3d9" />
      <path
        d="M13 20h.1M27 20h.1"
        stroke="#0b1316"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="m18 24 2 2 2-2M20 26v3"
        stroke="#0b1316"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
