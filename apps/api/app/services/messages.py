"""Every text a customer receives from the backend (emails and PDF tickets), in Kazakh,
Russian, and English (SRS §7). Placeholders use str.format names. To change wording or
add a language, edit only this file.

Error messages in API responses stay English: clients translate them by `error.code`.
"""

LANGUAGES = ("kk", "ru", "en")
DEFAULT_LANGUAGE = "ru"

EMAILS = {
    "verify_email": {
        "kk": ("BiletFlow email мекенжайын растаңыз",
               "Сәлеметсіз бе, {name}!\n\nЭлектрондық пошта мекенжайыңызды растаңыз:\n{link}\n\n"
               "Сілтеме 48 сағат жарамды."),
        "ru": ("Подтвердите email в BiletFlow",
               "Здравствуйте, {name}!\n\nПодтвердите адрес электронной почты:\n{link}\n\n"
               "Ссылка действует 48 часов."),
        "en": ("Confirm your BiletFlow email",
               "Hi {name},\n\nConfirm your email address:\n{link}\n\nThe link is valid for 48 hours."),
    },
    "password_reset": {
        "kk": ("BiletFlow құпиясөзін қалпына келтіру",
               "Сәлеметсіз бе, {name}!\n\nЖаңа құпиясөзді мына сілтеме арқылы орнатыңыз:\n{link}\n\n"
               "Сілтеме 1 сағат жарамды. Егер мұны сіз сұрамаған болсаңыз, хатты елемеңіз."),
        "ru": ("Сброс пароля BiletFlow",
               "Здравствуйте, {name}!\n\nЗадайте новый пароль по ссылке:\n{link}\n\n"
               "Ссылка действует 1 час. Если вы не запрашивали сброс, просто проигнорируйте письмо."),
        "en": ("Reset your BiletFlow password",
               "Hi {name},\n\nSet a new password here:\n{link}\n\n"
               "The link is valid for 1 hour. If you did not ask for this, ignore this email."),
    },
    "order_confirmed": {
        "kk": ("Сіздің билеттеріңіз: {event}",
               "{order} тапсырысы расталды.\n\n{event}\n{when}\n{venue}\n\n"
               "Билеттер (PDF тіркелген: басып шығарыңыз немесе телефоннан көрсетіңіз):\n{tickets}\n\n"
               "{payment}\n\nКүнтізбеге қосу: {calendar}\nТапсырыс: {link}"),
        "ru": ("Ваши билеты: {event}",
               "Заказ {order} подтверждён.\n\n{event}\n{when}\n{venue}\n\n"
               "Билеты (PDF во вложении: распечатайте или покажите на телефоне):\n{tickets}\n\n"
               "{payment}\n\nДобавить в календарь: {calendar}\nЗаказ: {link}"),
        "en": ("Your tickets: {event}",
               "Order {order} is confirmed.\n\n{event}\n{when}\n{venue}\n\n"
               "Tickets (PDFs attached: print them or show them on your phone):\n{tickets}\n\n"
               "{payment}\n\nAdd to calendar: {calendar}\nOrder: {link}"),
    },
    "payment_failed": {
        "kk": ("Төлем өтпеді: {event}",
               "«{event}» үшін төлем өтпеді: {reason}\nБилеттер берілген жоқ. "
               "Билеттер брондалып тұрғанда қайталап көруге болады."),
        "ru": ("Оплата не прошла: {event}",
               "Оплата за «{event}» не прошла: {reason}\nБилеты не выпущены. "
               "Можно попробовать снова, пока билеты забронированы."),
        "en": ("Payment failed: {event}",
               "Your payment for {event} did not go through: {reason}\nNo tickets were issued. "
               "You can try again while your tickets are still held."),
    },
    "order_refunded": {
        "kk": ("Қайтарым орындалды: {event}",
               "{order} тапсырысы бойынша толық қайтарым жасалды: {amount} (демонстрациялық қайтарым, "
               "нақты ақша аударылған жоқ).\nСебебі: {reason}\nБұл тапсырыстағы билеттер енді жарамсыз."),
        "ru": ("Возврат выполнен: {event}",
               "По заказу {order} выполнен полный возврат: {amount} (демонстрационный возврат, "
               "реальные деньги не перемещались).\nПричина: {reason}\nБилеты из этого заказа больше не действуют."),
        "en": ("Refund completed: {event}",
               "Order {order} was refunded in full: {amount} (demonstration refund, no real money moved).\n"
               "Reason: {reason}\nThe tickets in this order are no longer valid."),
    },
    "order_cancelled": {
        "kk": ("Тіркеу тоқтатылды: {event}",
               "Ұйымдастырушы сіздің {order} тіркеуіңізді тоқтатты.\nСебебі: {reason}\n"
               "Бұл тапсырыстағы билеттер енді жарамсыз."),
        "ru": ("Регистрация отменена: {event}",
               "Организатор отменил вашу регистрацию {order}.\nПричина: {reason}\n"
               "Билеты из этого заказа больше не действуют."),
        "en": ("Registration cancelled: {event}",
               "Your registration {order} was cancelled by the organizer.\nReason: {reason}\n"
               "The tickets in this order are no longer valid."),
    },
    "event_updated": {
        "kk": ("Іс-шарадағы өзгерістер: {event}",
               "«{event}» өтетін күні, уақыты немесе орны өзгерді.\n\nЕнді: {when}\n{venue}\n\n"
               "Билеттеріңіз жарамды болып қалады.\n{link}"),
        "ru": ("Изменения в событии: {event}",
               "Изменились дата, время или место проведения «{event}».\n\nТеперь: {when}\n{venue}\n\n"
               "Ваши билеты остаются действительными.\n{link}"),
        "en": ("Event update: {event}",
               "The date, time, or venue of {event} has changed.\n\nNow: {when}\n{venue}\n\n"
               "Your tickets stay valid.\n{link}"),
    },
    "event_cancelled": {
        "kk": ("Іс-шара тоқтатылды: {event}",
               "«{event}» ({when}) тоқтатылды.\nСебебі: {reason}{policy}\n"
               "Қаражатты қайтаруды ұйымдастырушы жүргізеді."),
        "ru": ("Событие отменено: {event}",
               "«{event}» ({when}) отменено.\nПричина: {reason}{policy}\nВозвратом средств займётся организатор."),
        "en": ("Cancelled: {event}",
               "{event} ({when}) was cancelled.\nReason: {reason}{policy}\nThe organizer will handle refunds."),
    },
    "payout_status": {
        "kk": ("Төлем шоты қосылды",
               "{account} төлем шоты қосылды (тек демонстрация: BiletFlow нақты ақша аудармайды). "
               "Енді әр іс-шара үшін ақылы сатылымды іске қосуға болады."),
        "ru": ("Счёт для выплат подключён",
               "Счёт для выплат {account} подключён (только демонстрация: BiletFlow не переводит реальные "
               "деньги). Теперь можно активировать платные продажи для каждого события."),
        "en": ("Payout account connected",
               "Your payout account {account} is connected (demonstration only: BiletFlow does not move "
               "real money). You can now activate paid sales for each event."),
    },
    "event_suspended": {
        "kk": ("Іс-шара уақытша тоқтатылды: {event}",
               "BiletFlow «{event}» іс-шарасын уақытша тоқтатты. Сатылым тоқтатылды.\nСебебі: {reason}"),
        "ru": ("Событие приостановлено: {event}",
               "BiletFlow приостановил «{event}». Продажи остановлены.\nПричина: {reason}"),
        "en": ("Event suspended: {event}",
               "BiletFlow suspended {event}. Sales are stopped.\nReason: {reason}"),
    },
    "paid_sales_suspended": {
        "kk": ("Ақылы сатылым тоқтатылды: {event}",
               "BiletFlow «{event}» ақылы билеттерін сатуды уақытша тоқтатты. "
               "Тегін билеттерге бұл әсер етпейді.\nСебебі: {reason}"),
        "ru": ("Платные продажи приостановлены: {event}",
               "BiletFlow приостановил продажу платных билетов на «{event}». "
               "Бесплатные билеты это не затрагивает.\nПричина: {reason}"),
        "en": ("Paid sales suspended: {event}",
               "BiletFlow suspended paid ticket sales for {event}. Free tickets are not affected.\n"
               "Reason: {reason}"),
    },
    "support_new_case": {
        "kk": ("Қолдау: {subject}", "{name} жаңа өтініш жіберді:\n\n{message}\n\nӨтінішті ашу: {link}"),
        "ru": ("Поддержка: {subject}", "Новое обращение от {name}:\n\n{message}\n\nОткрыть обращение: {link}"),
        "en": ("Support: {subject}", "New support case from {name}:\n\n{message}\n\nOpen the case: {link}"),
    },
    "support_reply": {
        "kk": ("Қолдау: {subject}", "{name} жазды:\n\n{message}\n\nӨтінішті ашу: {link}"),
        "ru": ("Поддержка: {subject}", "{name} пишет:\n\n{message}\n\nОткрыть обращение: {link}"),
        "en": ("Support: {subject}", "{name} wrote:\n\n{message}\n\nOpen the case: {link}"),
    },
    "support_status": {
        "kk": ("Қолдау: {subject}", "Өтінішіңіздің мәртебесі: {status}.\n\nӨтінішті ашу: {link}"),
        "ru": ("Поддержка: {subject}", "Статус вашего обращения: {status}.\n\nОткрыть обращение: {link}"),
        "en": ("Support: {subject}", "Your support case is now {status}.\n\nOpen the case: {link}"),
    },
    "support_assigned": {
        "kk": ("Қолдау: {subject}", "Сізге өтініш тағайындалды.\n\nӨтінішті ашу: {link}"),
        "ru": ("Поддержка: {subject}", "Вам назначено обращение.\n\nОткрыть обращение: {link}"),
        "en": ("Support: {subject}", "A support case was assigned to you.\n\nOpen the case: {link}"),
    },
    "support_escalated": {
        "kk": ("BiletFlow қолдауына берілді: {subject}",
               "{name} өтінішті BiletFlow қолдау қызметіне берді.\n\nӨтінішті ашу: {link}"),
        "ru": ("Передано в поддержку BiletFlow: {subject}",
               "{name} передал(а) обращение в поддержку BiletFlow.\n\nОткрыть обращение: {link}"),
        "en": ("Escalated to BiletFlow support: {subject}",
               "{name} escalated this case to BiletFlow support.\n\nOpen the case: {link}"),
    },
}

