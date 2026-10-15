import { useState } from "react";
import { LangProvider } from "./LangContext";
import AttendeePortal from "./AttendeePortal";
import OrganizerPortal from "./OrganizerPortal";
import AdminPortal from "./AdminPortal";
import MobileApp from "./MobileApp";
import type { Role } from "./data";

export default function App() {
  const [role, setRole] = useState<Role>("attendee");

  return (
    <LangProvider>
      {role === "attendee" && <AttendeePortal role={role} setRole={r => setRole(r as Role)} />}
      {role === "organizer" && <OrganizerPortal role={role} setRole={r => setRole(r as Role)} />}
      {role === "admin" && <AdminPortal role={role} setRole={r => setRole(r as Role)} />}
      {role === "mobile" && <MobileApp role={role} setRole={r => setRole(r as Role)} />}
    </LangProvider>
  );
}
