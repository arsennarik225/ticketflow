import { createContext, useContext, useState, type ReactNode } from "react";
import { type Lang, t as translate, LANG_LABELS } from "./i18n";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const Ctx = createContext<LangCtx>({ lang: "kz", setLang: () => {}, t: (k) => k });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("kz");
  const t = (key: string) => translate(key, lang);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}

export function LangSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  const langs: Lang[] = ["kz", "ru", "en"];
  return (
    <div className={`flex items-center gap-0.5 text-xs font-semibold ${className}`}>
      {langs.map((l, i) => (
        <span key={l} className="flex items-center gap-0.5">
          {i > 0 && <span style={{ color: "var(--text3)" }}>|</span>}
          <button
            onClick={() => setLang(l)}
            className="px-1.5 py-0.5 rounded transition-colors"
            style={{
              color: lang === l ? "var(--primary)" : "var(--text3)",
              fontWeight: lang === l ? 700 : 500,
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            {LANG_LABELS[l]}
          </button>
        </span>
      ))}
    </div>
  );
}