PHRASES = {
    "paid": {"kk": "Төленді: {total} (демонстрациялық төлем, нақты ақша алынған жоқ)",
             "ru": "Оплачено: {total} (демонстрационный платёж, реальные деньги не списаны)",
             "en": "Total paid: {total} (demonstration payment, no real money was charged)"},
    "free": {"kk": "Тегін тіркелу", "ru": "Бесплатная регистрация", "en": "Free registration"},
    "refund_policy": {"kk": "\nҚайтару ережесі: {policy}", "ru": "\nПравила возврата: {policy}",
                      "en": "\nRefund policy: {policy}"},
    "payment_declined": {"kk": "төлем қабылданбады (демонстрация)", "ru": "платёж отклонён (демонстрация)",
                         "en": "the payment was declined (simulated)"},
    "insufficient_funds": {"kk": "қаражат жеткіліксіз (демонстрация)", "ru": "недостаточно средств (демонстрация)",
                           "en": "insufficient funds (simulated)"},
    "open": {"kk": "ашық", "ru": "открыто", "en": "open"},
    "in_progress": {"kk": "жұмыста", "ru": "в работе", "en": "in progress"},
    "waiting_for_customer": {"kk": "жауабыңызды күтуде", "ru": "ожидает вашего ответа",
                             "en": "waiting for your reply"},
    "resolved": {"kk": "шешілді", "ru": "решено", "en": "resolved"},
    "seat": {"kk": "{section}, {row}-қатар, {number}-орын", "ru": "{section}, ряд {row}, место {number}",
             "en": "{section}, row {row}, seat {number}"},
    "accessible": {"kk": "мүмкіндігі шектеулі қонақтарға арналған орын",
                   "ru": "место для маломобильных гостей", "en": "wheelchair-accessible seat"},
}

