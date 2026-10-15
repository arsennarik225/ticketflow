import { useState } from "react";
import { useLang, LangSwitcher } from "./LangContext";
import { EVENTS, STATUS_STYLES } from "./data";
import {
  IconGrid, IconUsers, IconCalendar, IconCreditCard, IconRotateCcw,
  IconAlertCircle, IconShield, IconHeadset, IconTag, IconBarChart,
  IconSettings, IconCheckCircle, IconXCircle, IconClock, IconPlay,
  IconPackage, IconTicket, IconInfo,
} from "./Icons";

type AdminPage = "dashboard" | "users" | "events" | "payments" | "refunds" | "disputes" | "paid-activation" | "support" | "promo-activity" | "reports" | "settings";

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

function useAdminNavItems(): [AdminPage, React.ReactNode, string][] {
  const { t } = useLang();
  return [
    ["dashboard", <IconGrid size={18} />, t("admin.dashboard")],
    ["users", <IconUsers size={18} />, t("admin.users")],
    ["events", <IconCalendar size={18} />, t("admin.events")],
    ["payments", <IconCreditCard size={18} />, t("admin.payments")],
    ["refunds", <IconRotateCcw size={18} />, t("admin.refunds")],
    ["disputes", <IconAlertCircle size={18} />, t("admin.disputes")],
    ["paid-activation", <IconShield size={18} />, t("admin.paid_activation")],
    ["support", <IconHeadset size={18} />, t("admin.support")],
    ["promo-activity", <IconTag size={18} />, t("admin.promo_activity")],
    ["reports", <IconBarChart size={18} />, t("admin.reports")],
    ["settings", <IconSettings size={18} />, t("admin.settings")],
  ];
}

