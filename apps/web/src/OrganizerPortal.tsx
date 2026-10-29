import { useState } from "react";
import { useLang, LangSwitcher } from "./LangContext";
import { EVENTS, STATUS_STYLES, CATEGORY_COLORS } from "./data";
import {
  IconGrid, IconCalendar, IconPlus, IconReceipt, IconUsers, IconBarChart,
  IconTag, IconQr, IconClock, IconCreditCard, IconUser, IconHeadset,
  IconTicket, IconDollarSign, IconSearch, IconAlertCircle, IconInfo,
  IconCheckCircle, IconXCircle, IconImage, IconSend, IconCheck,
} from "./Icons";

type OrgPage = "dashboard" | "events" | "create-event" | "event-manage" | "orders" | "attendees" | "analytics" | "promo-codes" | "campaign-qr" | "event-history" | "paid-activation" | "profile" | "support";

type DraftEvent = Omit<typeof EVENTS[0], "status" | "id" | "sold"> & { id: string | number; status: string; sold: number; isDraft?: boolean; draftId?: string };

function Btn({ children, variant = "primary", onClick, className = "" }: {
  children: React.ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger";
  onClick?: () => void; className?: string;
}) {
  const styles: Record<string, object> = {
    primary: { background: "var(--primary)", color: "#fff" },
    secondary: { background: "var(--primary-light)", color: "var(--primary)" },
    ghost: { background: "transparent", color: "var(--text2)", border: "1.5px solid var(--border2)" },
    danger: { background: "var(--danger-bg)", color: "var(--danger)" },
  };
  return (
    <button onClick={onClick} className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all hover:opacity-85 ${className}`} style={styles[variant]}>
      {children}
    </button>
  );
}

function Badge({ text }: { text: string }) {
  const s = STATUS_STYLES[text] || { bg: "#f2f0f9", text: "#4b4672" };
  return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: s.bg, color: s.text }}>{text}</span>;
}

function Card({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`rounded-2xl ${className}`} style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", ...style }}>
      {children}
    </div>
  );
}

function useNavItems(): [OrgPage, React.ReactNode, string][] {
  const { t } = useLang();
  return [
    ["dashboard", <IconGrid size={18} />, t("org.dashboard")],
    ["events", <IconCalendar size={18} />, t("org.my_events")],
    ["create-event", <IconPlus size={18} />, t("org.create_event")],
    ["orders", <IconReceipt size={18} />, t("org.orders")],
    ["attendees", <IconUsers size={18} />, t("org.attendees")],
    ["analytics", <IconBarChart size={18} />, t("org.analytics")],
    ["promo-codes", <IconTag size={18} />, t("org.promo_codes")],
    ["campaign-qr", <IconQr size={18} />, t("org.campaign_qr")],
    ["event-history", <IconClock size={18} />, t("org.event_history")],
    ["paid-activation", <IconCreditCard size={18} />, t("org.paid_activation")],
    ["profile", <IconUser size={18} />, t("org.profile")],
    ["support", <IconHeadset size={18} />, t("org.support")],
  ];
}

function Sidebar({ page, setPage, role, setRole, collapsed, setCollapsed }: {
  page: OrgPage; setPage: (p: OrgPage) => void;
  role: string; setRole: (r: string) => void;
  collapsed: boolean; setCollapsed: (v: boolean) => void;
}) {
  const NAV_ITEMS = useNavItems();
  const { t } = useLang();
  return (
    <aside className={`${collapsed ? "w-16" : "w-56"} shrink-0 flex flex-col transition-all duration-200 border-r`}
      style={{ background: "var(--surface)", borderColor: "var(--border)", minHeight: "100vh" }}>
      <div className="flex items-center gap-2 px-3 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        {!collapsed && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0"
              style={{ background: "linear-gradient(135deg, var(--primary), var(--pink))" }}>B</div>
            <span className="font-black text-sm truncate" style={{ color: "var(--primary)", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              Bilet<span style={{ color: "var(--pink)" }}>Flow</span>
            </span>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 rounded-lg ml-auto" style={{ color: "var(--text3)" }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={collapsed ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text3)" }}>{t("org_portal.label")}</p>
          <p className="text-xs font-semibold truncate" style={{ color: "var(--text2)" }}>KZ Founders Hub</p>
        </div>
      )}

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map(([key, icon, label]) => (
          <button key={key} onClick={() => setPage(key)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all ${collapsed ? "justify-center" : ""}`}
            title={collapsed ? label : undefined}
            style={{ background: page === key ? "var(--primary-light)" : "transparent", color: page === key ? "var(--primary)" : "var(--text2)", fontWeight: page === key ? 700 : 500 }}>
            <span className="text-base">{icon}</span>
            {!collapsed && <span className="text-sm truncate">{label}</span>}
          </button>
        ))}
      </nav>

      <div className="px-2 pb-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
        <select value={role} onChange={e => setRole(e.target.value)}
          className={`w-full rounded-xl text-xs font-semibold outline-none px-2 py-1.5 mb-2 ${collapsed ? "opacity-0 pointer-events-none" : ""}`}
          style={{ background: "var(--surface2)", color: "var(--text2)", fontFamily: "inherit" }}>
          <option value="attendee">{t("role.attendee")}</option>
          <option value="organizer">{t("role.organizer")}</option>
          <option value="admin">{t("role.admin")}</option>
          <option value="mobile">{t("role.mobile")}</option>
        </select>
        <LangSwitcher className="px-3 py-2" />
      </div>
    </aside>
  );
}