PDF_LABELS = {
    "kk": {"title": "Кіру билеті", "starts": "Басталуы", "ends": "Аяқталуы", "venue": "Өтетін орны",
           "type": "Билет түрі", "attendee": "Қатысушы", "seat": "Орын",
           "note": "Бір билет бір адамның бір рет кіруіне арналған. Басып шығарылған билет пен "
                   "аккаунтыңыздағы билет — бір билет. Төлем деректері ешқашан басылмайды."},
    "ru": {"title": "Входной билет", "starts": "Начало", "ends": "Окончание", "venue": "Место проведения",
           "type": "Тип билета", "attendee": "Посетитель", "seat": "Место",
           "note": "Один билет — один вход для одного человека. Эта распечатка и билет в вашем аккаунте — "
                   "один и тот же билет. Платёжные данные никогда не печатаются."},
    "en": {"title": "Admission ticket", "starts": "Starts", "ends": "Ends", "venue": "Venue",
           "type": "Ticket type", "attendee": "Attendee", "seat": "Seat",
           "note": "One ticket admits one person once. This printout and the ticket in your account are "
                   "the same ticket. Payment details are never printed."},
}


def _language(language: str | None) -> str:
    return language if language in LANGUAGES else DEFAULT_LANGUAGE


def email(kind: str, language: str | None, **values) -> tuple[str, str]:
    subject, body = EMAILS[kind][_language(language)]
    return subject.format(**values), body.format(**values)


def phrase(key: str, language: str | None, **values) -> str:
    return PHRASES[key][_language(language)].format(**values)


def pdf_labels(language: str | None) -> dict:
    return PDF_LABELS[_language(language)]