function AdminSidebar({ page, setPage, role, setRole }: {
  page: AdminPage; setPage: (p: AdminPage) => void; role: string; setRole: (r: string) => void;
}) {
  const { t } = useLang();
  const NAV_ITEMS = useAdminNavItems();
  return (
    <aside className="w-56 shrink-0 flex flex-col border-r" style={{ background: "var(--surface)", minHeight: "100vh", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 px-4 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-xs"
          style={{ background: "linear-gradient(135deg, var(--primary), var(--pink))" }}>B</div>
        <div className="min-w-0">
          <p className="font-black text-sm" style={{ color: "var(--primary)", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>BiletFlow</p>
          <p className="text-xs" style={{ color: "var(--text3)" }}>Platform Admin</p>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map(([key, icon, label]) => (
          <button key={key} onClick={() => setPage(key)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all text-sm"
            style={{
              background: page === key ? "var(--primary-light)" : "transparent",
              color: page === key ? "var(--primary)" : "var(--text2)",
              fontWeight: page === key ? 700 : 500,
            }}>
            <span>{icon}</span><span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="px-2 pb-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
        <select value={role} onChange={e => setRole(e.target.value)}
          className="w-full rounded-xl text-xs font-semibold outline-none px-2 py-1.5 mb-2"
          style={{ background: "var(--surface2)", color: "var(--text2)", fontFamily: "inherit" }}>
          <option value="attendee">{t("role.attendee")}</option>
          <option value="organizer">{t("role.organizer")}</option>
          <option value="admin">{t("role.admin")}</option>
          <option value="mobile">{t("role.mobile")}</option>
        </select>
        <LangSwitcher className="px-1 py-1" />
      </div>
    </aside>
  );
}

function MobileAdminNav({ page, setPage, role, setRole }: {
  page: AdminPage; setPage: (p: AdminPage) => void; role: string; setRole: (r: string) => void;
}) {
  const { t } = useLang();
  const NAV_ITEMS = useAdminNavItems();
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3"
      style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
      <span className="font-black" style={{ color: "var(--primary)", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
        Bilet<span style={{ color: "var(--pink)" }}>Flow</span> Admin
      </span>
      <button onClick={() => setOpen(!open)} className="p-2 rounded-xl" style={{ background: "var(--surface2)" }}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "var(--text2)" }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-14 left-2 right-2 rounded-2xl p-2 flex flex-col gap-0.5 z-50"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}>
          {NAV_ITEMS.map(([key, icon, label]) => (
            <button key={key} onClick={() => { setPage(key); setOpen(false); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-left"
              style={{ color: page === key ? "var(--primary)" : "var(--text2)", background: page === key ? "var(--primary-light)" : "transparent" }}>
              {icon} {label}
            </button>
          ))}
          <div className="pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <select value={role} onChange={e => { setRole(e.target.value); setOpen(false); }}
              className="w-full text-xs px-3 py-1.5 rounded-lg outline-none" style={{ background: "var(--surface2)", color: "var(--text2)", fontFamily: "inherit" }}>
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

function AdminDashboard() {
  const { t } = useLang();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("admin.platform_dash")}</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { l: t("admin.total_users"), v: "18,432", icon: <IconUsers size={24} />, color: "var(--primary)" },
          { l: t("admin.total_events"), v: "1,284", icon: <IconCalendar size={24} />, color: "var(--sky)" },
          { l: t("admin.active_events"), v: "312", icon: <IconCheckCircle size={24} />, color: "var(--mint)" },
          { l: t("admin.pending_mod"), v: "7", icon: <IconClock size={24} />, color: "var(--warning)" },
          { l: t("admin.activation_req"), v: "3", icon: <IconCreditCard size={24} />, color: "var(--peach)" },
          { l: t("admin.payment_failures"), v: "12", icon: <IconXCircle size={24} />, color: "var(--danger)" },
          { l: t("admin.refund_requests"), v: "8", icon: <IconRotateCcw size={24} />, color: "var(--pink)" },
          { l: t("admin.open_support"), v: "24", icon: <IconHeadset size={24} />, color: "var(--sky)" },
        ].map(({ l, v, icon, color }) => (
          <Card key={l} className="p-4">
            <span className="text-xl">{icon}</span>
            <p className="text-xs font-semibold mt-2 mb-1" style={{ color: "var(--text3)" }}>{l}</p>
            <p className="text-xl font-black" style={{ color }}>{v}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="font-bold mb-4" style={{ color: "var(--text)" }}>{t("admin.activity_24h")}</h2>
        <div className="space-y-3">
          {[
            { icon: <IconPlay size={18} />, msg: "Event 'Nomad Night Vol.4' submitted for review", time: "12 min ago" },
            { icon: <IconAlertCircle size={18} />, msg: "Organizer 'PartyKZ' flagged for suspicious promo redemptions", time: "34 min ago" },
            { icon: <IconCreditCard size={18} />, msg: "Paid sales activation request — Astana Music Studio", time: "1h ago" },
            { icon: <IconXCircle size={18} />, msg: "Payment failure reported — ORD-8821 — ₸ 15,000", time: "2h ago" },
            { icon: <IconShield size={18} />, msg: "Event 'Shady Party' reported by 3 users — under review", time: "3h ago" },
          ].map(({ icon, msg, time }) => (
            <div key={msg} className="flex items-start gap-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
              <span className="text-lg">{icon}</span>
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

function UserManagement() {
  const { t } = useLang();
  const [search, setSearch] = useState("");
  const users = [
    { name: "Aizat Bekova", email: "aizat@example.kz", role: "Attendee", status: "Active", registered: "Jan 2026" },
    { name: "KZ Founders Hub", email: "contact@kzfounders.kz", role: "Organizer", status: "Active", registered: "Mar 2025" },
    { name: "Bekzat Akhmetov", email: "bekzat@example.kz", role: "Event Admin", status: "Active", registered: "Jun 2026" },
    { name: "Admin User", email: "admin@biletflow.kz", role: "Platform Admin", status: "Active", registered: "Jan 2025" },
    { name: "Shady Promoter", email: "promo@example.kz", role: "Organizer", status: "Suspended", registered: "Aug 2026" },
  ];
  const filtered = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));
  const roleColors: Record<string, { bg: string; text: string }> = {
    Attendee: { bg: "var(--primary-light)", text: "var(--primary)" },
    Organizer: { bg: "var(--sky-light)", text: "var(--sky)" },
    "Event Admin": { bg: "var(--mint-light)", text: "var(--mint)" },
    "Platform Admin": { bg: "#fde8f3", text: "var(--pink)" },
  };
  const statusColors: Record<string, { bg: string; text: string }> = {
    Active: { bg: "var(--success-bg)", text: "var(--success)" },
    Suspended: { bg: "var(--danger-bg)", text: "var(--danger)" },
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("admin.user_mgmt")}</h1>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text3)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("admin.search_users")}
            className="pl-9 pr-4 py-2 rounded-xl text-sm outline-none"
            style={{ background: "var(--surface)", border: "1px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }} />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
              {[t("table.user"), t("table.email"), t("table.role_col"), t("table.status"), t("table.registered"), t("table.actions")].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-bold" style={{ color: "var(--text3)" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map(u => {
                const rc = roleColors[u.role] || { bg: "#f2f0f9", text: "#4b4672" };
                const sc = statusColors[u.status] || { bg: "#f2f0f9", text: "#4b4672" };
                return (
                  <tr key={u.email} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-5 py-3 font-semibold" style={{ color: "var(--text)" }}>{u.name}</td>
                    <td className="px-5 py-3" style={{ color: "var(--text3)" }}>{u.email}</td>
                    <td className="px-5 py-3"><span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: rc.bg, color: rc.text }}>{u.role}</span></td>
                    <td className="px-5 py-3"><span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: sc.bg, color: sc.text }}>{u.status}</span></td>
                    <td className="px-5 py-3" style={{ color: "var(--text3)" }}>{u.registered}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1.5">
                        <Btn variant="secondary" className="py-1 px-2 text-xs">{t("admin.review_btn")}</Btn>
                        {u.status === "Active"
                          ? <Btn variant="danger" className="py-1 px-2 text-xs">{t("admin.suspend_btn")}</Btn>
                          : <Btn variant="ghost" className="py-1 px-2 text-xs">{t("admin.restore_btn")}</Btn>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function EventModeration() {
  const { t } = useLang();
  const [tab, setTab] = useState("Pending");
  const tabs = [
    ["Pending", t("admin.pending_tab")],
    ["Reported", t("admin.reported_tab")],
    ["Published", t("admin.published_tab")],
    ["Suspended", t("admin.suspended_tab")],
  ];
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("admin.event_mod")}</h1>
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
            style={{ background: tab === key ? "var(--primary)" : "transparent", color: tab === key ? "#fff" : "var(--text2)" }}>
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {(tab === "Pending" ? EVENTS.slice(0, 2) : EVENTS.slice(2, 4)).map(ev => (
          <Card key={ev.id} className="p-4 flex flex-col sm:flex-row gap-4">
            <img src={ev.image} alt={ev.title} className="w-full sm:w-24 h-24 sm:h-16 rounded-xl object-cover" style={{ backgroundColor: "#e4e0f0" }} />
            <div className="flex-1">
              <p className="font-bold" style={{ color: "var(--text)" }}>{ev.title}</p>
              <p className="text-xs" style={{ color: "var(--text3)" }}>{ev.date} · {ev.venue} · {ev.organizer}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Btn variant="secondary">{t("admin.review_btn")}</Btn>
              <Btn variant="ghost">{t("admin.approve_btn")}</Btn>
              <Btn variant="danger">{t("admin.suspend_btn")}</Btn>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PaymentsPage() {
  const { t } = useLang();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("admin.payments")}</h1>
      <div className="p-4 rounded-xl text-sm font-semibold" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
        <span className="inline-flex items-center gap-1.5"><IconAlertCircle size={16} /> All payment records below are Sandbox / Demo transactions. No real money has been transferred.</span>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
              {[t("table.order_id"), t("table.organizer"), t("table.event"), t("table.amount"), t("table.status"), t("table.date")].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-bold" style={{ color: "var(--text3)" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {[
                ["ORD-001", "KZ Founders Hub", "Almaty Jazz Festival", "₸ 9,000", "Paid"],
                ["ORD-002", "Nomad Sounds", "Nomad Electronic Night", "₸ 5,000", "Paid"],
                ["ORD-003", "Almaty Run Club", "Marathon Almaty 2026", "₸ 2,000", "Paid"],
                ["ORD-004", "Tech Events KZ", "DevMeet Almaty", "₸ 15,000", "Failed"],
              ].map(([id, org, ev, amt, status]) => {
                const sc = status === "Paid" ? { bg: "var(--success-bg)", text: "var(--success)" } : { bg: "var(--danger-bg)", text: "var(--danger)" };
                return (
                  <tr key={id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-5 py-3 font-mono text-xs" style={{ color: "var(--primary)" }}>{id}</td>
                    <td className="px-5 py-3" style={{ color: "var(--text2)" }}>{org}</td>
                    <td className="px-5 py-3" style={{ color: "var(--text2)" }}>{ev}</td>
                    <td className="px-5 py-3 font-bold" style={{ color: "var(--text)" }}>{amt}</td>
                    <td className="px-5 py-3"><span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: sc.bg, color: sc.text }}>{status}</span></td>
                    <td className="px-5 py-3" style={{ color: "var(--text3)" }}>Sep 3, 2026</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SupportCases() {
  const { t } = useLang();
  const [selected, setSelected] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const cases = [
    { id: 1, user: "Aizat Bekova", category: "Ticket Delivery", event: "Almaty Jazz Festival", status: "Open", date: "Sep 3" },
    { id: 2, user: "KZ Founders Hub", category: "Paid Sales Activation", event: "—", status: "In Progress", date: "Sep 2" },
    { id: 3, user: "Daniyar Seitkali", category: "Refund", event: "Nomad Night", status: "Waiting for Customer", date: "Sep 1" },
    { id: 4, user: "Mira Ahmetova", category: "Account", event: "—", status: "Resolved", date: "Aug 30" },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("admin.support")}</h1>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2 space-y-3">
          {cases.map(c => {
            const ss = STATUS_STYLES[c.status] || { bg: "#f2f0f9", text: "#4b4672" };
            return (
              <button key={c.id} onClick={() => setSelected(c.id)}
                className="w-full text-left p-4 rounded-2xl transition-all"
                style={{
                  background: selected === c.id ? "var(--primary-light)" : "var(--surface)",
                  border: "1px solid " + (selected === c.id ? "var(--primary)" : "var(--border)"),
                }}>
                <div className="flex justify-between items-start gap-2 mb-1">
                  <p className="font-bold text-sm" style={{ color: "var(--text)" }}>{c.user}</p>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold shrink-0" style={{ background: ss.bg, color: ss.text }}>{c.status}</span>
                </div>
                <p className="text-xs" style={{ color: "var(--text3)" }}>{c.category} · {c.date}</p>
              </button>
            );
          })}
        </div>

        {selected !== null && (() => {
          const c = cases.find(x => x.id === selected)!;
          const ss = STATUS_STYLES[c.status] || { bg: "#f2f0f9", text: "#4b4672" };
          return (
            <Card className="lg:col-span-3 p-5 flex flex-col" style={{ minHeight: "400px" }}>
              <div className="mb-4 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <p className="font-bold" style={{ color: "var(--text)" }}>#{c.id} — {c.category}</p>
                    <p className="text-xs" style={{ color: "var(--text3)" }}>{t("support.submitted_label")} {c.user} · {c.date}</p>
                  </div>
                  <select defaultValue={c.status} className="text-xs px-3 py-1.5 rounded-xl outline-none font-semibold"
                    style={{ background: ss.bg, color: ss.text, fontFamily: "inherit" }}>
                    {["Open", "In Progress", "Waiting for Customer", "Resolved"].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex-1 space-y-3 mb-4">
                <div className="p-3 rounded-xl text-sm" style={{ background: "var(--surface2)", color: "var(--text2)" }}>
                  <p className="font-semibold text-xs mb-1" style={{ color: "var(--text3)" }}>{c.user}</p>
                  {c.category === "Ticket Delivery"
                    ? "I am having trouble with my ticket delivery for the Jazz Festival. I completed my order but haven't received the QR code email."
                    : `Issue with: ${c.category}`}
                </div>
                {c.status !== "Open" && (
                  <div className="p-3 rounded-xl text-sm" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>
                    <p className="font-semibold text-xs mb-1">BiletFlow Support</p>
                    Hi! I can see your case and am looking into it right away.
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <input value={reply} onChange={e => setReply(e.target.value)} placeholder={t("admin.type_reply")}
                  className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                  style={{ background: "var(--bg)", border: "1px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }} />
                <Btn variant="primary">{t("admin.send_btn")}</Btn>
              </div>
            </Card>
          );
        })()}
      </div>
    </div>
  );
}

function PaidActivationReview() {
  const { t } = useLang();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("admin.paid_activation")}</h1>
      <div className="p-4 rounded-xl text-sm font-semibold" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
        <span className="inline-flex items-center gap-1.5"><IconAlertCircle size={16} /> {t("activation.sandbox_note")}</span>
      </div>
      <div className="space-y-4">
        {[
          { org: "Astana Music Studio", event: "Winter Jazz Night", submitted: "Sep 3, 2026", status: "Pending" },
          { org: "KZ Dance Academy", event: "Ballet Gala 2026", submitted: "Sep 2, 2026", status: "In Progress" },
          { org: "AlmaFest", event: "Food Festival Almaty", submitted: "Aug 30, 2026", status: "Resolved" },
        ].map(req => {
          const ss = req.status === "Pending" ? { bg: "var(--warning-bg)", text: "var(--warning)" } : req.status === "In Progress" ? { bg: "var(--info-bg)", text: "var(--info)" } : { bg: "var(--success-bg)", text: "var(--success)" };
          return (
            <Card key={req.org} className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <p className="font-bold" style={{ color: "var(--text)" }}>{req.org}</p>
                <p className="text-xs" style={{ color: "var(--text3)" }}>{req.event} · {t("support.submitted_label")} {req.submitted}</p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold self-start sm:self-auto" style={{ background: ss.bg, color: ss.text }}>{req.status}</span>
              <div className="flex gap-2 shrink-0">
                <Btn variant="secondary">{t("admin.review_btn")}</Btn>
                {req.status !== "Resolved" && <Btn variant="ghost">{t("admin.approve_btn")}</Btn>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Reports() {
  const { t } = useLang();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("admin.reports")}</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { title: "User Report", desc: "Total users, roles, registration trends", icon: <IconUsers size={24} /> },
          { title: "Event Report", desc: "Events by category, status, city", icon: <IconCalendar size={24} /> },
          { title: "Order Report", desc: "Orders, ticket sales, revenue", icon: <IconPackage size={24} /> },
          { title: "Payment Report", desc: "Payments, failures, refunds", icon: <IconCreditCard size={24} /> },
          { title: "Refund Report", desc: "Refund requests and completions", icon: <IconRotateCcw size={24} /> },
          { title: "Ticket Sales Report", desc: "Ticket types, quantities, revenue", icon: <IconTicket size={24} /> },
        ].map(({ title, desc, icon }) => (
          <Card key={title} className="p-5 flex items-start gap-4">
            <span className="text-2xl">{icon}</span>
            <div className="flex-1">
              <p className="font-bold mb-1" style={{ color: "var(--text)" }}>{title}</p>
              <p className="text-xs mb-3" style={{ color: "var(--text3)" }}>{desc}</p>
              <Btn variant="secondary">{t("btn.export")}</Btn>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AdminSettings() {
  const { t } = useLang();
  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("admin.settings")}</h1>
      <Card className="p-6 space-y-4">
        <h2 className="font-bold" style={{ color: "var(--text)" }}>Fees</h2>
        {[["Paid Sales Activation Fee (₸)", "5000"], ["Payment Processing Rate (%)", "2.9"]].map(([l, v]) => (
          <div key={l}>
            <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text3)" }}>{l}</label>
            <input defaultValue={v} className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: "var(--bg)", border: "1.5px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }} />
          </div>
        ))}
        <Btn variant="primary">{t("btn.save")}</Btn>
      </Card>
      <Card className="p-6 space-y-4">
        <h2 className="font-bold" style={{ color: "var(--text)" }}>Platform Moderation</h2>
        {[["Auto-approve new events", false], ["Require organizer ID verification", true]].map(([l, v]) => (
          <div key={l as string} className="flex items-center justify-between">
            <span className="text-sm" style={{ color: "var(--text2)" }}>{l}</span>
            <div className="w-11 h-6 rounded-full cursor-pointer relative" style={{ background: v ? "var(--primary)" : "var(--border2)" }}>
              <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: v ? "calc(100% - 22px)" : "2px" }} />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

export default function AdminPortal({ role, setRole }: { role: string; setRole: (r: string) => void }) {
  const { t } = useLang();
  const [page, setPage] = useState<AdminPage>("dashboard");

  const content: Record<AdminPage, React.ReactNode> = {
    dashboard: <AdminDashboard />,
    users: <UserManagement />,
    events: <EventModeration />,
    payments: <PaymentsPage />,
    refunds: (
      <div className="space-y-4">
        <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("admin.refunds")}</h1>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
                {[t("table.order_id"), t("table.name"), t("table.event"), t("table.amount"), t("table.status"), t("table.reason"), t("table.date")].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-bold" style={{ color: "var(--text3)" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {[
                  ["ORD-041", "Nurgul Abenova", "Nomad Night", "₸ 5,000", "Pending", "Event cancellation", "Sep 3"],
                  ["ORD-032", "Askar Bekkov", "Jazz Festival", "₸ 4,500", "Approved", "Cannot attend", "Sep 1"],
                ].map(row => (
                  <tr key={row[0]} style={{ borderBottom: "1px solid var(--border)" }}>
                    {row.map((v, i) => <td key={i} className="px-5 py-3" style={{ color: i === 0 ? "var(--primary)" : "var(--text2)", fontFamily: i === 0 ? "monospace" : "inherit" }}>{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    ),
    disputes: (
      <div className="space-y-4">
        <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("admin.disputes")}</h1>
        <Card className="p-8 text-center">
          <div className="flex justify-center mb-3"><IconAlertCircle size={48} /></div>
          <p className="font-bold" style={{ color: "var(--text)" }}>{t("empty.no_disputes")}</p>
          <p className="text-sm" style={{ color: "var(--text3)" }}>{t("empty.no_disputes_sub")}</p>
        </Card>
      </div>
    ),
    "paid-activation": <PaidActivationReview />,
    support: <SupportCases />,
    "promo-activity": (
      <div className="space-y-5">
        <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("admin.promo_activity")}</h1>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
                {[t("table.code"), t("table.organizer"), t("table.event"), t("table.discount"), t("table.redemptions"), t("table.status")].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-bold" style={{ color: "var(--text3)" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {[
                  ["SUMMER20", "KZ Founders Hub", "Almaty Jazz Festival", "20%", "14/50", "Active"],
                  ["VIP2026", "KZ Founders Hub", "Tech Summit KZ", "₸ 2,000", "3/20", "Active"],
                  ["EARLYBIRD", "Nomad Sounds", "Nomad Night", "₸ 1,000", "200/200", "Exhausted"],
                ].map(row => (
                  <tr key={row[0]} style={{ borderBottom: "1px solid var(--border)" }}>
                    {row.map((v, i) => <td key={i} className="px-5 py-3" style={{ color: i === 0 ? "var(--primary)" : "var(--text2)", fontFamily: i === 0 ? "monospace" : "inherit", fontWeight: i === 0 ? 700 : 400 }}>{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    ),
    reports: <Reports />,
    settings: <AdminSettings />,
  };

  return (
    <div className="flex" style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div className="hidden md:block">
        <AdminSidebar page={page} setPage={setPage} role={role} setRole={setRole} />
      </div>
      <MobileAdminNav page={page} setPage={setPage} role={role} setRole={setRole} />
      <main className="flex-1 p-5 md:p-8 pt-16 md:pt-8 overflow-auto">
        {content[page]}
      </main>
    </div>
  );
}