function MobileNavBar({ page, setPage, role, setRole }: {
  page: OrgPage; setPage: (p: OrgPage) => void;
  role: string; setRole: (r: string) => void;
}) {
  const NAV_ITEMS = useNavItems();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3"
      style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
      <span className="font-black" style={{ color: "var(--primary)", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
        Bilet<span style={{ color: "var(--pink)" }}>Flow</span> {t("org_portal.label")}
      </span>
      <button onClick={() => setOpen(!open)} className="p-2 rounded-xl" style={{ background: "var(--surface2)" }}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "var(--text2)" }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
        </svg>
      </button>
      {open && (
        <div className="absolute top-14 left-2 right-2 rounded-2xl p-2 flex flex-col gap-1 z-50"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}>
          {NAV_ITEMS.map(([key, icon, label]) => (
            <button key={key} onClick={() => { setPage(key); setOpen(false); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-left"
              style={{ background: page === key ? "var(--primary-light)" : "transparent", color: page === key ? "var(--primary)" : "var(--text2)" }}>
              {icon} {label}
            </button>
          ))}
          <div className="pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <select value={role} onChange={e => { setRole(e.target.value); setOpen(false); }}
              className="w-full text-sm px-3 py-2 rounded-xl outline-none" style={{ background: "var(--surface2)", color: "var(--text2)", fontFamily: "inherit" }}>
              <option value="attendee">{t("role.attendee")}</option>
              <option value="organizer">{t("role.organizer")}</option>
              <option value="admin">{t("role.admin")}</option>
              <option value="mobile">{t("role.mobile")}</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

function Dashboard({ setPage, extraEvents }: { setPage: (p: OrgPage) => void; extraEvents: DraftEvent[] }) {
  const { t } = useLang();
  const allEvents = [...EVENTS, ...extraEvents];
  const stats = [
    { label: t("org.total_revenue"), val: "₸ 3,847,500", sub: t("org.net_demo"), color: "var(--primary)", icon: <IconDollarSign size={24} /> },
    { label: t("org.tickets_sold"), val: "2,218", sub: t("org.this_month"), color: "var(--mint)", icon: <IconTicket size={24} /> },
    { label: t("org.active_events"), val: String(allEvents.filter(e => e.status === "Active" || e.status === "Draft").length), sub: t("org.upcoming"), color: "var(--sky)", icon: <IconCalendar size={24} /> },
    { label: t("org.checkin_rate"), val: "89%", sub: t("org.last_event"), color: "var(--peach)", icon: <IconCheckCircle size={24} /> },
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--pink)" }}>{t("org.welcome_back")}</p>
          <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("org.dashboard")}</h1>
        </div>
        <Btn variant="primary" onClick={() => setPage("create-event")} className="self-start sm:self-auto">+ {t("org.create_event")}</Btn>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, val, sub, color, icon }) => (
          <Card key={label} className="p-4">
            <p className="text-2xl mb-2">{icon}</p>
            <p className="text-xs font-semibold mb-1" style={{ color: "var(--text3)" }}>{label}</p>
            <p className="text-xl font-black mb-0.5" style={{ color }}>{val}</p>
            <p className="text-xs" style={{ color: "var(--text3)" }}>{sub}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="font-bold mb-4" style={{ color: "var(--text)" }}>{t("org.quick_actions")}</h2>
        <div className="flex flex-wrap gap-3">
          {([
            [<IconPlus size={15} />, "org.create_event", "create-event"],
            [<IconBarChart size={15} />, "org.analytics", "analytics"],
            [<IconTag size={15} />, "org.promo_codes", "promo-codes"],
            [<IconUsers size={15} />, "org.attendees", "attendees"],
          ] as [React.ReactNode, string, OrgPage][]).map(([icon, key, page]) => (
            <Btn key={page} variant="secondary" onClick={() => setPage(page)}>
              <span className="inline-flex items-center gap-1.5">{icon}{t(key)}</span>
            </Btn>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex justify-between items-center px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-bold" style={{ color: "var(--text)" }}>{t("org.my_events")}</h2>
          <button onClick={() => setPage("events")} className="text-xs font-semibold" style={{ color: "var(--primary)" }}>{t("btn.see_all")}</button>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {allEvents.slice(0, 4).map(ev => {
            const pct = Math.round((ev.sold / ev.capacity) * 100);
            const ss = STATUS_STYLES[ev.status] || { bg: "#f2f0f9", text: "#4b4672" };
            return (
              <div key={ev.id} className="flex items-center gap-4 px-5 py-3">
                <img src={ev.image} alt={ev.title} className="w-10 h-10 rounded-xl object-cover shrink-0" style={{ backgroundColor: "#e4e0f0" }} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: "var(--text)" }}>{ev.title}</p>
                  <p className="text-xs" style={{ color: "var(--text3)" }}>{ev.date}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>{pct}%</p>
                  <p className="text-xs" style={{ color: "var(--text3)" }}>{t("org.sold_pct")}</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold shrink-0" style={{ background: ss.bg, color: ss.text }}>{ev.status}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-bold mb-4" style={{ color: "var(--text)" }}>{t("org.recent_activity")}</h2>
        <div className="space-y-3">
          {[
            { icon: <IconTicket size={16} />, msg: t("org.activity_sold"), time: "2 min ago", color: "var(--primary-light)" },
            { icon: <IconSearch size={16} />, msg: t("org.activity_reg"), time: "18 min ago", color: "var(--sky-light)" },
            { icon: <IconDollarSign size={16} />, msg: t("org.activity_payout"), time: "1h ago", color: "var(--mint-light)" },
            { icon: <IconTag size={16} />, msg: t("org.activity_promo"), time: "2h ago", color: "var(--pink-light)" },
          ].map(({ icon, msg, time, color }) => (
            <div key={msg} className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: color }}>{icon}</span>
              <div className="flex-1">
                <p className="text-sm" style={{ color: "var(--text2)" }}>{msg}</p>
                <p className="text-xs" style={{ color: "var(--text3)" }}>{time}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function EventsPage({ setPage, extraEvents, onDuplicate }: {
  setPage: (p: OrgPage) => void;
  extraEvents: DraftEvent[];
  onDuplicate: (ev: DraftEvent) => void;
}) {
  const { t } = useLang();
  const [tab, setTab] = useState("All");
  const [justDuped, setJustDuped] = useState<string | number | null>(null);
  const allEvents: DraftEvent[] = [...EVENTS, ...extraEvents];
  const tabKeys = ["All", "Active", "Upcoming", "Completed", "Draft"];
  const filtered = tab === "All" ? allEvents : allEvents.filter(e => e.status === tab);

  function handleDuplicate(ev: DraftEvent) {
    onDuplicate(ev);
    setJustDuped(ev.id);
    setTimeout(() => setJustDuped(null), 3000);
  }

  return (
    <div className="space-y-5">
      {justDuped && (
        <div className="p-4 rounded-xl font-semibold text-sm" style={{ background: "var(--success-bg)", color: "var(--success)" }}>
          <span className="inline-flex items-center gap-1.5"><IconCheck size={14} /> {t("org.duplicate_success")}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("org.my_events")}</h1>
        <Btn variant="primary" onClick={() => setPage("create-event")}>+ {t("org.create_event")}</Btn>
      </div>

      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        {tabKeys.map(tk => (
          <button key={tk} onClick={() => setTab(tk)}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
            style={{ background: tab === tk ? "var(--primary)" : "transparent", color: tab === tk ? "#fff" : "var(--text2)" }}>
            {tk}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filtered.map(ev => {
          const pct = Math.round((ev.sold / ev.capacity) * 100);
          const cat = CATEGORY_COLORS[ev.category] || { bg: "#f2f0f9", text: "#4b4672" };
          return (
            <Card key={ev.draftId || ev.id} className="p-5 flex flex-col sm:flex-row gap-4">
              <img src={ev.image} alt={ev.title} className="w-full sm:w-32 h-28 sm:h-20 rounded-xl object-cover shrink-0" style={{ backgroundColor: "#e4e0f0" }} />
              <div className="flex-1">
                <div className="flex flex-wrap gap-2 mb-1.5">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: cat.bg, color: cat.text }}>{ev.category}</span>
                  <Badge text={ev.status} />
                  {ev.isDraft && <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>{t("org.copy_label")}</span>}
                </div>
                <h3 className="font-bold mb-0.5" style={{ color: "var(--text)" }}>{ev.title}</h3>
                <p className="text-xs mb-2" style={{ color: "var(--text3)" }}>{ev.date} · {ev.venue}</p>
                {!ev.isDraft && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--primary)" }} />
                    </div>
                    <span className="text-xs font-semibold shrink-0" style={{ color: "var(--primary)" }}>{ev.sold}/{ev.capacity}</span>
                  </div>
                )}
              </div>
              <div className="flex sm:flex-col gap-2 sm:items-end justify-between sm:justify-start shrink-0">
                {!ev.isDraft && (
                  <p className="font-black text-base" style={{ color: ev.price === 0 ? "var(--mint)" : "var(--primary)" }}>
                    {ev.price === 0 ? t("ticket.free") : `${ev.price.toLocaleString()} ₸`}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setPage("event-manage")}
                    className="px-3 py-1 rounded-lg text-xs font-semibold"
                    style={{ background: "var(--primary-light)", color: "var(--primary)" }}>{t("btn.view")}</button>
                  <button onClick={() => setPage("event-manage")}
                    className="px-3 py-1 rounded-lg text-xs font-semibold"
                    style={{ background: "var(--primary-light)", color: "var(--primary)" }}>{t("btn.edit")}</button>
                  {!ev.isDraft && (
                    <button onClick={() => handleDuplicate(ev)}
                      className="px-3 py-1 rounded-lg text-xs font-semibold"
                      style={{ background: "var(--mint-light)", color: "var(--mint)" }}>{t("org.duplicate")}</button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function CreateEvent({ setPage }: { setPage: (p: OrgPage) => void }) {
  const { t } = useLang();
  const [step, setStep] = useState(1);
  const totalSteps = 8;
  const steps = [
    t("org.step_basic"), t("org.step_venue"), t("org.step_visibility"),
    t("org.step_reg"), t("org.step_tickets"), t("org.step_seating"),
    t("org.step_preview"), t("org.step_publish"),
  ];
  const [form, setForm] = useState({
    title: "", category: "Music", description: "",
    venue: "", address: "", date: "", time: "",
    visibility: "Public", capacity: "500",
    ticketName: "General Admission", ticketPrice: "0", ticketQty: "500",
    seating: "General Admission",
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => setPage("events")} className="text-sm font-semibold" style={{ color: "var(--text3)" }}>← {t("org.my_events")}</button>
        <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("org.create_event")}</h1>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-1 shrink-0">
              <button onClick={() => i + 1 < step && setStep(i + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={{
                  background: step === i + 1 ? "var(--primary)" : i + 1 < step ? "var(--success-bg)" : "var(--surface2)",
                  color: step === i + 1 ? "#fff" : i + 1 < step ? "var(--success)" : "var(--text3)",
                }}>
                {i + 1 < step ? <IconCheck size={12} /> : i + 1} {s}
              </button>
              {i < steps.length - 1 && <div className="w-4 h-0.5 rounded" style={{ background: step > i + 1 ? "var(--success)" : "var(--border2)" }} />}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg" style={{ color: "var(--text)" }}>{t("org.step_basic")}</h2>
            <div><label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text2)" }}>{t("org.event_title")}</label>
              <input className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={t("org.event_title_ph")}
                style={{ background: "var(--bg)", border: "1.5px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }} /></div>
            <div><label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text2)" }}>{t("org.category")}</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: "var(--bg)", border: "1.5px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }}>
                {["Music", "Conference", "Party", "Art", "Sports", "Food", "Other"].map(c => <option key={c}>{c}</option>)}
              </select></div>
            <div><label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text2)" }}>{t("org.description")}</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} placeholder={t("org.desc_ph")}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                style={{ background: "var(--bg)", border: "1.5px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }} /></div>
            <div className="p-4 rounded-xl text-sm flex items-center gap-2" style={{ background: "var(--surface2)", color: "var(--text3)", border: "2px dashed var(--border2)" }}>
              <IconImage size={16} /> {t("org.image_upload")}
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg" style={{ color: "var(--text)" }}>{t("org.step_venue")}</h2>
            {([[t("org.venue_name"), "venue", t("org.venue_ph")], [t("org.full_address"), "address", "Almaty, Alatau District"]] as [string, string, string][]).map(([l, k, p]) => (
              <div key={k}><label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text2)" }}>{l}</label>
                <input className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" value={(form as Record<string, string>)[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} placeholder={p}
                  style={{ background: "var(--bg)", border: "1.5px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }} /></div>
            ))}
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text2)" }}>{t("org.date")}</label>
                <input type="date" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: "var(--bg)", border: "1.5px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }} /></div>
              <div><label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text2)" }}>{t("org.time")}</label>
                <input type="time" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: "var(--bg)", border: "1.5px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }} /></div>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg" style={{ color: "var(--text)" }}>{t("org.step_visibility")}</h2>
            {(["Public", "Unlisted", "Private"] as const).map(v => (
              <button key={v} onClick={() => setForm({ ...form, visibility: v })}
                className="w-full p-4 rounded-xl text-left transition-all"
                style={{ border: "2px solid " + (form.visibility === v ? "var(--primary)" : "var(--border)"), background: form.visibility === v ? "var(--primary-light)" : "var(--bg)" }}>
                <p className="font-bold" style={{ color: form.visibility === v ? "var(--primary)" : "var(--text)" }}>
                  {t(`org.vis_${v.toLowerCase()}` as "org.vis_public")}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text3)" }}>
                  {t(`org.vis_${v.toLowerCase()}_desc` as "org.vis_public_desc")}
                </p>
              </button>
            ))}
          </div>
        )}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg" style={{ color: "var(--text)" }}>{t("org.step_reg")}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text2)" }}>{t("org.reg_opens")}</label>
                <input type="datetime-local" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: "var(--bg)", border: "1.5px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }} /></div>
              <div><label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text2)" }}>{t("org.reg_closes")}</label>
                <input type="datetime-local" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: "var(--bg)", border: "1.5px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }} /></div>
            </div>
            <div><label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text2)" }}>{t("org.total_capacity")}</label>
              <input type="number" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: "var(--bg)", border: "1.5px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }} /></div>
          </div>
        )}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg" style={{ color: "var(--text)" }}>{t("org.step_tickets")}</h2>
            <Card className="p-4" style={{ background: "var(--surface2)" }}>
              <p className="font-bold text-sm mb-3" style={{ color: "var(--text)" }}>Ticket #1</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([[t("org.ticket_name"), "ticketName", "General Admission"], [t("org.ticket_price"), "ticketPrice", "4500"], [t("org.ticket_qty"), "ticketQty", "500"], [t("org.max_per_order"), "", "10"]] as [string, string, string][]).map(([l, k, p]) => (
                  <div key={l}><label className="block text-xs font-semibold mb-1" style={{ color: "var(--text3)" }}>{l}</label>
                    <input className="w-full px-3 py-2 rounded-lg text-sm outline-none" value={k ? (form as Record<string, string>)[k] : ""} onChange={e => k && setForm({ ...form, [k]: e.target.value })} placeholder={p}
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", fontFamily: "inherit" }} /></div>
                ))}
              </div>
            </Card>
            <Btn variant="secondary">+ {t("org.add_ticket_type")}</Btn>
            <div className="p-3 rounded-xl text-sm flex items-center gap-2" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
              <IconAlertCircle size={16} /> {t("org.paid_ticket_warning")}
            </div>
          </div>
        )}
        {step === 6 && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg" style={{ color: "var(--text)" }}>{t("org.step_seating")}</h2>
            {(["General Admission", "Assigned Seating"] as const).map(v => (
              <button key={v} onClick={() => setForm({ ...form, seating: v })}
                className="w-full p-4 rounded-xl text-left transition-all"
                style={{ border: "2px solid " + (form.seating === v ? "var(--primary)" : "var(--border)"), background: form.seating === v ? "var(--primary-light)" : "var(--bg)" }}>
                <p className="font-bold" style={{ color: form.seating === v ? "var(--primary)" : "var(--text)" }}>
                  {v === "General Admission" ? t("org.seating_ga") : t("org.seating_assigned")}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text3)" }}>
                  {v === "General Admission" ? t("org.seating_ga_desc") : t("org.seating_assigned_desc")}
                </p>
              </button>
            ))}
          </div>
        )}
        {step === 7 && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg" style={{ color: "var(--text)" }}>{t("org.step_preview")}</h2>
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
              <div className="h-32 flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--primary-light), #fde8f3)", color: "var(--primary)" }}><IconCalendar size={48} /></div>
              <div className="p-4">
                <p className="font-black text-lg" style={{ color: "var(--text)" }}>{form.title || t("org.event_title")}</p>
                <p className="text-sm" style={{ color: "var(--text3)" }}>{form.venue || t("org.venue_name")} · {form.date || t("org.date")}</p>
              </div>
            </div>
            <p className="text-sm" style={{ color: "var(--text2)" }}>{t("org.preview_note")}</p>
          </div>
        )}
        {step === 8 && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg" style={{ color: "var(--text)" }}>{t("org.ready_to_publish")}</h2>
            <div className="p-4 rounded-xl" style={{ background: "var(--success-bg)" }}>
              <p className="font-bold text-sm mb-2 flex items-center gap-1.5" style={{ color: "var(--success)" }}><IconCheck size={14} /> {t("org.all_complete")}</p>
              <ul className="text-xs space-y-1" style={{ color: "var(--success)" }}>
                <li className="flex items-center gap-1"><IconCheck size={11} /> {t("org.step_basic")}</li>
                <li className="flex items-center gap-1"><IconCheck size={11} /> {t("org.step_venue")}</li>
                <li className="flex items-center gap-1"><IconCheck size={11} /> {t("org.visibility")}: {form.visibility}</li>
                <li className="flex items-center gap-1"><IconCheck size={11} /> {t("org.ticket_configured")}</li>
                <li className="flex items-center gap-1"><IconCheck size={11} /> {t("org.step_seating")}: {form.seating === "General Admission" ? t("org.seating_ga") : t("org.seating_assigned")}</li>
              </ul>
            </div>
            <div className="flex gap-3">
              <Btn variant="primary" className="flex-1 py-3" onClick={() => setPage("events")}>
                <span className="inline-flex items-center gap-1.5"><IconSend size={15} /> {t("org.publish_event")}</span>
              </Btn>
              <Btn variant="ghost" className="flex-1 py-3" onClick={() => setPage("events")}>{t("org.save_draft")}</Btn>
            </div>
          </div>
        )}
      </Card>

      <div className="flex gap-3">
        {step > 1 && <Btn variant="ghost" onClick={() => setStep(step - 1)}>← {t("btn.back")}</Btn>}
        {step < totalSteps && <Btn variant="primary" onClick={() => setStep(step + 1)}>{t("btn.continue")} →</Btn>}
      </div>
    </div>
  );
}

