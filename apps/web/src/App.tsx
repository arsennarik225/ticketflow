import { useEffect, useState } from "react";
import { LangProvider } from "./LangContext";
import { AuthProvider, useAuth } from "./api/auth";
import AttendeePortal from "./AttendeePortal";
import OrganizerPortal from "./OrganizerPortal";
import AdminPortal from "./AdminPortal";
import MobileApp from "./MobileApp";
import type { Role } from "./data";

function RoleRouter() {
  const { user, loading } = useAuth();
  const [role, setRole] = useState<Role>("attendee");

  // Once the session restores, default to the signed-in user's real role.
  // `setRole` stays available below for now (e.g. previewing other portals
  // during development); each portal should eventually be gated by its own
  // route + required role instead of this single switch.
  useEffect(() => {
    if (user) setRole(user.role as Role);
  }, [user]);

  if (loading) {
    // TODO: swap for a real splash/skeleton once one exists.
    return null;
  }

  return (
    <>
      {role === "attendee" && <AttendeePortal role={role} setRole={(r) => setRole(r as Role)} />}
      {role === "organizer" && <OrganizerPortal role={role} setRole={(r) => setRole(r as Role)} />}
      {role === "admin" && <AdminPortal role={role} setRole={(r) => setRole(r as Role)} />}
      {role === "mobile" && <MobileApp role={role} setRole={(r) => setRole(r as Role)} />}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LangProvider>
        <RoleRouter />
      </LangProvider>
    </AuthProvider>
  );
}
