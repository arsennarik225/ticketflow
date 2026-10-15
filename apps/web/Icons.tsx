type IconProps = { size?: number; className?: string; style?: React.CSSProperties };
const i = (d: string, opts?: { fill?: boolean }) =>
  ({ size = 20, className = "", style }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={opts?.fill ? "currentColor" : "none"}
      stroke={opts?.fill ? "none" : "currentColor"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden="true">
      <path d={d} />
    </svg>
  );

const ii = (paths: string[], opts?: { fill?: boolean }) =>
  ({ size = 20, className = "", style }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={opts?.fill ? "currentColor" : "none"}
      stroke={opts?.fill ? "none" : "currentColor"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden="true">
      {paths.map((d, k) => <path key={k} d={d} />)}
    </svg>
  );

export const IconHome = ii(["M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z", "M9 22V12h6v10"]);
export const IconGrid = ii(["M3 3h7v7H3z", "M14 3h7v7h-7z", "M14 14h7v7h-7z", "M3 14h7v7H3z"]);
export const IconCalendar = ii(["M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"]);
export const IconPlus = i("M12 5v14M5 12h14");
export const IconReceipt = ii(["M4 2h16v20l-4-2-4 2-4-2-4 2V2z", "M9 7h6M9 11h6M9 15h4"]);
export const IconUsers = ii(["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2", "M9 11a4 4 0 100-8 4 4 0 000 8z", "M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"]);
export const IconUser = ii(["M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2", "M12 11a4 4 0 100-8 4 4 0 000 8z"]);
export const IconBarChart = ii(["M18 20V10", "M12 20V4", "M6 20v-6"]);
export const IconTag = ii(["M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z", "M7 7h.01"]);
export const IconQr = ({ size = 20, className = "", style }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
    strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 20h3" />
  </svg>
);
export const IconClock = ii(["M12 22a10 10 0 100-20 10 10 0 000 20z", "M12 6v6l4 2"]);
export const IconCreditCard = ii(["M1 4h22v16H1z", "M1 10h22"]);
export const IconHeadset = ii(["M3 18v-6a9 9 0 0118 0v6", "M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5z", "M3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z"]);
export const IconSettings = ii(["M12 15a3 3 0 100-6 3 3 0 000 6z", "M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"]);
export const IconSearch = i("M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z");
export const IconBell = ii(["M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9", "M13.73 21a2 2 0 01-3.46 0"]);
export const IconArrowLeft = i("M19 12H5M12 5l-7 7 7 7");
export const IconPencil = i("M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z");
export const IconTrash = ii(["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6"]);
export const IconDownload = ii(["M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"]);
export const IconPrinter = ii(["M6 9V2h12v7", "M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2", "M6 14h12v8H6z"]);
export const IconShare = ii(["M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8", "M16 6l-4-4-4 4", "M12 2v13"]);
export const IconCheckCircle = ii(["M22 11.08V12a10 10 0 11-5.93-9.14", "M22 4L12 14.01l-3-3"]);
export const IconXCircle = ii(["M12 22a10 10 0 100-20 10 10 0 000 20z", "M15 9l-6 6M9 9l6 6"]);
export const IconAlertCircle = ii(["M12 22a10 10 0 100-20 10 10 0 000 20z", "M12 8v4M12 16h.01"]);
export const IconInfo = ii(["M12 22a10 10 0 100-20 10 10 0 000 20z", "M12 16v-4M12 8h.01"]);
export const IconMapPin = ii(["M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z", "M12 13a3 3 0 100-6 3 3 0 000 6z"]);
export const IconTicket = ii(["M2 9a3 3 0 010-6h20a3 3 0 010 6", "M2 15a3 3 0 000 6h20a3 3 0 000-6", "M2 9v6M22 9v6"]);
export const IconRotateCcw = ii(["M1 4v6h6", "M3.51 15a9 9 0 102.13-9.36L1 10"]);
export const IconEye = ii(["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", "M12 12a3 3 0 100-6 3 3 0 000 6z"]);
export const IconMenu = ii(["M3 12h18", "M3 6h18", "M3 18h18"]);
export const IconX = i("M18 6L6 18M6 6l12 12");
export const IconCheck = i("M20 6L9 17l-5-5");
export const IconLogOut = ii(["M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4", "M16 17l5-5-5-5", "M21 12H9"]);
export const IconScan = ii(["M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2", "M8 12h8"]);
export const IconUndo = ii(["M3 7v6h6", "M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"]);
export const IconChevronRight = i("M9 18l6-6-6-6");
export const IconChevronDown = i("M6 9l6 6 6-6");
export const IconFilter = ii(["M22 3H2l8 9.46V19l4 2v-8.54L22 3z"]);
export const IconStar = i("M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z");
export const IconExternalLink = ii(["M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6", "M15 3h6v6", "M10 14L21 3"]);
export const IconRefresh = ii(["M23 4v6h-6", "M1 20v-6h6", "M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"]);
export const IconMail = ii(["M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z", "M22 6l-10 7L2 6"]);
export const IconPhone = i("M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z");
export const IconLock = ii(["M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z", "M17 11V7a5 5 0 00-10 0v4"]);
export const IconKey = ii(["M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"]);
export const IconShield = i("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z");
export const IconTrendingUp = ii(["M23 6l-9.5 9.5-5-5L1 18", "M17 6h6v6"]);
export const IconActivity = i("M22 12h-4l-3 9L9 3l-3 9H2");
export const IconCopy = ii(["M20 9H11a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-9a2 2 0 00-2-2z", "M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"]);
export const IconDollarSign = ii(["M12 1v22", "M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"]);
export const IconPercent = ii(["M19 5L5 19", "M6.5 6.5a.5.5 0 11-1 0 .5.5 0 011 0", "M17.5 17.5a.5.5 0 11-1 0 .5.5 0 011 0"]);
export const IconMessageSquare = ii(["M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"]);
export const IconSend = i("M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z");
export const IconInbox = ii(["M22 12h-6l-2 3h-4l-2-3H2", "M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"]);
export const IconGlobe = ii(["M12 2a10 10 0 100 20A10 10 0 0012 2z", "M2 12h20", "M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"]);
export const IconPause = ii(["M6 4h4v16H6z", "M14 4h4v16h-4z"]);
export const IconPlay = i("M5 3l14 9-14 9V3z");
export const IconMinus = i("M5 12h14");
export const IconFileText = ii(["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z", "M14 2v6h6", "M16 13H8M16 17H8M10 9H8"]);
export const IconImage = ii(["M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z", "M8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z", "M21 15l-5-5L5 21"]);
export const IconPackage = ii(["M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z", "M3.27 6.96L12 12.01l8.73-5.05", "M12 22.08V12"]);
export const IconWifi = ii(["M5 12.55a11 11 0 0114.08 0", "M1.42 9a16 16 0 0121.16 0", "M8.53 16.11a6 6 0 016.95 0", "M12 20h.01"]);
export const IconPower = ii(["M18.36 6.64a9 9 0 11-12.73 0", "M12 2v10"]);
export const IconToggleLeft = ii(["M1 12a5 5 0 005 5h12a5 5 0 000-10H6a5 5 0 00-5 5z", "M8 12a2 2 0 100-4 2 2 0 000 4z"]);
export const IconToggleRight = ii(["M23 12a5 5 0 01-5 5H6a5 5 0 010-10h12a5 5 0 015 5z", "M16 12a2 2 0 104 0 2 2 0 00-4 0z"]);
