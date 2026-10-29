import { useState } from "react";
import { useLang, LangSwitcher } from "./LangContext";
import { EVENTS } from "./data";
import React from "react";
import {
  IconArrowLeft, IconScan, IconCheckCircle, IconXCircle, IconAlertCircle,
  IconSearch, IconUndo, IconCheck,
} from "./Icons";

type MobileScreen =
  | "login" | "events" | "event-overview" | "scanner" | "verify-result"
  | "manual-search" | "attendee-detail" | "checkin-confirm" | "statistics" | "undo";

type VerifyStatus = "VALID" | "INVALID" | "CANCELLED" | "REFUNDED" | "ALREADY CHECKED IN" | "CAMPAIGN QR";

const STATUS_CONFIG: Record<VerifyStatus, { bg: string; text: string; icon: React.ReactNode }> = {
  "VALID": { bg: "#1bae6e", text: "#fff", icon: <IconCheckCircle size={32} /> },
  "INVALID": { bg: "#e03e3e", text: "#fff", icon: <IconXCircle size={32} /> },
  "CANCELLED": { bg: "#e0a12a", text: "#fff", icon: <IconAlertCircle size={32} /> },
  "REFUNDED": { bg: "#9580c8", text: "#fff", icon: <IconUndo size={32} /> },
  "ALREADY CHECKED IN": { bg: "#3b9de8", text: "#fff", icon: <IconCheckCircle size={32} /> },
  "CAMPAIGN QR": { bg: "#e8529a", text: "#fff", icon: <IconXCircle size={32} /> },
};

function PhoneFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="rounded-[3rem] overflow-hidden shadow-2xl border-4" style={{ borderColor: "#1e1b3a" }}>
          <div className="flex items-center justify-between px-6 py-2 text-xs font-bold text-white" style={{ background: "#1e1b3a" }}>
            <span>09:41</span>
            <span>BiletFlow Admin</span>
            <span>◼ ◼ ◼</span>
          </div>
          <div style={{ background: "#f7f6fb", minHeight: "680px" }}>
            {children}
          </div>
        </div>
        <p className="text-center text-xs mt-4" style={{ color: "#9580c8" }}>{label}</p>
      </div>
    </div>
  );
}

function MobileBtn({ children, variant = "primary", onClick, className = "" }: {
  children: React.ReactNode; variant?: "primary" | "secondary" | "success" | "danger" | "ghost";
  onClick?: () => void; className?: string;
}) {
  const styles: Record<string, object> = {
    primary: { background: "#6c4de6", color: "#fff" },
    secondary: { background: "#ede9fc", color: "#6c4de6" },
    success: { background: "#1bae6e", color: "#fff" },
    danger: { background: "#e03e3e", color: "#fff" },
    ghost: { background: "transparent", color: "#4b4672", border: "1.5px solid #d4ceed" },
  };
  return (
    <button onClick={onClick} className={`w-full py-3.5 rounded-2xl font-bold text-base transition-all active:scale-95 ${className}`} style={styles[variant]}>
      {children}
    </button>
  );
}

function LoginScreen({ setScreen }: { setScreen: (s: MobileScreen) => void }) {
  const { t } = useLang();
  return (
    <div className="flex flex-col min-h-full px-6 py-8">
      <div className="flex-1 flex flex-col justify-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-3xl mx-auto mb-6"
          style={{ background: "linear-gradient(135deg, #6c4de6, #e8529a)" }}>B</div>
        <h1 className="text-2xl font-black text-center mb-1" style={{ color: "#1e1b3a", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
          {t("mobile.login_label")}
        </h1>
        <p className="text-sm text-center mb-8" style={{ color: "#8c88b0" }}>{t("mobile.login_subtitle")}</p>

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: "#4b4672" }}>{t("auth.email")}</label>
            <input type="email" defaultValue="bekzat@example.kz" className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{ background: "#fff", border: "1.5px solid #d4ceed", color: "#1e1b3a", fontFamily: "inherit" }} />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: "#4b4672" }}>{t("auth.password")}</label>
            <input type="password" defaultValue="••••••••" className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{ background: "#fff", border: "1.5px solid #d4ceed", color: "#1e1b3a", fontFamily: "inherit" }} />
          </div>
        </div>
        <MobileBtn onClick={() => setScreen("events")}>{t("mobile.signin_btn")}</MobileBtn>

        <p className="text-xs text-center mt-4" style={{ color: "#8c88b0" }}>
          {t("mobile.only_assigned")}
        </p>
      </div>
    </div>
  );
}

