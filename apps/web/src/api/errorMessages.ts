// src/api/errorMessages.ts
//
// Maps backend error codes to translated, user-facing copy, per README.md:
// "branch on error.code and show your own translated text — error.message
// is only an English fallback." Full code list: docs/api/error-codes.md.
//
// This file only has the codes implied by flows we've already touched
// (auth, checkout, promo codes, seating). Extend it against the real list
// as each new screen is wired up — translateError() falls back to a generic
// message for anything not yet mapped, so nothing breaks in the meantime.

import type { Language } from "./client";

type Dict = Record<string, Record<Language, string>>;

export const ERROR_MESSAGES: Dict = {
  invalid_credentials: {
    kk: "Email немесе құпия сөз қате.",
    ru: "Неверный email или пароль.",
    en: "That email or password is incorrect.",
  },
  email_not_verified: {
    kk: "Алдымен email мекенжайыңызды растаңыз.",
    ru: "Сначала подтвердите свой email.",
    en: "Please verify your email first.",
  },
  email_already_registered: {
    kk: "Бұл email бұрыннан тіркелген.",
    ru: "Этот email уже зарегистрирован.",
    en: "That email is already registered.",
  },
  token_invalid: {
    kk: "Сілтеме жарамсыз.",
    ru: "Ссылка недействительна.",
    en: "This link isn't valid.",
  },
  token_expired: {
    kk: "Сілтеменің мерзімі өтіп кетті. Қайта сұраңыз.",
    ru: "Срок действия ссылки истёк. Запросите новую.",
    en: "This link has expired. Request a new one.",
  },
  checkout_session_expired: {
    kk: "Билеттерді ұстап тұру уақыты аяқталды. Қайта бастаңыз.",
    ru: "Время удержания билетов истекло. Начните заново.",
    en: "Your ticket hold expired. Please start again.",
  },
  seat_taken: {
    kk: "Бұл орынды жаңа ғана алды. Басқа орын таңдаңыз.",
    ru: "Это место только что забронировали. Выберите другое.",
    en: "That seat was just taken. Please choose another.",
  },
  sold_out: {
    kk: "Билеттер таусылды.",
    ru: "Билеты распроданы.",
    en: "These tickets are sold out.",
  },
  promo_code_invalid: {
    kk: "Промокод жарамсыз немесе мерзімі өткен.",
    ru: "Промокод недействителен или истёк.",
    en: "This promo code isn't valid or has expired.",
  },
  promo_code_exhausted: {
    kk: "Промокодтың лимиті таусылды.",
    ru: "Лимит использования промокода исчерпан.",
    en: "This promo code has reached its redemption limit.",
  },
  payment_declined: {
    kk: "Төлем өтпеді. Басқа карта көрсетіп көріңіз.",
    ru: "Платёж отклонён. Попробуйте другую карту.",
    en: "Payment was declined. Try a different card.",
  },
  insufficient_funds: {
    kk: "Картада қаражат жеткіліксіз.",
    ru: "Недостаточно средств на карте.",
    en: "Insufficient funds on that card.",
  },
};

const FALLBACK: Record<Language, string> = {
  kk: "Бір қателік орын алды. Әрекетті қайталап көріңіз.",
  ru: "Произошла ошибка. Попробуйте ещё раз.",
  en: "Something went wrong. Please try again.",
};

export function translateError(code: string, lang: Language): string {
  return ERROR_MESSAGES[code]?.[lang] ?? FALLBACK[lang];
}
