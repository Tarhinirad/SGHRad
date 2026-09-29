// Stroke icons from the SGUMC redesign. All inherit `currentColor`.
type P = { size?: number; className?: string; strokeWidth?: number };

const svg = (size: number, sw: number, className: string | undefined, children: React.ReactNode) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    {children}
  </svg>
);

export const LogoIcon = ({ size = 22, className, strokeWidth = 1.8 }: P) =>
  svg(size, strokeWidth, className, <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21" /></>);

export const LockIcon = ({ size = 16, className, strokeWidth = 2 }: P) =>
  svg(size, strokeWidth, className, <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>);

export const ChevronLeft = ({ size = 18, className, strokeWidth = 2 }: P) => svg(size, strokeWidth, className, <path d="M15 6l-6 6 6 6" />);
export const ChevronRight = ({ size = 18, className, strokeWidth = 2 }: P) => svg(size, strokeWidth, className, <path d="M9 6l6 6-6 6" />);

export const CalendarIcon = ({ size = 16, className, strokeWidth = 2 }: P) =>
  svg(size, strokeWidth, className, <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>);

export const MenuIcon = ({ size = 20, className, strokeWidth = 2 }: P) => svg(size, strokeWidth, className, <path d="M4 7h16M4 12h16M4 17h16" />);

export const BellIcon = ({ size = 26, className, strokeWidth = 1.9 }: P) =>
  svg(size, strokeWidth, className, <><path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6z" /><path d="M10 19a2 2 0 0 0 4 0" /></>);

export const PhoneIcon = ({ size = 18, className, strokeWidth = 2 }: P) =>
  svg(size, strokeWidth, className, <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />);

export const PrintIcon = ({ size = 16, className, strokeWidth = 2 }: P) =>
  svg(size, strokeWidth, className, <><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></>);

export const WhatsAppIcon = ({ size = 18, className, strokeWidth = 2 }: P) =>
  svg(size, strokeWidth, className, <><path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 8 19.5L3 21z" /><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 .7a4.5 4.5 0 0 1-2-2l.7-1-1-2L9 8.5z" /></>);