function AssignedEventsScreen({ setScreen, setSelectedEvent }: {
  setScreen: (s: MobileScreen) => void;
  setSelectedEvent: (e: typeof EVENTS[0]) => void;
}) {
  const { t } = useLang();
  return (
    <div className="flex flex-col min-h-full">
      <div className="px-5 py-5 border-b" style={{ borderColor: "#e4e0f0", background: "#fff" }}>
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-black" style={{ color: "#1e1b3a", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{t("mobile.assigned_events")}</h1>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-white text-sm" style={{ background: "#6c4de6" }}>B</div>
        </div>
        <p className="text-xs" style={{ color: "#8c88b0" }}>Bekzat Akhmetov · {t("mobile.event_admin_role")}</p>
      </div>

      <div className="flex-1 px-4 py-4 space-y-3">
        {EVENTS.slice(0, 3).map(ev => {
          const pct = Math.round((ev.sold / ev.capacity) * 100);
          return (
            <button key={ev.id} onClick={() => { setSelectedEvent(ev); setScreen("event-overview"); }}
              className="w-full text-left rounded-2xl overflow-hidden transition-all"
              style={{ background: "#fff", border: "1px solid #e4e0f0", boxShadow: "0 2px 8px rgba(108,77,230,0.07)" }}>
              <img src={ev.image} alt={ev.title} className="w-full h-28 object-cover" style={{ backgroundColor: "#e4e0f0" }} />
              <div className="p-4">
                <p className="font-bold text-sm" style={{ color: "#1e1b3a" }}>{ev.title}</p>
                <p className="text-xs mt-0.5 mb-2" style={{ color: "#8c88b0" }}>{ev.date} · {ev.venue}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#f2f0f9" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#6c4de6" }} />
                  </div>
                  <span className="text-xs font-semibold" style={{ color: "#6c4de6" }}>{ev.sold}/{ev.capacity}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EventOverviewScreen({ event, setScreen }: {
  event: typeof EVENTS[0]; setScreen: (s: MobileScreen) => void;
}) {
  const { t } = useLang();
  const checkedIn = Math.round(event.sold * 0.89);
  const remaining = event.sold - checkedIn;
  const pct = Math.round((checkedIn / event.sold) * 100);

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-5 py-4 flex items-center gap-3 border-b" style={{ borderColor: "#e4e0f0", background: "#fff" }}>
        <button onClick={() => setScreen("events")} style={{ color: "#6c4de6" }}><IconArrowLeft size={20} /></button>
        <h1 className="font-black text-base flex-1 truncate" style={{ color: "#1e1b3a", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
          {t("mobile.event_overview_title")}
        </h1>
      </div>

      <div className="flex-1 px-4 py-5 space-y-4">
        <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #e4e0f0" }}>
          <img src={event.image} alt={event.title} className="w-full h-32 object-cover" style={{ backgroundColor: "#e4e0f0" }} />
          <div className="p-4">
            <p className="font-black text-base" style={{ color: "#1e1b3a" }}>{event.title}</p>
            <p className="text-xs mt-1" style={{ color: "#8c88b0" }}>{event.date} · {event.time}</p>
            <p className="text-xs" style={{ color: "#8c88b0" }}>{event.venue}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {([[t("mobile.registered"), event.sold, "#6c4de6"], [t("mobile.check_in"), checkedIn, "#1bae6e"], [t("mobile.remaining"), remaining, "#e0a12a"]] as [string, number, string][]).map(([l, v, c]) => (
            <div key={l} className="rounded-2xl p-3 text-center" style={{ background: "#fff", border: "1px solid #e4e0f0" }}>
              <p className="text-xl font-black" style={{ color: c }}>{v}</p>
              <p className="text-xs" style={{ color: "#8c88b0" }}>{l}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-4" style={{ background: "#fff", border: "1px solid #e4e0f0" }}>
          <div className="flex justify-between text-xs mb-2">
            <span style={{ color: "#4b4672" }}>{t("mobile.checkin_progress")}</span>
            <span className="font-bold" style={{ color: "#1bae6e" }}>{pct}%</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: "#f2f0f9" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#1bae6e" }} />
          </div>
        </div>

        <MobileBtn onClick={() => setScreen("scanner")}>{t("mobile.scan_btn")}</MobileBtn>
        <MobileBtn variant="secondary" onClick={() => setScreen("manual-search")}>{t("mobile.manual_btn")}</MobileBtn>
        <MobileBtn variant="ghost" onClick={() => setScreen("statistics")}>{t("mobile.stats_btn")}</MobileBtn>
      </div>
    </div>
  );
}

function ScannerScreen({ setScreen, setVerifyStatus }: {
  setScreen: (s: MobileScreen) => void;
  setVerifyStatus: (s: VerifyStatus) => void;
}) {
  const { t } = useLang();
  const statuses: VerifyStatus[] = ["VALID", "INVALID", "CANCELLED", "REFUNDED", "ALREADY CHECKED IN", "CAMPAIGN QR"];
  return (
    <div className="flex flex-col min-h-full">
      <div className="px-5 py-4 flex items-center gap-3 border-b" style={{ borderColor: "#e4e0f0", background: "#1e1b3a" }}>
        <button onClick={() => setScreen("event-overview")} className="text-white"><IconArrowLeft size={20} /></button>
        <h1 className="font-black text-base flex-1" style={{ color: "#fff", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{t("mobile.scanner_title")}</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-6" style={{ background: "#1e1b3a" }}>
        <div className="relative mb-6">
          <div className="w-56 h-56 rounded-3xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.05)", border: "2px solid rgba(255,255,255,0.15)" }}>
            <div className="absolute top-3 left-3 w-8 h-8 border-t-4 border-l-4 rounded-tl-xl" style={{ borderColor: "#6c4de6" }} />
            <div className="absolute top-3 right-3 w-8 h-8 border-t-4 border-r-4 rounded-tr-xl" style={{ borderColor: "#6c4de6" }} />
            <div className="absolute bottom-3 left-3 w-8 h-8 border-b-4 border-l-4 rounded-bl-xl" style={{ borderColor: "#6c4de6" }} />
            <div className="absolute bottom-3 right-3 w-8 h-8 border-b-4 border-r-4 rounded-br-xl" style={{ borderColor: "#6c4de6" }} />
            <div className="opacity-30 text-white"><IconScan size={56} /></div>
          </div>
          <div className="absolute left-0 right-0 top-1/2 h-0.5 rounded-full animate-pulse" style={{ background: "#6c4de6" }} />
        </div>

        <p className="text-white font-semibold text-base mb-1">{t("mobile.align_qr")}</p>
        <p className="text-xs text-center mb-8" style={{ color: "#9580c8" }}>{t("mobile.make_sure")}</p>

        <p className="text-xs text-center mb-4" style={{ color: "#9580c8" }}>{t("mobile.simulate")}</p>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {statuses.map(s => {
            const cfg = STATUS_CONFIG[s];
            return (
              <button key={s} onClick={() => { setVerifyStatus(s); setScreen("verify-result"); }}
                className="w-full py-2.5 rounded-xl font-bold text-sm transition-all"
                style={{ background: cfg.bg, color: cfg.text }}>
                {cfg.icon} {s}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function VerifyResultScreen({ status, setScreen }: {
  status: VerifyStatus; setScreen: (s: MobileScreen) => void;
}) {
  const { t } = useLang();
  const cfg = STATUS_CONFIG[status];
  const isValid = status === "VALID";
  const isCampaignQR = status === "CAMPAIGN QR";

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-5 py-4 flex items-center gap-3 border-b"
        style={{ borderColor: "rgba(255,255,255,0.1)", background: cfg.bg }}>
        <button onClick={() => setScreen("scanner")} className="font-bold" style={{ color: cfg.text }}><IconArrowLeft size={20} /></button>
        <h1 className="font-black text-base flex-1" style={{ color: cfg.text, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
          {t("mobile.verify_title")}
        </h1>
      </div>

      <div className="flex-1 px-5 py-6 space-y-4">
        <div className="rounded-3xl p-6 text-center" style={{ background: cfg.bg }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ background: "rgba(255,255,255,0.2)", color: cfg.text }}>
            {cfg.icon}
          </div>
          <p className="text-2xl font-black" style={{ color: cfg.text }}>{status}</p>
        </div>

        {isCampaignQR ? (
          <div className="rounded-2xl p-5 text-center space-y-3" style={{ background: "#fff", border: "2px dashed #e8529a" }}>
            <div className="flex justify-center"><IconXCircle size={56} /></div>
            <p className="font-black text-base" style={{ color: "#e8529a" }}>{t("mobile.campaign_qr_reject").split("\n")[0]}</p>
            <p className="font-semibold text-sm" style={{ color: "#c2185b" }}>{t("mobile.not_admission")}</p>
            <p className="text-xs leading-relaxed" style={{ color: "#8c88b0" }}>{t("mobile.campaign_qr_desc")}</p>
          </div>
        ) : (
          <div className="rounded-2xl p-5 space-y-3" style={{ background: "#fff", border: "1px solid #e4e0f0" }}>
            <p className="font-bold text-sm border-b pb-2" style={{ color: "#1e1b3a", borderColor: "#e4e0f0" }}>{t("mobile.ticket_details")}</p>
            {([
              [t("mobile.event_admin_role"), "Aizat Bekova"],
              [t("checkin.ticket_type"), "General Admission"],
              [t("support.event_label"), "Almaty Jazz Festival 2026"],
              [t("checkin.ticket_id"), "BF-A3X9KQ"],
              [t("table.status"), status],
            ] as [string, string][]).map(([l, v]) => (
              <div key={l} className="flex gap-2 text-sm">
                <span className="w-24 shrink-0 font-semibold" style={{ color: "#8c88b0" }}>{l}</span>
                <span style={{ color: "#1e1b3a" }}>{v}</span>
              </div>
            ))}
          </div>
        )}

        {isValid && (
          <MobileBtn variant="success" onClick={() => setScreen("checkin-confirm")}>{t("mobile.check_in_btn")}</MobileBtn>
        )}
        <MobileBtn variant="ghost" onClick={() => setScreen("scanner")}>{t("mobile.scan_another")}</MobileBtn>
      </div>
    </div>
  );
}

function CheckInConfirmScreen({ setScreen }: { setScreen: (s: MobileScreen) => void }) {
  const { t } = useLang();
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-5 py-8">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ background: "#d4f7e9", color: "#1bae6e" }}><IconCheckCircle size={56} /></div>
        <p className="text-2xl font-black mb-1" style={{ color: "#1bae6e", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{t("mobile.checked_in_title")}</p>
        <p className="font-semibold mb-0.5" style={{ color: "#1e1b3a" }}>Aizat Bekova</p>
        <p className="text-sm mb-1" style={{ color: "#8c88b0" }}>General Admission · BF-A3X9KQ</p>
        <p className="text-xs mb-8" style={{ color: "#8c88b0" }}>09:41:23 · Sep 20, 2026</p>
        <div className="w-full space-y-3">
          <MobileBtn variant="ghost" onClick={() => setScreen("undo")}>{t("mobile.undo_btn")}</MobileBtn>
          <MobileBtn onClick={() => setScreen("scanner")}>{t("mobile.scan_next")}</MobileBtn>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full px-5 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setScreen("verify-result")} style={{ color: "#6c4de6" }}><IconArrowLeft size={20} /></button>
        <h1 className="font-black text-base" style={{ color: "#1e1b3a", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{t("mobile.confirm_title")}</h1>
      </div>

      <div className="rounded-2xl p-5 mb-6 space-y-3" style={{ background: "#fff", border: "1px solid #e4e0f0" }}>
        <p className="font-bold" style={{ color: "#1e1b3a" }}>Aizat Bekova</p>
        <div className="space-y-2 text-sm">
          {([[t("checkin.ticket_type"), "General Admission"], [t("support.event_label"), "Almaty Jazz Festival 2026"], ["ID", "BF-A3X9KQ"], [t("table.status"), "Valid"]] as [string, string][]).map(([l, v]) => (
            <div key={l} className="flex gap-2">
              <span className="w-16 font-semibold" style={{ color: "#8c88b0" }}>{l}</span>
              <span style={{ color: "#1e1b3a" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => setScreen("scanner")} className="flex-1 py-3.5 rounded-2xl font-bold text-sm"
          style={{ background: "#f2f0f9", color: "#4b4672" }}>{t("mobile.cancel_btn")}</button>
        <button onClick={() => setDone(true)} className="flex-1 py-3.5 rounded-2xl font-bold text-sm text-white"
          style={{ background: "#1bae6e" }}>{t("mobile.confirm_btn")}</button>
      </div>
    </div>
  );
}

function ManualSearchScreen({ setScreen }: { setScreen: (s: MobileScreen) => void }) {
  const { t } = useLang();
  const [search, setSearch] = useState("");
  const attendees = [
    { name: "Aizat Bekova", id: "BF-A3X9KQ", type: "General Admission", status: "Valid" },
    { name: "Daniyar Seitkali", id: "BF-B7RMTP", type: "VIP", status: "Valid" },
    { name: "Mira Ahmetova", id: "BF-C2WJNZ", type: "General Admission", status: "Checked In" },
  ].filter(a => a.name.toLowerCase().includes(search.toLowerCase()) || a.id.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-5 py-4 flex items-center gap-3 border-b" style={{ borderColor: "#e4e0f0", background: "#fff" }}>
        <button onClick={() => setScreen("event-overview")} style={{ color: "#6c4de6" }}><IconArrowLeft size={20} /></button>
        <h1 className="font-black text-base flex-1" style={{ color: "#1e1b3a", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{t("mobile.search_title")}</h1>
      </div>

      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#8c88b0" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("mobile.search_placeholder")}
            className="w-full pl-9 pr-4 py-3 rounded-xl text-sm outline-none"
            style={{ background: "#fff", border: "1.5px solid #d4ceed", color: "#1e1b3a", fontFamily: "inherit" }} />
        </div>
      </div>

      <div className="flex-1 px-4 py-2 space-y-2">
        {attendees.map(a => {
          const isCheckedIn = a.status === "Checked In";
          return (
            <button key={a.id} onClick={() => setScreen("attendee-detail")}
              className="w-full text-left rounded-2xl p-4 transition-all"
              style={{ background: "#fff", border: "1px solid #e4e0f0" }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm" style={{ color: "#1e1b3a" }}>{a.name}</p>
                  <p className="text-xs font-mono mt-0.5" style={{ color: "#8c88b0" }}>{a.id}</p>
                  <p className="text-xs" style={{ color: "#4b4672" }}>{a.type}</p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{ background: isCheckedIn ? "#deeefb" : "#d4f7e9", color: isCheckedIn ? "#3b9de8" : "#1bae6e" }}>
                  {a.status}
                </span>
              </div>
            </button>
          );
        })}
        {attendees.length === 0 && search && (
          <div className="text-center py-10">
            <div className="flex justify-center mb-2"><IconSearch size={48} /></div>
            <p className="font-semibold" style={{ color: "#1e1b3a" }}>{t("mobile.no_results")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AttendeeDetailScreen({ setScreen }: { setScreen: (s: MobileScreen) => void }) {
  const { t } = useLang();
  return (
    <div className="flex flex-col min-h-full">
      <div className="px-5 py-4 flex items-center gap-3 border-b" style={{ borderColor: "#e4e0f0", background: "#fff" }}>
        <button onClick={() => setScreen("manual-search")} style={{ color: "#6c4de6" }}><IconArrowLeft size={20} /></button>
        <h1 className="font-black text-base" style={{ color: "#1e1b3a", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{t("mobile.attendee_title")}</h1>
      </div>

      <div className="flex-1 px-5 py-5 space-y-4">
        <div className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: "#fff", border: "1px solid #e4e0f0" }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl text-white"
            style={{ background: "linear-gradient(135deg, #6c4de6, #e8529a)" }}>A</div>
          <div>
            <p className="font-black" style={{ color: "#1e1b3a" }}>Aizat Bekova</p>
            <p className="text-xs" style={{ color: "#8c88b0" }}>General Admission · BF-A3X9KQ</p>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold mt-1 inline-block" style={{ background: "#d4f7e9", color: "#1bae6e" }}>Valid</span>
          </div>
        </div>

        <div className="rounded-2xl p-4 space-y-2" style={{ background: "#fff", border: "1px solid #e4e0f0" }}>
          {([
            [t("support.event_label"), "Almaty Jazz Festival 2026"],
            [t("org.date"), "Sep 20, 2026 · 19:00"],
            [t("event.venue"), "Central Park Amphitheater"],
            [t("checkin.ticket_id"), "BF-A3X9KQ"],
            [t("table.order_id"), "ORD-001"],
          ] as [string, string][]).map(([l, v]) => (
            <div key={l} className="flex gap-2 text-sm">
              <span className="w-20 shrink-0 font-semibold" style={{ color: "#8c88b0" }}>{l}</span>
              <span style={{ color: "#1e1b3a" }}>{v}</span>
            </div>
          ))}
        </div>

        <MobileBtn variant="success" onClick={() => setScreen("checkin-confirm")}>{t("mobile.check_in_this")}</MobileBtn>
        <MobileBtn variant="ghost" onClick={() => setScreen("manual-search")}>{t("mobile.back_search")}</MobileBtn>
      </div>
    </div>
  );
}

function StatisticsScreen({ setScreen }: { setScreen: (s: MobileScreen) => void }) {
  const { t } = useLang();
  const ev = EVENTS[0];
  const checkedIn = Math.round(ev.sold * 0.89);
  const remaining = ev.sold - checkedIn;
  const pct = Math.round((checkedIn / ev.sold) * 100);

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-5 py-4 flex items-center gap-3 border-b" style={{ borderColor: "#e4e0f0", background: "#fff" }}>
        <button onClick={() => setScreen("event-overview")} style={{ color: "#6c4de6" }}><IconArrowLeft size={20} /></button>
        <h1 className="font-black text-base" style={{ color: "#1e1b3a", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{t("mobile.stats_title")}</h1>
      </div>

      <div className="flex-1 px-5 py-5 space-y-4">
        <p className="font-bold text-sm" style={{ color: "#1e1b3a" }}>{ev.title}</p>
        <p className="text-xs" style={{ color: "#8c88b0" }}>{ev.date} · {t("mobile.live")}</p>

        <div className="grid grid-cols-2 gap-3">
          {([[t("mobile.registered"), ev.sold, "#6c4de6"], [t("mobile.check_in"), checkedIn, "#1bae6e"], [t("mobile.remaining"), remaining, "#e0a12a"], [t("mobile.rate"), `${pct}%`, "#3b9de8"]] as [string, string | number, string][]).map(([l, v, c]) => (
            <div key={l} className="rounded-2xl p-4 text-center" style={{ background: "#fff", border: "1px solid #e4e0f0" }}>
              <p className="text-2xl font-black" style={{ color: c }}>{v}</p>
              <p className="text-xs" style={{ color: "#8c88b0" }}>{l}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-4" style={{ background: "#fff", border: "1px solid #e4e0f0" }}>
          <div className="flex justify-between text-xs mb-2">
            <span style={{ color: "#4b4672" }}>{t("mobile.checkin_progress")}</span>
            <span className="font-bold" style={{ color: "#1bae6e" }}>{pct}%</span>
          </div>
          <div className="h-4 rounded-full overflow-hidden" style={{ background: "#f2f0f9" }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(to right, #6c4de6, #1bae6e)" }} />
          </div>
        </div>

        <div className="rounded-2xl p-4 space-y-3" style={{ background: "#fff", border: "1px solid #e4e0f0" }}>
          <p className="font-bold text-sm" style={{ color: "#1e1b3a" }}>{t("mobile.recent_checkins")}</p>
          {["Aizat Bekova · 09:41", "Daniyar Seitkali · 09:38", "Mira Ahmetova · 09:35"].map(entry => (
            <div key={entry} className="flex items-center gap-2 text-sm">
              <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "#d4f7e9", color: "#1bae6e" }}><IconCheck size={11} /></span>
              <span style={{ color: "#4b4672" }}>{entry}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UndoScreen({ setScreen }: { setScreen: (s: MobileScreen) => void }) {
  const { t } = useLang();
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-5">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: "#fef3d4", color: "#e0a12a" }}><IconUndo size={56} /></div>
        <p className="text-xl font-black mb-2" style={{ color: "#1e1b3a" }}>{t("mobile.checkin_reversed")}</p>
        <p className="text-sm text-center mb-6" style={{ color: "#8c88b0" }}>{t("mobile.checkin_reversed_sub")}</p>
        <MobileBtn onClick={() => setScreen("event-overview")}>{t("mobile.back_event")}</MobileBtn>
      </div>
    );
  }
  return (
    <div className="flex flex-col min-h-full px-5 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setScreen("checkin-confirm")} style={{ color: "#6c4de6" }}><IconArrowLeft size={20} /></button>
        <h1 className="font-black text-base" style={{ color: "#1e1b3a", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>{t("mobile.undo_title")}</h1>
      </div>
      <div className="rounded-2xl p-5 mb-6" style={{ background: "#fef3d4", border: "1px solid #f0d08a" }}>
        <p className="font-bold text-sm mb-1" style={{ color: "#c47c00" }}>{t("mobile.undo_confirm_title")}</p>
        <p className="text-sm" style={{ color: "#c47c00" }}>You are about to reverse the check-in for <strong>Aizat Bekova</strong>. This action will be logged.</p>
      </div>
      <div className="flex gap-3">
        <button onClick={() => setScreen("scanner")} className="flex-1 py-3.5 rounded-2xl font-bold text-sm"
          style={{ background: "#f2f0f9", color: "#4b4672" }}>{t("mobile.cancel_btn")}</button>
        <button onClick={() => setDone(true)} className="flex-1 py-3.5 rounded-2xl font-bold text-sm"
          style={{ background: "#e0a12a", color: "#fff" }}>{t("mobile.undo_action")}</button>
      </div>
    </div>
  );
}

export default function MobileApp({ role, setRole }: { role: string; setRole: (r: string) => void }) {
  const { t } = useLang();
  const [screen, setScreen] = useState<MobileScreen>("login");
  const [selectedEvent, setSelectedEvent] = useState<typeof EVENTS[0]>(EVENTS[0]);
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>("VALID");

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #f0ebff, #fdf0f8)" }}>
      <div className="flex justify-end items-center gap-3 px-4 pt-4">
        <LangSwitcher />
        <select value={role} onChange={e => setRole(e.target.value)}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg outline-none"
          style={{ background: "white", color: "#4b4672", border: "1px solid #d4ceed", fontFamily: "inherit" }}>
          <option value="attendee">{t("role.attendee")}</option>
          <option value="organizer">{t("role.organizer")}</option>
          <option value="admin">{t("role.admin")}</option>
          <option value="mobile">{t("role.mobile")}</option>
        </select>
      </div>

      <PhoneFrame label={t("mobile.prototype")}>
        {screen === "login" && <LoginScreen setScreen={setScreen} />}
        {screen === "events" && <AssignedEventsScreen setScreen={setScreen} setSelectedEvent={setSelectedEvent} />}
        {screen === "event-overview" && <EventOverviewScreen event={selectedEvent} setScreen={setScreen} />}
        {screen === "scanner" && <ScannerScreen setScreen={setScreen} setVerifyStatus={setVerifyStatus} />}
        {screen === "verify-result" && <VerifyResultScreen status={verifyStatus} setScreen={setScreen} />}
        {screen === "manual-search" && <ManualSearchScreen setScreen={setScreen} />}
        {screen === "attendee-detail" && <AttendeeDetailScreen setScreen={setScreen} />}
        {screen === "checkin-confirm" && <CheckInConfirmScreen setScreen={setScreen} />}
        {screen === "statistics" && <StatisticsScreen setScreen={setScreen} />}
        {screen === "undo" && <UndoScreen setScreen={setScreen} />}
      </PhoneFrame>
    </div>
  );
}
