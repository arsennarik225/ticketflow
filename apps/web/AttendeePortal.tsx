import React, { useState } from "react";
import { EVENTS, ORDERS, MY_TICKETS, CATEGORY_COLORS, STATUS_STYLES } from "./data";
import { useLang, LangSwitcher } from "./LangContext";
import { IconHome, IconCalendar, IconTicket, IconReceipt, IconUser, IconSearch, IconHeadset, IconX, IconDownload, IconPrinter, IconShare, IconMapPin, IconTag, IconQr, IconMail, IconArrowLeft, IconLogOut, IconCreditCard, IconBarChart, IconPackage, IconKey, IconCheck } from "./Icons";

type AttendeePage =
  | "home" | "events" | "event-detail" | "ticket-select" | "checkout"
  | "confirmation" | "my-tickets" | "ticket-detail" | "my-orders" | "profile"
  | "support" | "login" | "register" | "email-verify" | "forgot-pw" | "reset-pw";

const CATEGORIES = ["All", "Music", "Conference", "Party", "Art", "Sports", "Food"];

function Badge({ text, style }: { text: string; style?: { bg: string; text: string } }) {
  const s = style || STATUS_STYLES[text] || { bg: "#f2f0f9", text: "#4b4672" };
  return (
    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold inline-block"
      style={{ background: s.bg, color: s.text }}>{text}</span>
  );
}