function EventManage() {
  const { t } = useLang();
  const [tab, setTab] = useState("overview");
  const tabs: [string, string][] = [
    ["overview", t("org.tab_overview")], ["tickets", t("org.tab_tickets")],
    ["orders", t("org.tab_orders")], ["attendees", t("org.tab_attendees")],
    ["admins", t("org.tab_admins")], ["promo", t("org.tab_promo")],
    ["campaign", t("org.tab_campaign")], ["analytics", t("org.tab_analytics")],
    ["history", t("org.tab_history")], ["settings", t("org.tab_settings")],
  ];
  const ev = EVENTS[0];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black" style={{ color: "var(--text)" }}>{ev.title}</h1>
        <p className="text-sm" style={{ color: "var(--text3)" }}>{ev.date} · {ev.venue}</p>
      </div>

      <div className="flex gap-1 flex-wrap">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ background: tab === k ? "var(--primary)" : "var(--surface)", color: tab === k ? "#fff" : "var(--text2)", border: "1px solid " + (tab === k ? "var(--primary)" : "var(--border)") }}>
            {l}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {([[t("org.capacity"), ev.capacity], [t("org.sold_label"), ev.sold], [t("org.remaining"), ev.capacity - ev.sold], [t("org.checkin_rate"), "91%"]] as [string, string | number][]).map(([l, v]) => (
            <Card key={l} className="p-4 text-center">
              <p className="text-xs font-semibold mb-1" style={{ color: "var(--text3)" }}>{l}</p>
              <p className="text-2xl font-black" style={{ color: "var(--primary)" }}>{v}</p>
            </Card>
          ))}
        </div>
      )}

      {tab === "tickets" && (
        <div className="space-y-3">
          <Btn variant="primary">+ {t("org.add_ticket_type")}</Btn>
          {ev.ticketTypes.map(tt => (
            <Card key={tt.id} className="p-4 flex flex-col sm:flex-row gap-4 sm:items-center">
              <div className="flex-1">
                <p className="font-bold" style={{ color: "var(--text)" }}>{tt.name}</p>
                <p className="text-xs" style={{ color: "var(--text3)" }}>{tt.description}</p>
                <div className="flex gap-4 text-xs mt-2" style={{ color: "var(--text3)" }}>
                  <span>{t("org.sold_label")}: <strong style={{ color: "var(--text2)" }}>{tt.sold}</strong></span>
                  <span>{t("org.available")}: <strong style={{ color: "var(--text2)" }}>{tt.quantity - tt.sold}</strong></span>
                  <span>{t("org.total")}: <strong style={{ color: "var(--text2)" }}>{tt.quantity}</strong></span>
                </div>
              </div>
              <p className="font-black text-lg shrink-0" style={{ color: tt.price === 0 ? "var(--mint)" : "var(--primary)" }}>
                {tt.price === 0 ? t("ticket.free") : `${tt.price.toLocaleString()} ₸`}
              </p>
              <div className="flex gap-2 shrink-0">
                <Btn variant="secondary">{t("btn.edit")}</Btn>
                <Btn variant="ghost">{t("btn.hide")}</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "attendees" && (
        <Card>
          <div className="flex justify-between items-center px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="font-bold" style={{ color: "var(--text)" }}>{t("org.attendees")} ({ev.sold})</h2>
            <Btn variant="ghost">{t("btn.export_csv")}</Btn>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {[t("table.name"), t("table.email"), t("table.ticket"), t("table.status"), t("table.registered")].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-bold" style={{ color: "var(--text3)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[["Aizat Bekova", "aizat@example.kz", "General Admission", "Valid", "Sep 3"],
                  ["Daniyar Seitkali", "daniyar@example.kz", "VIP", "Valid", "Sep 2"],
                  ["Mira Ahmetova", "mira@example.kz", "General Admission", "Checked In", "Sep 1"]].map(([name, email, ticket, status, date]) => (
                  <tr key={name} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-5 py-3 font-semibold" style={{ color: "var(--text)" }}>{name}</td>
                    <td className="px-5 py-3" style={{ color: "var(--text3)" }}>{email}</td>
                    <td className="px-5 py-3" style={{ color: "var(--text2)" }}>{ticket}</td>
                    <td className="px-5 py-3"><Badge text={status} /></td>
                    <td className="px-5 py-3" style={{ color: "var(--text3)" }}>{date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "admins" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl text-sm" style={{ background: "var(--info-bg)", color: "var(--info)" }}>
            <span className="inline-flex items-center gap-1.5"><IconInfo size={15} /> {t("org.event_admin_note")}</span>
          </div>
          <Btn variant="primary">+ {t("org.add_event_admin")}</Btn>
          {["Bekzat Akhmetov", "Saya Nurgali"].map(name => (
            <Card key={name} className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-sm" style={{ background: "var(--primary)" }}>{name[0]}</div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>{name}</p>
                  <p className="text-xs" style={{ color: "var(--text3)" }}>{t("org.event_admin_role")}</p>
                </div>
              </div>
              <Btn variant="danger">{t("btn.remove")}</Btn>
            </Card>
          ))}
        </div>
      )}

      {tab === "promo" && (
        <div className="space-y-4">
          <Btn variant="primary">+ {t("org.create_promo")}</Btn>
          {[{ code: "SUMMER20", discount: "20%", valid: "Sep 1–30", redemptions: "14/50", status: "Active" },
            { code: "VIP2026", discount: "₸ 2,000", valid: "Oct 1–5", redemptions: "3/20", status: "Active" }].map(p => (
            <Card key={p.code} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <p className="font-bold font-mono" style={{ color: "var(--text)" }}>{p.code}</p>
                <div className="flex flex-wrap gap-4 text-xs mt-1" style={{ color: "var(--text3)" }}>
                  <span>{t("org.discount")}: <strong>{p.discount}</strong></span>
                  <span>{t("org.valid")}: {p.valid}</span>
                  <span>{t("org.used")}: {p.redemptions}</span>
                </div>
              </div>
              <Badge text={p.status} />
              <div className="flex gap-2">
                <Btn variant="secondary">{t("btn.edit")}</Btn>
                <Btn variant="danger">{t("btn.disable")}</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "analytics" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {([[t("org.gross_sales"), "₸ 1,764,000"], [t("org.discounts"), "₸ 84,000"], [t("org.refunds_label"), "₸ 18,000"], [t("org.net_revenue"), "₸ 1,662,000"]] as [string, string][]).map(([l, v]) => (
              <Card key={l} className="p-4">
                <p className="text-xs font-semibold mb-1" style={{ color: "var(--text3)" }}>{l}</p>
                <p className="text-xl font-black" style={{ color: "var(--primary)" }}>{v}</p>
                <p className="text-xs" style={{ color: "var(--text3)" }}>{t("org.sandbox_figures")}</p>
              </Card>
            ))}
          </div>
          <Card className="p-5">
            <h3 className="font-bold mb-5" style={{ color: "var(--text)" }}>{t("org.sales_over_time")}</h3>
            <div className="flex items-end gap-2 h-32">
              {[22, 45, 58, 31, 74, 89, 42].map((v, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t-lg" style={{ height: `${v}%`, background: "linear-gradient(to top, var(--primary), #a78bfa)" }} />
                  <span className="text-xs" style={{ color: "var(--text3)" }}>{["Mo","Tu","We","Th","Fr","Sa","Su"][i]}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "history" && (
        <Card className="p-5">
          <h2 className="font-bold mb-4" style={{ color: "var(--text)" }}>{t("org.event_history")}</h2>
          <div className="space-y-4">
            {[
              { time: "Sep 3, 2026 14:22", action: t("org.hist_ticket_sold"), desc: "2× General Admission — Aizat Bekova" },
              { time: "Sep 2, 2026 10:15", action: t("org.hist_promo_created"), desc: "SUMMER20 — 20% discount, max 50 uses" },
              { time: "Sep 1, 2026 09:00", action: t("org.hist_published"), desc: "Almaty Jazz Festival 2026" },
            ].map(({ time, action, desc }) => (
              <div key={time} className="flex gap-3">
                <div className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: "var(--primary)" }} />
                <div>
                  <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>{action}</p>
                  <p className="text-xs" style={{ color: "var(--text2)" }}>{desc}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text3)" }}>{time}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function PaidSalesActivation() {
  const { t } = useLang();
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const done = step === 4;
  const steps = [
    { label: t("activation.step1"), done: true },
    { label: t("activation.step2"), done: step > 0 },
    { label: t("activation.step3"), done: step > 1 },
    { label: t("activation.step4"), done: step > 2 },
    { label: t("activation.step5"), done: step > 3 },
  ];
  const btnLabels = [t("activation.cta1"), t("activation.cta2"), t("activation.cta3"), t("activation.cta4")];

  return (
    <Card className="p-6 max-w-lg">
      <div className="flex items-center gap-3 mb-5">
        <span className="text-2xl">{done ? <IconCheckCircle size={28} style={{ color: "var(--success)" }} /> : <IconXCircle size={28} style={{ color: "var(--danger)" }} />}</span>
        <div>
          <h2 className="font-bold" style={{ color: "var(--text)" }}>{t("activation.title")} {done ? t("activation.active") : t("activation.not_active")}</h2>
          <p className="text-xs" style={{ color: "var(--text3)" }}>{t("activation.desc")}</p>
        </div>
      </div>
      <div className="p-3 rounded-xl text-xs font-semibold mb-5" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
        {t("activation.sandbox_note")}
      </div>
      <div className="space-y-3 mb-6">
        {steps.map(({ label, done: d }, i) => (
          <div key={label} className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: d ? "var(--success-bg)" : "var(--surface2)", color: d ? "var(--success)" : "var(--text3)" }}>
              {d ? <IconCheck size={12} /> : i + 1}
            </div>
            <span className="text-sm" style={{ color: d ? "var(--success)" : "var(--text2)" }}>{label}</span>
          </div>
        ))}
      </div>
      {!done && (
        <Btn variant="primary" className="w-full py-3" onClick={() => setStep((step + 1) as 0 | 1 | 2 | 3 | 4)}>
          {btnLabels[step] || ""}
        </Btn>
      )}
      {done && (
        <div className="p-4 rounded-xl text-center" style={{ background: "var(--success-bg)" }}>
          <p className="font-bold flex items-center justify-center gap-1.5" style={{ color: "var(--success)" }}><IconCheck size={14} /> {t("activation.done")}</p>
          <p className="text-xs mt-1" style={{ color: "var(--success)" }}>{t("activation.done_desc")}</p>
        </div>
      )}
    </Card>
  );
}

function Analytics() {
  const { t } = useLang();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("org.analytics")}</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          [t("org.total_capacity"), "3,475", "var(--text)"],
          [t("org.tickets_sold"), "2,218", "var(--primary)"],
          [t("org.tickets_remaining"), "1,257", "var(--sky)"],
          [t("org.pct_sold"), "63.8%", "var(--mint)"],
          [t("org.gross_sales"), "₸ 3,847,500", "var(--primary)"],
          [t("org.discounts"), "₸ 184,000", "var(--peach)"],
          [t("org.refunds_label"), "₸ 36,000", "var(--danger)"],
          [t("org.net_revenue"), "₸ 3,627,500", "var(--mint)"],
        ] as [string, string, string][]).map(([l, v, c]) => (
          <Card key={l} className="p-4">
            <p className="text-xs font-semibold mb-1" style={{ color: "var(--text3)" }}>{l}</p>
            <p className="text-xl font-black" style={{ color: c }}>{v}</p>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5">
          <h3 className="font-bold mb-5" style={{ color: "var(--text)" }}>{t("org.sales_by_type")}</h3>
          <div className="space-y-3">
            {([["General Admission", 68, "var(--primary)"], ["VIP", 20, "var(--pink)"], ["Early Bird", 12, "var(--mint)"]] as [string, number, string][]).map(([name, pct, color]) => (
              <div key={name}>
                <div className="flex justify-between text-sm mb-1">
                  <span style={{ color: "var(--text2)" }}>{name}</span>
                  <span className="font-semibold" style={{ color: "var(--text)" }}>{pct}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-bold mb-5" style={{ color: "var(--text)" }}>{t("org.checkin_stats")}</h3>
          <div className="space-y-3">
            {([["Checked In", 89, "var(--success)"], ["Not Yet", 11, "var(--text3)"]] as [string, number, string][]).map(([name, pct, color]) => (
              <div key={name}>
                <div className="flex justify-between text-sm mb-1">
                  <span style={{ color: "var(--text2)" }}>{name}</span>
                  <span className="font-semibold" style={{ color }}>{pct}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs mt-4 p-2 rounded-lg" style={{ background: "var(--info-bg)", color: "var(--info)" }}>
            {t("org.checkin_note")}
          </p>
        </Card>
      </div>
    </div>
  );
}

function CampaignQR() {
  const { t } = useLang();
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("org.campaign_qr")}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text3)" }}>{t("org.campaign_qr_desc")}</p>
        </div>
        <Btn variant="primary">+ {t("org.create_campaign")}</Btn>
      </div>
      <div className="p-4 rounded-xl text-sm" style={{ background: "#fde8f3", color: "#c2185b", border: "1px solid #f48fb1" }}>
        <span className="inline-flex items-center gap-1.5"><IconXCircle size={15} /> <strong>{t("org.campaign_warning_title")}</strong> {t("org.campaign_warning")}</span>
      </div>
      {[
        { name: "Summer Festival Push", code: "SUMMER20", discount: "20%", event: "Almaty Jazz Festival 2026", redemptions: 14, status: "Active" },
        { name: "VIP Early Access", code: "VIP2026", discount: "₸ 2,000", event: "Tech Startup Summit KZ", redemptions: 3, status: "Active" },
      ].map(c => (
        <Card key={c.name} className="p-5 flex flex-col sm:flex-row gap-5">
          <div className="flex-1">
            <p className="font-bold" style={{ color: "var(--text)" }}>{c.name}</p>
            <div className="flex flex-wrap gap-3 text-xs mt-2" style={{ color: "var(--text3)" }}>
              <span>{t("org.code")}: <strong className="font-mono" style={{ color: "var(--primary)" }}>{c.code}</strong></span>
              <span>{t("org.discount")}: {c.discount}</span>
              <span>{t("org.event_label")}: {c.event}</span>
              <span>{t("org.redemptions")}: <strong>{c.redemptions}</strong></span>
            </div>
            <div className="flex gap-2 mt-3">
              <Btn variant="secondary">{t("org.download_qr")}</Btn>
              <Btn variant="ghost">{t("btn.disable")}</Btn>
            </div>
          </div>
          <div className="shrink-0 p-3 rounded-2xl border-2 text-center"
            style={{ background: "var(--primary-light)", borderColor: "var(--primary)", borderStyle: "dashed" }}>
            <div className="grid grid-cols-5 gap-0.5 mb-1">
              {Array.from({ length: 25 }).map((_, i) => (
                <div key={i} className="w-4 h-4 rounded-sm" style={{ background: (i * 7 + i) % 3 !== 0 ? "var(--primary)" : "transparent" }} />
              ))}
            </div>
            <p className="text-xs font-bold" style={{ color: "var(--primary)" }}>{t("org.campaign_qr_label")}</p>
            <p className="text-xs" style={{ color: "var(--primary)" }}>{c.code}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function OrganizerPortal({ role, setRole }: { role: string; setRole: (r: string) => void }) {
  const { t } = useLang();
  const [page, setPage] = useState<OrgPage>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [extraEvents, setExtraEvents] = useState<DraftEvent[]>([]);

  function handleDuplicate(ev: DraftEvent) {
    const draft: DraftEvent = {
      ...ev,
      id: `${ev.id}-copy-${Date.now()}`,
      draftId: `draft-${Date.now()}`,
      title: `${ev.title} (${t("org.copy_label")})`,
      status: "Draft",
      sold: 0,
      isDraft: true,
    };
    setExtraEvents(prev => [...prev, draft]);
  }

  const content: Record<OrgPage, React.ReactNode> = {
    dashboard: <Dashboard setPage={setPage} extraEvents={extraEvents} />,
    events: <EventsPage setPage={setPage} extraEvents={extraEvents} onDuplicate={handleDuplicate} />,
    "create-event": <CreateEvent setPage={setPage} />,
    "event-manage": <EventManage />,
    orders: (
      <div className="space-y-4">
        <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("org.orders")}</h1>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
                {[t("table.order_id"), t("table.attendee"), t("table.ticket"), t("table.qty"), t("table.total"), t("table.payment"), t("table.date")].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-bold" style={{ color: "var(--text3)" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {[
                  ["ORD-001", "Aizat Bekova", "General Admission", "2", "₸ 9,000", "Paid", "Sep 3"],
                  ["ORD-002", "Daniyar Seitkali", "VIP", "1", "₸ 12,000", "Paid", "Sep 2"],
                  ["ORD-003", "Mira Ahmetova", "Free Entry", "1", "Free", "Free", "Aug 28"],
                ].map(row => (
                  <tr key={row[0]} style={{ borderBottom: "1px solid var(--border)" }}>
                    {row.map((v, i) => (
                      <td key={i} className="px-5 py-3" style={{ color: i === 0 ? "var(--primary)" : "var(--text2)", fontFamily: i === 0 ? "monospace" : "inherit" }}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    ),
    attendees: (
      <div>
        <h1 className="text-2xl font-black mb-5" style={{ color: "var(--text)" }}>{t("org.attendees")}</h1>
        <EventManage />
      </div>
    ),
    analytics: <Analytics />,
    "promo-codes": (
      <div className="space-y-5">
        <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("org.promo_codes")}</h1>
        <EventManage />
      </div>
    ),
    "campaign-qr": <CampaignQR />,
    "event-history": (
      <div className="space-y-4">
        <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("org.event_history")}</h1>
        <Card className="p-5">
          <div className="space-y-4">
            {[
              { time: "Sep 3, 2026 14:22", user: "System", action: t("org.hist_ticket_sold"), desc: "2× General Admission — Aizat Bekova — ORD-001", type: "sale" },
              { time: "Sep 2, 2026 10:15", user: "KZ Founders Hub", action: t("org.hist_promo_created"), desc: "SUMMER20 — 20% discount, 50 max uses", type: "promo" },
              { time: "Sep 1, 2026 09:00", user: "KZ Founders Hub", action: t("org.hist_published"), desc: "Almaty Jazz Festival 2026 set to Public", type: "publish" },
              { time: "Aug 31, 2026 11:30", user: "KZ Founders Hub", action: t("org.hist_activation"), desc: t("org.sandbox_figures"), type: "activation" },
              { time: "Aug 30, 2026 16:45", user: "KZ Founders Hub", action: t("org.hist_ticket_type"), desc: "General Admission · ₸ 4,500 · 400 qty", type: "ticket" },
            ].map(({ time, user, action, desc, type }) => {
              const colors: Record<string, string> = { sale: "var(--success-bg)", promo: "var(--pink-light)", publish: "var(--primary-light)", activation: "var(--mint-light)", ticket: "var(--sky-light)", create: "var(--surface2)" };
              return (
                <div key={time} className="flex gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: colors[type] }}>
                    {type === "sale" ? <IconCreditCard size={16} /> : type === "promo" ? <IconTag size={16} /> : type === "publish" ? <IconSend size={16} /> : type === "activation" ? <IconCheckCircle size={16} /> : <IconTicket size={16} />}
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: "var(--text)" }}>{action}</p>
                    <p className="text-xs" style={{ color: "var(--text2)" }}>{desc}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text3)" }}>{time} · {user}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    ),
    "paid-activation": (
      <div className="max-w-lg space-y-5">
        <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("org.paid_activation")}</h1>
        <PaidSalesActivation />
      </div>
    ),
    profile: (
      <div className="max-w-xl space-y-5">
        <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("org.profile")}</h1>
        <PaidSalesActivation />
        <Card className="p-6 space-y-4">
          <h2 className="font-bold" style={{ color: "var(--text)" }}>{t("org.org_details")}</h2>
          {([[t("org.org_name"), "KZ Founders Hub"], [t("org.contact_email"), "contact@kzfounders.kz"], [t("org.phone"), "+7 701 000 0000"], [t("org.city"), "Almaty"]] as [string, string][]).map(([l, v]) => (
            <div key={l}>
              <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text3)" }}>{l}</label>
              <input defaultValue={v} className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: "var(--bg)", border: "1.5px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }} />
            </div>
          ))}
          <Btn variant="primary">{t("btn.save")}</Btn>
        </Card>
      </div>
    ),
    support: (
      <div className="max-w-xl space-y-4">
        <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("org.support")}</h1>
        <Card className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text2)" }}>{t("support.category")}</label>
            <select className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: "var(--bg)", border: "1.5px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }}>
              <option>{t("support.cat_account")}</option>
              <option>{t("support.cat_activation")}</option>
              <option>{t("support.cat_payment")}</option>
              <option>{t("support.cat_technical")}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text2)" }}>{t("support.message")}</label>
            <textarea rows={5} placeholder={t("support.reply_placeholder")} className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
              style={{ background: "var(--bg)", border: "1.5px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }} />
          </div>
          <Btn variant="primary" className="w-full py-3">{t("support.submit_case")}</Btn>
        </Card>
      </div>
    ),
  };

  return (
    <div className="flex" style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div className="hidden md:block">
        <Sidebar page={page} setPage={setPage} role={role} setRole={setRole} collapsed={collapsed} setCollapsed={setCollapsed} />
      </div>
      <MobileNavBar page={page} setPage={setPage} role={role} setRole={setRole} />
      <main className="flex-1 p-5 md:p-8 pt-16 md:pt-8 overflow-auto">
        {content[page]}
      </main>
    </div>
  );
}