function Btn({ children, variant = "primary", onClick, className = "", type = "button" }: {
  children: React.ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger";
  onClick?: () => void; className?: string; type?: "button" | "submit";
}) {
  const styles = {
    primary: { background: "var(--primary)", color: "#fff" },
    secondary: { background: "var(--primary-light)", color: "var(--primary)" },
    ghost: { background: "transparent", color: "var(--text2)", border: "1.5px solid var(--border2)" },
    danger: { background: "var(--danger-bg)", color: "var(--danger)" },
  };
  return (
    <button type={type} onClick={onClick}
      className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-85 active:scale-95 ${className}`}
      style={styles[variant]}>
      {children}
    </button>
  );
}

function Input({ label, placeholder, type = "text", value, onChange, required }: {
  label: string; placeholder?: string; type?: string;
  value?: string; onChange?: (v: string) => void; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text2)" }}>{label}</label>
      <input type={type} placeholder={placeholder} value={value} required={required}
        onChange={e => onChange?.(e.target.value)}
        className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all focus:ring-2"
        style={{ background: "var(--bg)", border: "1.5px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }} />
    </div>
  );
}

function Card({ children, className = "", style, onClick }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties; onClick?: () => void;
}) {
  return (
    <div className={`rounded-2xl ${className}`} onClick={onClick}
      style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", ...style }}>
      {children}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(30,27,58,0.4)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}>
        {children}
      </div>
    </div>
  );
}

function EventCard({ event, onClick }: { event: typeof EVENTS[0]; onClick: () => void }) {
  const { t } = useLang();
  const pct = Math.round((event.sold / event.capacity) * 100);
  const cat = CATEGORY_COLORS[event.category] || { bg: "#f2f0f9", text: "#4b4672" };
  return (
    <button onClick={onClick} className="group text-left rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg w-full"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
      <div className="relative overflow-hidden h-44">
        <img src={event.image} alt={event.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          style={{ backgroundColor: "#e4e0f0" }} />
        <div className="absolute top-3 left-3">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: cat.bg, color: cat.text }}>
            {t(`cat.${event.category}`) || event.category}
          </span>
        </div>
        {event.price === 0 && (
          <div className="absolute top-3 right-3">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: "#d8f5ef", color: "#1b9c7e" }}>
              {t("card.free")}
            </span>
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-bold text-sm leading-snug mb-2 group-hover:text-violet-700 transition-colors line-clamp-2" style={{ color: "var(--text)" }}>{event.title}</h3>
        <p className="text-xs mb-0.5 flex items-center gap-1" style={{ color: "var(--text3)" }}>
          <IconCalendar size={12} />{event.date} · {event.time}
        </p>
        <p className="text-xs mb-4 flex items-center gap-1 truncate" style={{ color: "var(--text3)" }}>
          <IconMapPin size={12} />{event.venue}
        </p>
        <div className="flex items-center justify-between">
          <span className="font-black text-base" style={{ color: event.price === 0 ? "var(--mint)" : "var(--primary)" }}>
            {event.price === 0 ? t("card.free") : `${event.price.toLocaleString()} ₸`}
          </span>
          <div className="text-right">
            <p className="text-xs mb-1" style={{ color: "var(--text3)" }}>{pct}% {t("card.sold_pct").replace("% ", "")}</p>
            <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 85 ? "var(--danger)" : "var(--primary)" }} />
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

function AttendeeNav({ page, setPage, role, setRole }: {
  page: AttendeePage; setPage: (p: AttendeePage) => void;
  role: string; setRole: (r: string) => void;
}) {
  const { t } = useLang();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems: [AttendeePage, React.ReactNode, string][] = [
    ["home", <IconHome size={16} />, t("nav.home")],
    ["events", <IconSearch size={16} />, t("nav.events")],
    ["my-tickets", <IconTicket size={16} />, t("nav.my_tickets")],
    ["my-orders", <IconReceipt size={16} />, t("nav.my_orders")],
    ["profile", <IconUser size={16} />, t("nav.profile")],
  ];
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-4 md:px-8 py-3 flex items-center justify-between"
      style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
      <button onClick={() => setPage("home")} className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-sm"
          style={{ background: "linear-gradient(135deg, var(--primary), var(--pink))" }}>B</div>
        <span className="font-black text-lg" style={{ color: "var(--primary)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Bilet<span style={{ color: "var(--pink)" }}>Flow</span>
        </span>
      </button>

      <div className="hidden md:flex items-center gap-1">
        {navItems.map(([key, icon, label]) => (
          <button key={key} onClick={() => setPage(key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ background: page === key ? "var(--primary-light)" : "transparent", color: page === key ? "var(--primary)" : "var(--text2)" }}>
            <span>{icon}</span>{label}
          </button>
        ))}
      </div>

      <div className="hidden md:flex items-center gap-2">
        <button className="relative p-2 rounded-xl" style={{ background: "var(--surface2)" }}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "var(--text2)" }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-2.81A2 2 0 0118 13V9a6 6 0 00-12 0v4a2 2 0 01-.595 1.19L4 17h5m6 0v1a3 3 0 01-6 0v-1m6 0H9" />
          </svg>
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: "var(--pink)" }} />
        </button>
        <LangSwitcher />
        <select value={role} onChange={e => setRole(e.target.value)}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg outline-none"
          style={{ background: "var(--surface2)", color: "var(--text2)", border: "1px solid var(--border)", fontFamily: "inherit" }}>
          <option value="attendee">{t("role.attendee")}</option>
          <option value="organizer">{t("role.organizer")}</option>
          <option value="admin">{t("role.admin")}</option>
          <option value="mobile">{t("role.mobile")}</option>
        </select>
        <Btn variant="secondary" onClick={() => setPage("support")}>{t("nav.support")}</Btn>
        <Btn variant="primary" onClick={() => setPage("login")}>{t("nav.sign_in")}</Btn>
      </div>

      <button className="md:hidden p-2 rounded-xl" style={{ background: "var(--surface2)" }} onClick={() => setMobileOpen(!mobileOpen)}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
        </svg>
      </button>

      {mobileOpen && (
        <div className="absolute top-14 left-2 right-2 rounded-2xl p-3 flex flex-col gap-1 z-50"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}>
          {navItems.map(([key, icon, label]) => (
            <button key={key} onClick={() => { setPage(key); setMobileOpen(false); }}
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-left"
              style={{ background: page === key ? "var(--primary-light)" : "transparent", color: page === key ? "var(--primary)" : "var(--text2)" }}>
              {icon} {label}
            </button>
          ))}
          <div className="border-t pt-2 mt-1 space-y-2" style={{ borderColor: "var(--border)" }}>
            <LangSwitcher className="px-3" />
            <select value={role} onChange={e => { setRole(e.target.value); setMobileOpen(false); }}
              className="w-full text-sm font-semibold px-3 py-2 rounded-xl outline-none"
              style={{ background: "var(--surface2)", color: "var(--text2)", fontFamily: "inherit" }}>
              <option value="attendee">{t("role.attendee")}</option>
              <option value="organizer">{t("role.organizer")}</option>
              <option value="admin">{t("role.admin")}</option>
              <option value="mobile">{t("role.mobile")}</option>
            </select>
          </div>
        </div>
      )}
    </nav>
  );
}

function HomePage({ setPage, setSelectedEvent }: { setPage: (p: AttendeePage) => void; setSelectedEvent: (e: typeof EVENTS[0]) => void }) {
  const { t } = useLang();
  const features: { k: string; icon: React.ReactNode }[] = [
    { k: "qr", icon: <IconQr size={28} /> },
    { k: "payments", icon: <IconCreditCard size={28} /> },
    { k: "seating", icon: <IconMapPin size={28} /> },
    { k: "analytics", icon: <IconBarChart size={28} /> },
    { k: "promo", icon: <IconTag size={28} /> },
    { k: "checkin", icon: <IconHeadset size={28} /> },
  ];
  return (
    <div>
      <section className="pt-24 pb-16 px-4 md:px-8" style={{ background: "linear-gradient(160deg, #f0ebff 0%, #fdf0f8 50%, #e8f5fb 100%)" }}>
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 text-sm font-semibold"
            style={{ background: "var(--primary-light)", color: "var(--primary)" }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--primary)" }} />
            {t("hero.tagline")}
          </div>
          <h1 className="text-4xl md:text-6xl font-black leading-tight mb-5" style={{ color: "var(--text)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {t("hero.title_1")}<br />
            <span style={{ background: "linear-gradient(135deg, var(--primary), var(--pink))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {t("hero.title_2")} {t("hero.title_3")}
            </span>
          </h1>
          <p className="text-base md:text-lg mb-8 max-w-2xl mx-auto leading-relaxed" style={{ color: "var(--text2)" }}>
            {t("hero.subtitle")}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
            <Btn variant="primary" onClick={() => setPage("events")} className="px-8 py-3 text-base">{t("hero.explore_cta")}</Btn>
            <Btn variant="secondary" onClick={() => setPage("login")} className="px-8 py-3 text-base">{t("hero.organize_cta")}</Btn>
          </div>

          <div className="max-w-xl mx-auto relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: "var(--text3)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input placeholder={t("hero.search_placeholder")} onClick={() => setPage("events")}
              readOnly
              className="w-full pl-12 pr-4 py-3.5 rounded-2xl text-sm outline-none cursor-pointer"
              style={{ background: "var(--surface)", border: "1.5px solid var(--border2)", color: "var(--text)", boxShadow: "var(--shadow)" }} />
          </div>

          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {CATEGORIES.filter(c => c !== "All").map(cat => {
              const c = CATEGORY_COLORS[cat] || { bg: "#f2f0f9", text: "#4b4672" };
              return (
                <button key={cat} onClick={() => setPage("events")}
                  className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all hover:opacity-80"
                  style={{ background: c.bg, color: c.text }}>
                  {t(`cat.${cat}`) || cat}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="py-8 px-4 md:px-8" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-6 text-center">
          {[["10,000+", t("stats.events")], ["250,000+", t("stats.tickets")], [t("stats.free"), ""]].map(([v, l]) => (
            <div key={v}>
              <p className="text-xl md:text-2xl font-black" style={{ color: "var(--primary)" }}>{v}</p>
              {l && <p className="text-xs md:text-sm" style={{ color: "var(--text3)" }}>{l}</p>}
            </div>
          ))}
        </div>
      </div>

      <section className="py-12 px-4 md:px-8 max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "var(--pink)" }}>{t("section.this_week")}</p>
            <h2 className="text-2xl md:text-3xl font-black" style={{ color: "var(--text)" }}>{t("section.trending")}</h2>
          </div>
          <button onClick={() => setPage("events")} className="text-sm font-semibold hidden sm:block" style={{ color: "var(--primary)" }}>{t("section.view_all")}</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {EVENTS.slice(0, 3).map(ev => (
            <EventCard key={ev.id} event={ev} onClick={() => { setSelectedEvent(ev); setPage("event-detail"); }} />
          ))}
        </div>
      </section>

      <section className="py-12 px-4 md:px-8" style={{ background: "linear-gradient(160deg, #f0ebff 0%, #fdf0f8 100%)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-black mb-3" style={{ color: "var(--text)" }}>{t("section.features")}</h2>
            <p style={{ color: "var(--text2)" }}>BiletFlow — ұйымдастырушылар мен қатысушылар үшін</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map(({ icon, k }) => (
              <Card key={k} className="p-5">
                <div className="mb-3" style={{ color: "var(--primary)" }}>{icon}</div>
                <h3 className="font-bold mb-1" style={{ color: "var(--text)" }}>{t(`feature.${k}.title`)}</h3>
                <p className="text-sm" style={{ color: "var(--text2)" }}>{t(`feature.${k}.desc`)}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 px-4 md:px-8 max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-8">
          <h2 className="text-2xl md:text-3xl font-black" style={{ color: "var(--text)" }}>{t("section.upcoming")}</h2>
          <button onClick={() => setPage("events")} className="text-sm font-semibold" style={{ color: "var(--primary)" }}>{t("cta.see_all")}</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {EVENTS.slice(3).map(ev => (
            <EventCard key={ev.id} event={ev} onClick={() => { setSelectedEvent(ev); setPage("event-detail"); }} />
          ))}
        </div>
      </section>

      <section className="py-12 px-4 md:px-8 mb-8 max-w-5xl mx-auto">
        <div className="rounded-3xl p-10 md:p-14 text-center"
          style={{ background: "linear-gradient(135deg, #6c4de6 0%, #e8529a 100%)" }}>
          <h2 className="text-2xl md:text-3xl font-black text-white mb-3">{t("cta.ready_title")}</h2>
          <p className="text-white/80 mb-6">{t("cta.ready_sub")}</p>
          <button onClick={() => setPage("login")}
            className="px-8 py-3 rounded-2xl font-bold text-base bg-white transition-all hover:scale-105"
            style={{ color: "var(--primary)" }}>
            {t("cta.create_free")}
          </button>
        </div>
      </section>
    </div>
  );
}

function EventsPage({ setPage, setSelectedEvent }: { setPage: (p: AttendeePage) => void; setSelectedEvent: (e: typeof EVENTS[0]) => void }) {
  const { t } = useLang();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [priceFilter, setPriceFilter] = useState("All");
  const [sort, setSort] = useState("date");

  const filtered = EVENTS.filter(e =>
    (category === "All" || e.category === category) &&
    (priceFilter === "All" || (priceFilter === "Free" ? e.price === 0 : e.price > 0)) &&
    (e.title.toLowerCase().includes(search.toLowerCase()) || e.venue.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="pt-20 min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="px-4 md:px-8 py-8" style={{ background: "linear-gradient(160deg, #f0ebff, #fdf0f8)" }}>
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-black mb-2" style={{ color: "var(--text)" }}>{t("explore.title")}</h1>
          <p className="text-sm mb-5" style={{ color: "var(--text2)" }}>{t("explore.subtitle")}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text3)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("explore.search")}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: "var(--surface)", border: "1.5px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }} />
            </div>
            <select value={priceFilter} onChange={e => setPriceFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold outline-none"
              style={{ background: "var(--surface)", border: "1.5px solid var(--border2)", color: "var(--text2)", fontFamily: "inherit" }}>
              <option value="All">{t("explore.all_prices")}</option>
              <option value="Free">{t("explore.free_only")}</option>
              <option value="Paid">{t("explore.paid_only")}</option>
            </select>
            <select value={sort} onChange={e => setSort(e.target.value)}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold outline-none"
              style={{ background: "var(--surface)", border: "1.5px solid var(--border2)", color: "var(--text2)", fontFamily: "inherit" }}>
              <option value="date">{t("explore.sort_date")}</option>
              <option value="price-asc">{t("explore.sort_price_asc")}</option>
              <option value="price-desc">{t("explore.sort_price_desc")}</option>
            </select>
          </div>
          <div className="flex gap-2 flex-wrap mt-3">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setCategory(cat)}
                className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all"
                style={{
                  background: category === cat ? "var(--primary)" : "var(--surface)",
                  color: category === cat ? "#fff" : "var(--text2)",
                  border: "1px solid " + (category === cat ? "var(--primary)" : "var(--border2)"),
                }}>
                {t(`cat.${cat}`) || cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 pb-16">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="flex justify-center mb-4" style={{ color: "var(--text3)" }}><IconSearch size={48} /></div>
            <p className="font-bold text-lg mb-1" style={{ color: "var(--text)" }}>{t("explore.no_results")}</p>
            <p style={{ color: "var(--text3)" }}>{t("explore.no_results_sub")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(ev => (
              <EventCard key={ev.id} event={ev} onClick={() => { setSelectedEvent(ev); setPage("event-detail"); }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EventDetailPage({ event, setPage, setSelectedTicketEvent }: {
  event: typeof EVENTS[0]; setPage: (p: AttendeePage) => void; setSelectedTicketEvent: (e: typeof EVENTS[0]) => void;
}) {
  const { t } = useLang();
  const pct = Math.round((event.sold / event.capacity) * 100);
  const cat = CATEGORY_COLORS[event.category] || { bg: "#f2f0f9", text: "#4b4672" };
  const isFree = event.ticketTypes.every(tt => tt.price === 0);

  return (
    <div className="min-h-screen pt-16 pb-16" style={{ background: "var(--bg)" }}>
      <div className="relative h-64 md:h-80 overflow-hidden">
        <img src={event.image} alt={event.title} className="w-full h-full object-cover" style={{ backgroundColor: "#e4e0f0" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(247,246,251,1) 0%, rgba(247,246,251,0) 50%)" }} />
        <button onClick={() => setPage("events")}
          className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold"
          style={{ background: "rgba(255,255,255,0.9)", color: "var(--text2)" }}>
          {t("event.back")}
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 -mt-6 relative">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: cat.bg, color: cat.text }}>
                {t(`cat.${event.category}`) || event.category}
              </span>
              {event.tags.map(tag => <span key={tag} className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: "var(--surface2)", color: "var(--text2)" }}>{tag}</span>)}
            </div>
            <h1 className="text-2xl md:text-3xl font-black mb-5" style={{ color: "var(--text)" }}>{event.title}</h1>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {[
                { icon: <IconCalendar size={18} />, label: t("event.date_time"), val: `${event.date} · ${event.time}` },
                { icon: <IconMapPin size={18} />, label: t("event.venue"), val: event.venue },
                { icon: <IconHome size={18} />, label: t("event.address"), val: event.address },
                { icon: <IconUser size={18} />, label: t("event.organizer"), val: event.organizer },
              ].map(({ icon, label, val }) => (
                <Card key={label} className="p-4 flex items-start gap-3">
                  <span className="mt-0.5" style={{ color: "var(--primary)" }}>{icon}</span>
                  <div>
                    <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--text3)" }}>{label}</p>
                    <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{val}</p>
                  </div>
                </Card>
              ))}
            </div>

            <Card className="p-5 mb-5">
              <h2 className="font-bold mb-3" style={{ color: "var(--text)" }}>{t("event.about")}</h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text2)" }}>{event.description}</p>
            </Card>

            <div className="flex flex-wrap gap-3 mb-5">
              <Btn variant="ghost">{t("event.add_calendar")}</Btn>
              <Btn variant="ghost">{t("event.share")}</Btn>
              <Btn variant="ghost" onClick={() => setPage("support")}>{t("event.support")}</Btn>
            </div>

            <Card className="p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="font-semibold" style={{ color: "var(--text2)" }}>{pct}% {t("card.sold_pct").replace("% ", "")} · {event.capacity - event.sold} {t("event.remaining")}</span>
                <span style={{ color: "var(--text3)" }}>{event.sold}/{event.capacity}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 85 ? "var(--danger)" : "var(--primary)" }} />
              </div>
            </Card>
          </div>

          <div className="lg:sticky lg:top-20 self-start">
            <Card className="p-5">
              <h3 className="font-bold mb-4" style={{ color: "var(--text)" }}>{t("event.select_tickets")}</h3>
              <div className="space-y-2 mb-4">
                {event.ticketTypes.map(tt => {
                  const remaining = tt.quantity - tt.sold;
                  const isOut = remaining <= 0;
                  return (
                    <div key={tt.id} className="w-full text-left p-3 rounded-xl"
                      style={{ border: "1.5px solid var(--border)", background: "var(--bg)", opacity: isOut ? 0.6 : 1 }}>
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-bold text-sm" style={{ color: "var(--text)" }}>{tt.name}</p>
                          {tt.description && <p className="text-xs" style={{ color: "var(--text3)" }}>{tt.description}</p>}
                          <p className="text-xs mt-0.5" style={{ color: isOut ? "var(--danger)" : "var(--text3)" }}>
                            {isOut ? t("ticket_select.sold_out") : `${remaining} ${t("event.remaining")}`}
                          </p>
                        </div>
                        <p className="font-black text-base" style={{ color: tt.price === 0 ? "var(--mint)" : "var(--primary)" }}>
                          {tt.price === 0 ? t("card.free") : `${tt.price.toLocaleString()} ₸`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Btn variant="primary" className="w-full py-3 text-base" onClick={() => { setSelectedTicketEvent(event); setPage("ticket-select"); }}>
                {isFree ? t("event.register_free") : t("event.get_tickets")}
              </Btn>
              <p className="text-xs text-center mt-2" style={{ color: "var(--text3)" }}>{t("event.secure")}</p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function TicketSelectPage({ event, setPage, selectedQty, setSelectedQty }: {
  event: typeof EVENTS[0];
  setPage: (p: AttendeePage) => void;
  selectedQty: Record<number, number>;
  setSelectedQty: (q: Record<number, number>) => void;
}) {
  const { t } = useLang();
  const total = event.ticketTypes.reduce((s, tt) => s + (selectedQty[tt.id] || 0) * tt.price, 0);
  const hasItems = Object.values(selectedQty).some(q => q > 0);

  return (
    <div className="min-h-screen pt-20 pb-16 px-4 md:px-8" style={{ background: "var(--bg)" }}>
      <div className="max-w-3xl mx-auto">
        <button onClick={() => setPage("event-detail")} className="flex items-center gap-1 text-sm font-semibold mb-6" style={{ color: "var(--text3)" }}>
          {t("btn.back")} {event.title}
        </button>
        <h1 className="text-2xl font-black mb-6" style={{ color: "var(--text)" }}>{t("ticket_select.title")}</h1>

        <Card className="p-5 mb-5">
          <div className="flex items-center gap-3 pb-4 mb-5" style={{ borderBottom: "1px solid var(--border)" }}>
            <img src={event.image} alt={event.title} className="w-14 h-14 rounded-xl object-cover" style={{ backgroundColor: "#e4e0f0" }} />
            <div>
              <p className="font-bold" style={{ color: "var(--text)" }}>{event.title}</p>
              <p className="text-xs" style={{ color: "var(--text3)" }}>{event.date} · {event.venue}</p>
            </div>
          </div>

          <div className="space-y-4">
            {event.ticketTypes.map(tt => {
              const q = selectedQty[tt.id] || 0;
              const remaining = tt.quantity - tt.sold;
              const isOut = remaining <= 0;
              return (
                <div key={tt.id} className="flex items-center gap-4 p-4 rounded-xl" style={{ background: "var(--surface2)", opacity: isOut ? 0.6 : 1 }}>
                  <div className="flex-1">
                    <p className="font-bold text-sm" style={{ color: "var(--text)" }}>{tt.name}</p>
                    {tt.description && <p className="text-xs" style={{ color: "var(--text3)" }}>{tt.description}</p>}
                    <p className="text-xs mt-0.5" style={{ color: isOut ? "var(--danger)" : "var(--text3)" }}>
                      {isOut ? t("ticket_select.sold_out") : `${remaining} ${t("event.remaining")} · ${t("ticket_select.max")} 10`}
                    </p>
                    <p className="font-black text-base mt-1" style={{ color: tt.price === 0 ? "var(--mint)" : "var(--primary)" }}>
                      {tt.price === 0 ? t("card.free") : `${tt.price.toLocaleString()} ₸`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedQty({ ...selectedQty, [tt.id]: Math.max(0, q - 1) })}
                      className="w-8 h-8 rounded-lg font-bold flex items-center justify-center"
                      style={{ background: "var(--surface)", border: "1px solid var(--border2)", color: "var(--primary)" }}>−</button>
                    <span className="w-8 text-center font-bold" style={{ color: "var(--text)" }}>{q}</span>
                    <button
                      onClick={() => { if (!isOut) setSelectedQty({ ...selectedQty, [tt.id]: Math.min(Math.min(10, remaining), q + 1) }); }}
                      disabled={isOut || q >= Math.min(10, remaining)}
                      className="w-8 h-8 rounded-lg font-bold flex items-center justify-center"
                      style={{ background: isOut || q >= Math.min(10, remaining) ? "var(--border2)" : "var(--primary)", color: "#fff" }}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5 mb-5">
          <h3 className="font-bold mb-3" style={{ color: "var(--text)" }}>{t("ticket_select.order_summary")}</h3>
          {event.ticketTypes.filter(tt => (selectedQty[tt.id] || 0) > 0).length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text3)" }}>{t("ticket_select.empty")}</p>
          ) : (
            event.ticketTypes.filter(tt => (selectedQty[tt.id] || 0) > 0).map(tt => (
              <div key={tt.id} className="flex justify-between text-sm py-1.5" style={{ color: "var(--text2)" }}>
                <span>{selectedQty[tt.id]}× {tt.name}</span>
                <span className="font-semibold">{tt.price === 0 ? t("card.free") : `${(tt.price * (selectedQty[tt.id] || 0)).toLocaleString()} ₸`}</span>
              </div>
            ))
          )}
          <div className="flex justify-between font-bold pt-3 mt-2" style={{ borderTop: "1px solid var(--border)", color: "var(--text)" }}>
            <span>{t("ticket_select.total")}</span>
            <span>{total === 0 && hasItems ? t("card.free") : total > 0 ? `${total.toLocaleString()} ₸` : "—"}</span>
          </div>
        </Card>

        <Btn variant="primary" className="w-full py-3 text-base"
          onClick={() => { if (hasItems) setPage("checkout"); }}>
          {hasItems ? t("ticket_select.continue") : t("ticket_select.select_one")}
        </Btn>
      </div>
    </div>
  );
}

function CheckoutPage({ event, setPage, selectedQty, onConfirm }: {
  event: typeof EVENTS[0];
  setPage: (p: AttendeePage) => void;
  selectedQty: Record<number, number>;
  onConfirm: (data: ConfirmationData) => void;
}) {
  const { t } = useLang();
  const [step, setStep] = useState<"info" | "payment" | "failed" | "done">("info");
  const [form, setForm] = useState({ name: "Aizat Bekova", email: "aizat@example.kz", phone: "+7 701 234 5678", promo: "" });
  const [promoState, setPromoState] = useState<"idle" | "valid" | "invalid">("idle");

  const VALID_PROMOS: Record<string, number> = { "SUMMER20": 0.2, "VIP2026": 0.15 };

  const lineItems = event.ticketTypes.filter(tt => (selectedQty[tt.id] || 0) > 0).map(tt => ({
    ...tt, qty: selectedQty[tt.id] || 0, lineTotal: tt.price * (selectedQty[tt.id] || 0),
  }));
  const subtotal = lineItems.reduce((s, li) => s + li.lineTotal, 0);
  const discountRate = promoState === "valid" ? (VALID_PROMOS[form.promo.toUpperCase()] || 0) : 0;
  const discountAmt = Math.round(subtotal * discountRate);
  const total = subtotal - discountAmt;
  const isFree = subtotal === 0;
  const totalQty = lineItems.reduce((s, li) => s + li.qty, 0);

  function applyPromo() {
    const code = form.promo.trim().toUpperCase();
    if (VALID_PROMOS[code]) {
      setPromoState("valid");
    } else {
      setPromoState("invalid");
    }
  }

  if (step === "done") {
    return null;
  }

  if (step === "failed") {
    return (
      <div className="min-h-screen pt-20 pb-16 flex items-center justify-center px-4" style={{ background: "var(--bg)" }}>
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-black mb-2" style={{ color: "var(--text)" }}>{t("checkout.failed_title")}</h1>
          <p className="text-sm mb-8" style={{ color: "var(--text2)" }}>{t("checkout.failed_sub")}</p>
          <div className="space-y-3">
            <Btn variant="primary" className="w-full py-3" onClick={() => setStep("payment")}>{t("checkout.retry")}</Btn>
            <Btn variant="ghost" className="w-full py-3" onClick={() => setStep("info")}>{t("checkout.back_details")}</Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-16 px-4 md:px-8" style={{ background: "var(--bg)" }}>
      <div className="max-w-4xl mx-auto">
        <button onClick={() => setPage("ticket-select")} className="text-sm font-semibold mb-6 block" style={{ color: "var(--text3)" }}>
          {t("btn.back")}
        </button>
        <h1 className="text-2xl font-black mb-6" style={{ color: "var(--text)" }}>{t("checkout.title")}</h1>

        <div className="flex items-center gap-2 mb-8">
          {[["info", "1", t("checkout.step_info")], ["payment", "2", t("checkout.step_payment")]].map(([s, n, l], idx) => (
            <div key={s} className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: step === s ? "var(--primary)" : (step === "payment" && s === "info" ? "var(--success)" : "var(--surface2)"),
                    color: step === s || (step === "payment" && s === "info") ? "#fff" : "var(--text3)",
                  }}>
                  {step === "payment" && s === "info" ? <IconCheck size={14} /> : n}
                </div>
                <span className="text-sm font-semibold hidden sm:block" style={{ color: step === s ? "var(--text)" : "var(--text3)" }}>{l}</span>
              </div>
              {idx === 0 && <div className="w-8 h-0.5 rounded" style={{ background: "var(--border2)" }} />}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={e => {
            e.preventDefault();
            if (step === "info") {
              if (isFree) {
                onConfirm({
                  orderId: "ORD-" + Math.random().toString(36).slice(2, 7).toUpperCase(),
                  ticketId: "BF-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
                  eventTitle: event.title, eventDate: event.date, eventTime: event.time, eventVenue: event.venue,
                  attendeeName: form.name, attendeeEmail: form.email, totalQty, total, isFree,
                });
                setStep("done");
              } else setStep("payment");
            } else {
              const willFail = Math.random() < 0.3;
              if (willFail) setStep("failed");
              else {
                onConfirm({
                  orderId: "ORD-" + Math.random().toString(36).slice(2, 7).toUpperCase(),
                  ticketId: "BF-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
                  eventTitle: event.title, eventDate: event.date, eventTime: event.time, eventVenue: event.venue,
                  attendeeName: form.name, attendeeEmail: form.email, totalQty, total, isFree,
                });
                setStep("done");
              }
            }
          }}
            className="lg:col-span-2 space-y-4">
            {step === "info" ? (
              <>
                <h2 className="font-bold" style={{ color: "var(--text)" }}>{t("checkout.attendee_info")}</h2>
                <Input label={t("checkout.full_name")} value={form.name} onChange={v => setForm({ ...form, name: v })} required placeholder="Aizat Bekova" />
                <Input label={t("checkout.email")} type="email" value={form.email} onChange={v => setForm({ ...form, email: v })} required placeholder="aizat@example.kz" />
                <Input label={t("checkout.phone")} type="tel" value={form.phone} onChange={v => setForm({ ...form, phone: v })} placeholder="+7 700 000 0000" />
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text2)" }}>{t("checkout.promo_code")}</label>
                  <div className="flex gap-2">
                    <input value={form.promo} onChange={e => { setForm({ ...form, promo: e.target.value }); setPromoState("idle"); }}
                      placeholder="SUMMER20"
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                      style={{ background: "var(--bg)", border: "1.5px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }} />
                    <Btn variant="secondary" onClick={applyPromo}>{t("checkout.apply")}</Btn>
                  </div>
                  {promoState === "valid" && <p className="text-xs mt-1.5 font-semibold" style={{ color: "var(--success)" }}>{t("checkout.promo_applied")}</p>}
                  {promoState === "invalid" && <p className="text-xs mt-1.5 font-semibold" style={{ color: "var(--danger)" }}>{t("checkout.promo_invalid")}</p>}
                </div>
              </>
            ) : (
              <>
                <h2 className="font-bold" style={{ color: "var(--text)" }}>{t("checkout.payment")}</h2>
                <div className="p-3 rounded-xl text-sm font-semibold" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
                  {t("checkout.demo_warning")}
                </div>
                <Input label={t("checkout.card_number")} placeholder="4111 1111 1111 1111" />
                <Input label={t("checkout.card_name")} placeholder="AIZAT BEKOVA" />
                <div className="grid grid-cols-2 gap-4">
                  <Input label={t("checkout.expiry")} placeholder="MM / YY" />
                  <Input label={t("checkout.cvv")} placeholder="•••" />
                </div>
              </>
            )}
            <button type="submit"
              className="w-full py-3 rounded-xl font-bold text-white text-base transition-all hover:opacity-90"
              style={{ background: "var(--primary)" }}>
              {step === "info"
                ? (isFree ? t("checkout.free_register") : t("checkout.continue_payment"))
                : `${t("checkout.pay")} ${total.toLocaleString()} ₸`}
            </button>
          </form>

          <Card className="p-5 self-start">
            <h3 className="font-bold mb-4" style={{ color: "var(--text)" }}>{t("checkout.order_summary")}</h3>
            <img src={event.image} alt={event.title} className="w-full h-28 object-cover rounded-xl mb-4" style={{ backgroundColor: "#e4e0f0" }} />
            <p className="font-bold text-sm mb-0.5" style={{ color: "var(--text)" }}>{event.title}</p>
            <p className="text-xs mb-4" style={{ color: "var(--text3)" }}>{event.date} · {event.venue}</p>
            <div className="space-y-2 text-sm border-t pt-3" style={{ borderColor: "var(--border)" }}>
              {lineItems.map(li => (
                <div key={li.id} className="flex justify-between">
                  <span style={{ color: "var(--text2)" }}>{li.qty}× {li.name}</span>
                  <span>{li.price === 0 ? t("card.free") : `${li.lineTotal.toLocaleString()} ₸`}</span>
                </div>
              ))}
              {promoState === "valid" && discountAmt > 0 && (
                <div className="flex justify-between" style={{ color: "var(--success)" }}>
                  <span>{t("checkout.discount")} (−{Math.round(discountRate * 100)}%)</span>
                  <span>−{discountAmt.toLocaleString()} ₸</span>
                </div>
              )}
              {!isFree && (
                <div className="flex justify-between text-xs" style={{ color: "var(--text3)" }}>
                  <span>{t("checkout.processing_fee")}</span>
                  <span>{t("checkout.included")}</span>
                </div>
              )}
              <div className="flex justify-between font-bold pt-2 border-t" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
                <span>{t("checkout.total")}</span>
                <span>{isFree ? t("card.free") : `${total.toLocaleString()} ₸`}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

type ConfirmationData = {
  orderId: string;
  ticketId: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventVenue: string;
  attendeeName: string;
  attendeeEmail: string;
  totalQty: number;
  total: number;
  isFree: boolean;
};

function OrderConfirmationPage({ data, setPage }: { data: ConfirmationData; setPage: (p: AttendeePage) => void }) {
  const { t } = useLang();
  return (
    <div className="min-h-screen pt-20 pb-16 flex items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: "var(--success-bg)", color: "var(--success)" }}>
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-black mb-2" style={{ color: "var(--text)" }}>
            {data.isFree ? t("confirm.title_free") : t("confirm.title_paid")}
          </h1>
          <p className="text-sm" style={{ color: "var(--text2)" }}>
            {t("confirm.sent_to")} <strong>{data.attendeeEmail}</strong>
          </p>
        </div>

        <Card className="p-5 mb-5">
          <div className="space-y-3 text-sm">
            {([
              [t("confirm.order"), data.orderId],
              [t("confirm.event"), data.eventTitle],
              [t("confirm.date"), `${data.eventDate} · ${data.eventTime}`],
              [t("confirm.venue"), data.eventVenue],
              [t("confirm.attendee"), data.attendeeName],
              [t("confirm.qty_tickets"), `${data.totalQty}`],
              [t("confirm.ticket_id"), data.ticketId],
              [t("confirm.total"), data.isFree ? t("card.free") : `${data.total.toLocaleString()} ₸`],
            ] as [string, string][]).map(([l, v]) => (
              <div key={l} className="flex gap-2">
                <span className="w-28 shrink-0 font-semibold" style={{ color: "var(--text3)" }}>{l}</span>
                <span style={{ color: "var(--text)" }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-2">
          <Btn variant="primary" className="w-full py-3" onClick={() => setPage("my-tickets")}>{t("confirm.view_tickets")}</Btn>
          <Btn variant="secondary" className="w-full py-3" onClick={() => setPage("my-orders")}>{t("nav.my_orders")}</Btn>
          <div className="flex gap-2">
            <Btn variant="ghost" className="flex-1" onClick={() => {}}>{t("confirm.add_calendar")}</Btn>
            <Btn variant="ghost" className="flex-1" onClick={() => {}}>{t("confirm.download_pdf")}</Btn>
            <Btn variant="ghost" className="flex-1" onClick={() => window.print()}>{t("confirm.print")}</Btn>
          </div>
          <Btn variant="ghost" className="w-full py-3" onClick={() => setPage("events")}>{t("confirm.explore")}</Btn>
        </div>
      </div>
    </div>
  );
}

function MyTicketsPage({ setPage, setSelectedTicket }: {
  setPage: (p: AttendeePage) => void;
  setSelectedTicket: (t: typeof MY_TICKETS[0]) => void;
}) {
  const { t } = useLang();
  const [filter, setFilter] = useState("All");
  const filtered = MY_TICKETS.filter(tk => filter === "All" || tk.status === filter);

  const filters = [
    ["All", t("tickets.all")],
    ["Valid", t("status.valid")],
    ["Checked In", t("status.checked_in")],
    ["Cancelled", t("status.cancelled")],
    ["Refunded", t("status.refunded")],
  ];

  if (MY_TICKETS.length === 0) {
    return (
      <div className="min-h-screen pt-20 flex flex-col items-center justify-center px-4">
        <div className="flex justify-center mb-4" style={{ color: "var(--text3)" }}><IconTicket size={48} /></div>
        <p className="font-bold text-xl mb-2" style={{ color: "var(--text)" }}>{t("empty.no_tickets")}</p>
        <p className="mb-6" style={{ color: "var(--text3)" }}>{t("empty.no_tickets_sub")}</p>
        <Btn variant="primary" onClick={() => setPage("events")}>{t("nav.events")}</Btn>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-16 px-4 md:px-8" style={{ background: "var(--bg)" }}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-black mb-6" style={{ color: "var(--text)" }}>{t("tickets.title")}</h1>
        <div className="flex gap-2 mb-6 flex-wrap">
          {filters.map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all"
              style={{ background: filter === key ? "var(--primary)" : "var(--surface)", color: filter === key ? "#fff" : "var(--text2)", border: "1px solid " + (filter === key ? "var(--primary)" : "var(--border)") }}>
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {filtered.map(ticket => {
            const ss = STATUS_STYLES[ticket.status] || { bg: "#f2f0f9", text: "#4b4672" };
            return (
              <Card key={ticket.id} className="p-4 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all"
                onClick={() => { setSelectedTicket(ticket); setPage("ticket-detail"); }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "var(--primary-light)", color: "var(--primary)" }}><IconTicket size={24} /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate" style={{ color: "var(--text)" }}>{ticket.eventTitle}</p>
                  <p className="text-xs" style={{ color: "var(--text3)" }}>{ticket.eventDate} · {ticket.venue}</p>
                  <p className="text-xs font-semibold mt-0.5" style={{ color: "var(--text3)" }}>{ticket.ticketType}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: ss.bg, color: ss.text }}>{ticket.status}</span>
                  <span className="text-xs font-mono" style={{ color: "var(--text3)" }}>{ticket.id}</span>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TicketDetailPage({ ticket, setPage }: { ticket: typeof MY_TICKETS[0]; setPage: (p: AttendeePage) => void }) {
  const { t } = useLang();
  const ss = STATUS_STYLES[ticket.status] || { bg: "#f2f0f9", text: "#4b4672" };
  return (
    <div className="min-h-screen pt-20 pb-16 px-4 md:px-8" style={{ background: "var(--bg)" }}>
      <div className="max-w-md mx-auto">
        <button onClick={() => setPage("my-tickets")} className="text-sm font-semibold mb-6 block" style={{ color: "var(--text3)" }}>
          {t("ticket_detail.back")}
        </button>
        <h1 className="text-2xl font-black mb-6" style={{ color: "var(--text)" }}>{t("ticket_detail.title")}</h1>

        <Card className="overflow-hidden mb-4 print-ticket">
          <div className="p-5 border-b" style={{ borderColor: "var(--border)", background: "linear-gradient(135deg, var(--primary-light), #fde8f3)" }}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="font-black text-lg" style={{ color: "var(--primary)", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>BiletFlow</p>
                <p className="text-xs font-semibold" style={{ color: "var(--text3)" }}>{t("ticket_detail.admission_ticket")}</p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: ss.bg, color: ss.text }}>{ticket.status}</span>
            </div>
            <p className="font-bold text-base" style={{ color: "var(--text)" }}>{ticket.eventTitle}</p>
          </div>

          <div className="p-6 flex justify-center" style={{ background: "var(--surface)" }}>
            <div className="p-3 rounded-2xl" style={{ background: "#fff", border: "2px solid var(--border)", boxShadow: "var(--shadow)" }}>
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: 49 }).map((_, i) => {
                  const corner = [0,1,2,7,8,9,14,6,13,20,42,43,44,49,48,47,35,36,37,41,40,34,28];
                  const isC = corner.includes(i);
                  return (
                    <div key={i} className="w-5 h-5 rounded-sm"
                      style={{ background: isC || Math.random() > 0.45 ? "var(--text)" : "transparent" }} />
                  );
                })}
              </div>
              <p className="text-center text-xs font-bold mt-2" style={{ color: "var(--text3)" }}>{t("ticket_detail.admission_qr")}</p>
            </div>
          </div>

          <div className="p-5 space-y-2 text-sm">
            {([
              [t("ticket_detail.id"), ticket.id],
              [t("ticket_detail.attendee"), ticket.attendee],
              [t("ticket_detail.type"), ticket.ticketType],
              [t("ticket_detail.date"), `${ticket.eventDate} · ${ticket.eventTime}`],
              [t("ticket_detail.venue"), ticket.venue],
              ...(ticket.seat ? [[t("ticket_detail.seat"), ticket.seat]] : []),
              [t("ticket_detail.status"), ticket.status],
            ] as [string, string][]).map(([l, v]) => (
              <div key={l} className="flex gap-3">
                <span className="w-24 shrink-0 font-semibold" style={{ color: "var(--text3)" }}>{l}</span>
                <span style={{ color: "var(--text)" }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 no-print">
          <Btn variant="primary" className="w-full py-3">{t("ticket_detail.download")}</Btn>
          <Btn variant="ghost" className="w-full py-3" onClick={() => window.print()}>{t("ticket_detail.print")}</Btn>
          <Btn variant="secondary" className="w-full py-3">{t("ticket_detail.add_calendar")}</Btn>
          <Btn variant="ghost" className="w-full py-3" onClick={() => setPage("support")}>{t("ticket_detail.support")}</Btn>
        </div>
      </div>
    </div>
  );
}

type OrderWithRefund = typeof ORDERS[0] & { refundStatus?: string | null };

function MyOrdersPage({ setPage }: { setPage: (p: AttendeePage) => void }) {
  const { t } = useLang();
  const [orders, setOrders] = useState<OrderWithRefund[]>(ORDERS.map(o => ({ ...o })));
  const [cancelModalId, setCancelModalId] = useState<string | null>(null);

  function confirmCancel(orderId: string) {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "Cancelled", refundStatus: "Pending" as string | null } : o) as OrderWithRefund[]);
    setCancelModalId(null);
  }

  if (orders.length === 0) {
    return (
      <div className="min-h-screen pt-20 flex flex-col items-center justify-center px-4">
        <div className="flex justify-center mb-4" style={{ color: "var(--text3)" }}><IconPackage size={48} /></div>
        <p className="font-bold text-xl mb-2" style={{ color: "var(--text)" }}>{t("empty.no_orders")}</p>
        <p className="mb-6" style={{ color: "var(--text3)" }}>{t("empty.no_orders_sub")}</p>
        <Btn variant="primary" onClick={() => setPage("events")}>{t("nav.events")}</Btn>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-16 px-4 md:px-8" style={{ background: "var(--bg)" }}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-black mb-6" style={{ color: "var(--text)" }}>{t("orders.title")}</h1>
        <div className="space-y-4">
          {orders.map(order => {
            const ps = STATUS_STYLES[order.paymentStatus] || { bg: "#f2f0f9", text: "#4b4672" };
            const isCancelled = order.status === "Cancelled";
            return (
              <Card key={order.id} className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="font-mono text-xs mb-1" style={{ color: "var(--text3)" }}>{order.id}</p>
                    <p className="font-bold" style={{ color: "var(--text)" }}>{order.eventTitle}</p>
                    <p className="text-sm" style={{ color: "var(--text3)" }}>{order.date} · {order.qty}× {order.ticketType}</p>
                    {isCancelled && (
                      <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold"
                        style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
                        {t("cancel.refund_pending")}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-start sm:items-end gap-1.5">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: ps.bg, color: ps.text }}>{order.paymentStatus}</span>
                    <p className="font-black" style={{ color: "var(--primary)" }}>{order.amount === 0 ? t("card.free") : `${order.amount.toLocaleString()} ₸`}</p>
                  </div>
                </div>
                {!isCancelled && (
                  <div className="flex flex-wrap gap-2">
                    <Btn variant="secondary" onClick={() => setPage("my-tickets")}>{t("orders.view")}</Btn>
                    {order.amount > 0 && <Btn variant="ghost">{t("orders.refund")}</Btn>}
                    <Btn variant="danger" onClick={() => setCancelModalId(order.id)}>{t("orders.cancel")}</Btn>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {cancelModalId && (
        <Modal onClose={() => setCancelModalId(null)}>
          <div className="p-6">
            <h2 className="text-lg font-black mb-3" style={{ color: "var(--text)" }}>{t("cancel.title")}</h2>
            <p className="text-sm mb-6" style={{ color: "var(--text2)" }}>{t("cancel.msg")}</p>
            <div className="flex gap-3">
              <Btn variant="ghost" className="flex-1" onClick={() => setCancelModalId(null)}>{t("cancel.keep")}</Btn>
              <Btn variant="danger" className="flex-1" onClick={() => confirmCancel(cancelModalId!)}>{t("cancel.confirm")}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ProfilePage() {
  const { t } = useLang();
  const [tab, setTab] = useState("profile");
  const tabs = [
    ["profile", t("profile.personal")],
    ["security", t("profile.security")],
    ["notifications", t("profile.notifications")],
  ];
  const notifItems = [
    t("profile.notif_purchase"),
    t("profile.notif_updates"),
    t("profile.notif_cancel"),
    t("profile.notif_refund"),
    t("profile.notif_support"),
    t("profile.notif_promo"),
  ];

  return (
    <div className="min-h-screen pt-20 pb-16 px-4 md:px-8" style={{ background: "var(--bg)" }}>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-black mb-6" style={{ color: "var(--text)" }}>{t("profile.title")}</h1>
        <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ background: tab === k ? "var(--primary)" : "transparent", color: tab === k ? "#fff" : "var(--text2)" }}>
              {l}
            </button>
          ))}
        </div>

        {tab === "profile" && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white"
                style={{ background: "linear-gradient(135deg, var(--primary), var(--pink))" }}>A</div>
              <div>
                <p className="font-bold text-lg" style={{ color: "var(--text)" }}>Aizat Bekova</p>
                <p className="text-sm" style={{ color: "var(--text3)" }}>{t("profile.attendee_role")}</p>
                <p className="text-xs mt-0.5 font-semibold" style={{ color: "var(--success)" }}>{t("profile.email_verified")}</p>
              </div>
            </div>
            <Input label={t("profile.name")} value="Aizat Bekova" />
            <Input label={t("profile.email")} type="email" value="aizat@example.kz" />
            <Input label={t("profile.phone")} type="tel" value="+7 701 234 5678" />
            <Btn variant="primary">{t("profile.save")}</Btn>
          </Card>
        )}
        {tab === "security" && (
          <Card className="p-6 space-y-4">
            <h2 className="font-bold" style={{ color: "var(--text)" }}>{t("profile.change_password")}</h2>
            <Input label={t("profile.current_password")} type="password" placeholder="••••••••" />
            <Input label={t("profile.new_password")} type="password" placeholder="••••••••" />
            <Input label={t("profile.confirm_password")} type="password" placeholder="••••••••" />
            <Btn variant="primary">{t("profile.update_password")}</Btn>
          </Card>
        )}
        {tab === "notifications" && (
          <Card className="p-6">
            <h2 className="font-bold mb-4" style={{ color: "var(--text)" }}>{t("profile.notifications")}</h2>
            <div className="space-y-3">
              {notifItems.map(item => (
                <div key={item} className="flex items-center justify-between py-2 border-b" style={{ borderColor: "var(--border)" }}>
                  <span className="text-sm" style={{ color: "var(--text2)" }}>{item}</span>
                  <div className="w-11 h-6 rounded-full relative cursor-pointer" style={{ background: "var(--primary)" }}>
                    <div className="absolute right-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

type SupportCase = {
  id: string; category: string; status: string; submitted: string;
  messages: { from: "user" | "support"; text: string; time: string }[];
};

function SupportPage() {
  const { t } = useLang();
  const [view, setView] = useState<"list" | "case" | "new">("list");
  const [selectedCase, setSelectedCase] = useState<SupportCase | null>(null);
  const [reply, setReply] = useState("");
  const [category, setCategory] = useState("");
  const [msg, setMsg] = useState("");
  const [cases, setCases] = useState<SupportCase[]>([
    {
      id: "CASE-001", category: t("support.cat.ticket_delivery"), status: "In Progress", submitted: "Sep 3, 2026",
      messages: [
        { from: "user", text: "I completed my order for the Jazz Festival but didn't receive the QR code by email.", time: "Sep 3, 09:12" },
        { from: "support", text: "Hi Aizat! I can see your order ORD-001 is confirmed and paid. Let me resend your ticket right away.", time: "Sep 3, 10:45" },
      ],
    },
    {
      id: "CASE-002", category: t("support.cat.refund"), status: "Open", submitted: "Sep 1, 2026",
      messages: [
        { from: "user", text: "I would like to request a refund for my Nomad Night ticket as I cannot attend.", time: "Sep 1, 15:30" },
      ],
    },
  ]);

  const statuses: Record<string, { bg: string; text: string }> = {
    "Open": { bg: "var(--pink-light)", text: "var(--pink)" },
    "In Progress": { bg: "var(--sky-light)", text: "var(--sky)" },
    "Waiting for Customer": { bg: "var(--warning-bg)", text: "var(--warning)" },
    "Resolved": { bg: "var(--success-bg)", text: "var(--success)" },
  };

  function submitNewCase() {
    if (!category || !msg) return;
    const newCase: SupportCase = {
      id: `CASE-00${cases.length + 1}`,
      category,
      status: "Open",
      submitted: "Sep 4, 2026",
      messages: [{ from: "user", text: msg, time: "Sep 4, 09:00" }],
    };
    setCases(prev => [newCase, ...prev]);
    setCategory(""); setMsg("");
    setView("list");
  }

  function sendReply() {
    if (!reply.trim() || !selectedCase) return;
    const updated = cases.map(c => c.id === selectedCase.id ? {
      ...c, messages: [...c.messages, { from: "user" as const, text: reply, time: "Now" }]
    } : c);
    setCases(updated);
    setSelectedCase(updated.find(c => c.id === selectedCase.id) || null);
    setReply("");
  }

  const categories = [
    t("support.cat.ticket_delivery"), t("support.cat.payment"), t("support.cat.refund"),
    t("support.cat.seating"), t("support.cat.event_info"), t("support.cat.checkin"),
    t("support.cat.account"), t("support.cat.technical"),
  ];

  if (view === "new") {
    return (
      <div className="min-h-screen pt-20 pb-16 px-4 md:px-8" style={{ background: "var(--bg)" }}>
        <div className="max-w-xl mx-auto">
          <button onClick={() => setView("list")} className="text-sm font-semibold mb-5 block" style={{ color: "var(--text3)" }}>{t("btn.back")}</button>
          <h1 className="text-2xl font-black mb-2" style={{ color: "var(--text)" }}>{t("support.title")}</h1>
          <p className="text-sm mb-6" style={{ color: "var(--text3)" }}>{t("support.subtitle")}</p>
          <Card className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: "var(--text2)" }}>{t("support.category")}</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: "var(--bg)", border: "1.5px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }}>
                <option value="">{t("support.select_category")}</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <Input label={t("support.order_id")} placeholder="ORD-XXXXX" />
            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: "var(--text2)" }}>{t("support.message")}</label>
              <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={5} placeholder={t("support.message_placeholder")}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                style={{ background: "var(--bg)", border: "1.5px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }} />
            </div>
            <Btn variant="primary" className="w-full py-3" onClick={submitNewCase}>{t("support.submit")}</Btn>
          </Card>
        </div>
      </div>
    );
  }

  if (view === "case" && selectedCase) {
    const ss = statuses[selectedCase.status] || { bg: "#f2f0f9", text: "#4b4672" };
    return (
      <div className="min-h-screen pt-20 pb-16 px-4 md:px-8" style={{ background: "var(--bg)" }}>
        <div className="max-w-xl mx-auto">
          <button onClick={() => setView("list")} className="text-sm font-semibold mb-5 block" style={{ color: "var(--text3)" }}>
            ← {t("support.my_cases")}
          </button>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-semibold" style={{ color: "var(--text3)" }}>{t("support.case_id")}: {selectedCase.id}</p>
              <p className="font-bold" style={{ color: "var(--text)" }}>{selectedCase.category}</p>
              <p className="text-xs" style={{ color: "var(--text3)" }}>{t("support.submitted_label")}: {selectedCase.submitted}</p>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: ss.bg, color: ss.text }}>
              {selectedCase.status}
            </span>
          </div>

          <Card className="p-5 mb-4">
            <div className="space-y-4 mb-4" style={{ maxHeight: "400px", overflowY: "auto" }}>
              {selectedCase.messages.map((m, i) => (
                <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-xs rounded-2xl p-3 text-sm"
                    style={{
                      background: m.from === "user" ? "var(--primary)" : "var(--surface2)",
                      color: m.from === "user" ? "#fff" : "var(--text2)",
                    }}>
                    {m.from === "support" && <p className="text-xs font-bold mb-1" style={{ color: "var(--text3)" }}>BiletFlow Support</p>}
                    <p>{m.text}</p>
                    <p className="text-xs mt-1 opacity-70">{m.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
              <input value={reply} onChange={e => setReply(e.target.value)}
                placeholder={t("support.reply_placeholder")}
                className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: "var(--bg)", border: "1px solid var(--border2)", color: "var(--text)", fontFamily: "inherit" }}
                onKeyDown={e => { if (e.key === "Enter") sendReply(); }} />
              <Btn variant="primary" onClick={sendReply}>{t("support.send")}</Btn>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-16 px-4 md:px-8" style={{ background: "var(--bg)" }}>
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("support.my_cases")}</h1>
          <Btn variant="primary" onClick={() => setView("new")}>{t("support.new_case")}</Btn>
        </div>

        {cases.length === 0 ? (
          <div className="text-center py-16">
            <div className="flex justify-center mb-3" style={{ color: "var(--text3)" }}><IconHeadset size={48} /></div>
            <p className="font-bold" style={{ color: "var(--text)" }}>{t("empty.no_cases")}</p>
            <p className="text-sm" style={{ color: "var(--text3)" }}>{t("empty.no_cases_sub")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cases.map(c => {
              const ss = statuses[c.status] || { bg: "#f2f0f9", text: "#4b4672" };
              return (
                <Card key={c.id} className="p-4 cursor-pointer hover:shadow-md transition-all"
                  onClick={() => { setSelectedCase(c); setView("case"); }}>
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div>
                      <p className="font-bold text-sm" style={{ color: "var(--text)" }}>{c.category}</p>
                      <p className="text-xs" style={{ color: "var(--text3)" }}>{t("support.case_id")}: {c.id} · {c.submitted}</p>
                      <p className="text-xs mt-1" style={{ color: "var(--text2)" }}>
                        {c.messages[c.messages.length - 1]?.text.slice(0, 60)}…
                      </p>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold shrink-0" style={{ background: ss.bg, color: ss.text }}>
                      {c.status}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RegisterPage({ setPage }: { setPage: (p: AttendeePage) => void }) {
  const { t } = useLang();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });

  return (
    <div className="min-h-screen pt-16 flex items-center justify-center px-4" style={{ background: "linear-gradient(160deg, #f0ebff, #fdf0f8)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-2xl mx-auto mb-3"
            style={{ background: "linear-gradient(135deg, var(--primary), var(--pink))" }}>B</div>
          <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("auth.register_title")}</h1>
        </div>
        <Card className="p-6">
          <form onSubmit={e => { e.preventDefault(); setPage("email-verify"); }} className="space-y-4">
            <Input label={t("auth.full_name")} value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="Aizat Bekova" required />
            <Input label={t("auth.email")} type="email" value={form.email} onChange={v => setForm({ ...form, email: v })} placeholder="you@example.kz" required />
            <Input label={t("auth.password")} type="password" value={form.password} onChange={v => setForm({ ...form, password: v })} placeholder="••••••••" required />
            <Input label={t("auth.confirm_password")} type="password" value={form.confirm} onChange={v => setForm({ ...form, confirm: v })} placeholder="••••••••" required />
            <p className="text-xs" style={{ color: "var(--text3)" }}>{t("auth.terms")}</p>
            <button type="submit" className="w-full py-3 rounded-xl font-bold text-white transition-all hover:opacity-90"
              style={{ background: "var(--primary)" }}>
              {t("auth.sign_up")}
            </button>
          </form>
          <button onClick={() => setPage("login")} className="block text-center w-full mt-4 text-sm" style={{ color: "var(--primary)" }}>
            {t("auth.have_account")}
          </button>
        </Card>
        <button onClick={() => setPage("home")} className="block text-center mt-4 text-sm" style={{ color: "var(--text3)" }}>
          {t("auth.back_home")}
        </button>
      </div>
    </div>
  );
}

function EmailVerifyPage({ setPage }: { setPage: (p: AttendeePage) => void }) {
  const { t } = useLang();
  const [code, setCode] = useState("");

  return (
    <div className="min-h-screen pt-16 flex items-center justify-center px-4" style={{ background: "linear-gradient(160deg, #f0ebff, #fdf0f8)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ background: "var(--primary-light)", color: "var(--primary)" }}><IconMail size={32} /></div>
          <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("auth.check_inbox")}</h1>
          <p className="text-sm mt-2" style={{ color: "var(--text2)" }}>{t("auth.verify_desc")}</p>
        </div>
        <Card className="p-6">
          <form onSubmit={e => { e.preventDefault(); setPage("home"); }} className="space-y-4">
            <Input label={t("auth.code_label")} value={code} onChange={setCode} placeholder="123456" required />
            <button type="submit" className="w-full py-3 rounded-xl font-bold text-white transition-all hover:opacity-90"
              style={{ background: "var(--primary)" }}>
              {t("auth.verify_btn")}
            </button>
          </form>
          <button onClick={() => {}} className="block text-center w-full mt-4 text-sm" style={{ color: "var(--primary)" }}>
            {t("auth.resend")}
          </button>
          <button onClick={() => setPage("register")} className="block text-center w-full mt-2 text-sm" style={{ color: "var(--text3)" }}>
            {t("auth.back_to_login")}
          </button>
        </Card>
      </div>
    </div>
  );
}

function ForgotPasswordPage({ setPage }: { setPage: (p: AttendeePage) => void }) {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <div className="min-h-screen pt-16 flex items-center justify-center px-4" style={{ background: "linear-gradient(160deg, #f0ebff, #fdf0f8)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ background: "var(--primary-light)", color: "var(--primary)" }}><IconKey size={32} /></div>
          <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("auth.reset_password")}</h1>
          <p className="text-sm mt-2" style={{ color: "var(--text2)" }}>{t("auth.forgot_sub")}</p>
        </div>
        <Card className="p-6">
          {sent ? (
            <div className="text-center py-4 space-y-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                style={{ background: "var(--success-bg)", color: "var(--success)" }}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="font-semibold" style={{ color: "var(--text)" }}>{t("auth.check_inbox")}</p>
              <p className="text-sm" style={{ color: "var(--text3)" }}>{email}</p>
              <button onClick={() => setPage("reset-pw")}
                className="w-full py-3 rounded-xl font-bold text-white transition-all hover:opacity-90"
                style={{ background: "var(--primary)" }}>
                {t("auth.reset_password")} →
              </button>
            </div>
          ) : (
            <form onSubmit={e => { e.preventDefault(); setSent(true); }} className="space-y-4">
              <Input label={t("auth.email")} type="email" value={email} onChange={setEmail} placeholder="you@example.kz" required />
              <button type="submit" className="w-full py-3 rounded-xl font-bold text-white transition-all hover:opacity-90"
                style={{ background: "var(--primary)" }}>
                {t("auth.reset_link")}
              </button>
            </form>
          )}
          <button onClick={() => setPage("login")} className="block text-center w-full mt-4 text-sm" style={{ color: "var(--text3)" }}>
            {t("auth.back_to_login")}
          </button>
        </Card>
      </div>
    </div>
  );
}

function ResetPasswordPage({ setPage }: { setPage: (p: AttendeePage) => void }) {
  const { t } = useLang();
  const [form, setForm] = useState({ password: "", confirm: "" });

  return (
    <div className="min-h-screen pt-16 flex items-center justify-center px-4" style={{ background: "linear-gradient(160deg, #f0ebff, #fdf0f8)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-2xl mx-auto mb-3"
            style={{ background: "linear-gradient(135deg, var(--primary), var(--pink))" }}>B</div>
          <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("auth.set_new_password")}</h1>
          <p className="text-sm mt-2" style={{ color: "var(--text2)" }}>{t("auth.reset_sub")}</p>
        </div>
        <Card className="p-6">
          <form onSubmit={e => { e.preventDefault(); setPage("login"); }} className="space-y-4">
            <Input label={t("auth.new_password")} type="password" value={form.password} onChange={v => setForm({ ...form, password: v })} placeholder="••••••••" required />
            <Input label={t("auth.confirm_password")} type="password" value={form.confirm} onChange={v => setForm({ ...form, confirm: v })} placeholder="••••••••" required />
            <button type="submit" className="w-full py-3 rounded-xl font-bold text-white transition-all hover:opacity-90"
              style={{ background: "var(--primary)" }}>
              {t("auth.set_new_password")}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function LoginPage({ setPage }: { setPage: (p: AttendeePage) => void }) {
  const { t } = useLang();
  const [form, setForm] = useState({ email: "", password: "" });

  return (
    <div className="min-h-screen pt-16 flex items-center justify-center px-4" style={{ background: "linear-gradient(160deg, #f0ebff, #fdf0f8)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-2xl mx-auto mb-3"
            style={{ background: "linear-gradient(135deg, var(--primary), var(--pink))" }}>B</div>
          <h1 className="text-2xl font-black" style={{ color: "var(--text)" }}>{t("auth.welcome_back")}</h1>
        </div>

        <Card className="p-6">
          <form onSubmit={e => { e.preventDefault(); setPage("home"); }} className="space-y-4">
            <Input label={t("auth.email")} type="email" value={form.email} onChange={v => setForm({ ...form, email: v })} placeholder="you@example.kz" required />
            <Input label={t("auth.password")} type="password" value={form.password} onChange={v => setForm({ ...form, password: v })} placeholder="••••••••" required />
            <div className="flex justify-end">
              <button type="button" onClick={() => setPage("forgot-pw")} className="text-xs" style={{ color: "var(--primary)" }}>{t("auth.forgot")}</button>
            </div>
            <button type="submit" className="w-full py-3 rounded-xl font-bold text-white transition-all hover:opacity-90"
              style={{ background: "var(--primary)" }}>
              {t("auth.sign_in")}
            </button>
          </form>
          <button onClick={() => setPage("register")} className="block text-center w-full mt-4 text-sm" style={{ color: "var(--primary)" }}>
            {t("auth.no_account")}
          </button>
        </Card>

        <button onClick={() => setPage("home")} className="block text-center mt-4 text-sm" style={{ color: "var(--text3)" }}>
          {t("auth.back_home")}
        </button>
      </div>
    </div>
  );
}

export default function AttendeePortal({ role, setRole }: { role: string; setRole: (r: string) => void }) {
  const [page, setPage] = useState<AttendeePage>("home");
  const [selectedEvent, setSelectedEvent] = useState<typeof EVENTS[0]>(EVENTS[0]);
  const [selectedTicket, setSelectedTicket] = useState<typeof MY_TICKETS[0]>(MY_TICKETS[0]);
  const [selectedQty, setSelectedQty] = useState<Record<number, number>>({});
  const [confirmationData, setConfirmationData] = useState<ConfirmationData | null>(null);

  function handleSelectEvent(e: typeof EVENTS[0]) {
    setSelectedEvent(e);
    setSelectedQty({});
  }

  function handleConfirm(data: ConfirmationData) {
    setConfirmationData(data);
    setPage("confirmation");
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <AttendeeNav page={page} setPage={setPage} role={role} setRole={setRole} />
      {page === "home" && <HomePage setPage={setPage} setSelectedEvent={handleSelectEvent} />}
      {page === "events" && <EventsPage setPage={setPage} setSelectedEvent={handleSelectEvent} />}
      {page === "event-detail" && (
        <EventDetailPage event={selectedEvent} setPage={setPage} setSelectedTicketEvent={handleSelectEvent} />
      )}
      {page === "ticket-select" && (
        <TicketSelectPage event={selectedEvent} setPage={setPage} selectedQty={selectedQty} setSelectedQty={setSelectedQty} />
      )}
      {page === "checkout" && (
        <CheckoutPage event={selectedEvent} setPage={setPage} selectedQty={selectedQty} onConfirm={handleConfirm} />
      )}
      {page === "confirmation" && confirmationData && (
        <OrderConfirmationPage data={confirmationData} setPage={setPage} />
      )}
      {page === "my-tickets" && <MyTicketsPage setPage={setPage} setSelectedTicket={setSelectedTicket} />}
      {page === "ticket-detail" && <TicketDetailPage ticket={selectedTicket} setPage={setPage} />}
      {page === "my-orders" && <MyOrdersPage setPage={setPage} />}
      {page === "profile" && <ProfilePage />}
      {page === "support" && <SupportPage />}
      {page === "login" && <LoginPage setPage={setPage} />}
      {page === "register" && <RegisterPage setPage={setPage} />}
      {page === "email-verify" && <EmailVerifyPage setPage={setPage} />}
      {page === "forgot-pw" && <ForgotPasswordPage setPage={setPage} />}
      {page === "reset-pw" && <ResetPasswordPage setPage={setPage} />}
    </div>
  );
}
