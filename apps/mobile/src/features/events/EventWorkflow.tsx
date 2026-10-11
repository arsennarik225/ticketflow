import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, BackHandler } from 'react-native';
import { AssignedEvent, createCheckinApi } from '../../api/checkin';
import { ApiError } from '../../api/errors';
import { User } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { AssignedEventsScreen } from '../../screens/AssignedEventsScreen';
import { EventDashboardScreen } from '../../screens/EventDashboardScreen';
import { useRemoteResource } from './useRemoteResource';

const ACCESS_LOST = 'This event is no longer available in your assigned events. Choose another event or contact your event administrator.';

export function EventWorkflow({ user }: { user: User }) {
  const { session } = useAuth();
  const api = useMemo(() => createCheckinApi(session), [session]);
  const events = useRemoteResource(api.getAssignedEvents);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const refreshEvents = events.refresh;
  const forbidden = events.error instanceof ApiError && events.error.status === 403;
  const selected = forbidden ? undefined : events.data?.data.find((event) => event.id === selectedId);
  // A denied list must stay empty until a fresh successful response authorizes its rows again.
  const refreshAssignments = useCallback(() => { void refreshEvents(forbidden); }, [refreshEvents, forbidden]);
  const loadAttendance = useCallback(() => {
    if (!selectedId) throw new Error('An event must be selected before loading attendance.');
    return api.getAttendance(selectedId);
  }, [api, selectedId]);
  const back = useCallback(() => {
    setSelectedId(null);
    refreshAssignments();
  }, [refreshAssignments]);
  const accessLost = useCallback(() => {
    setSelectedId(null);
    setMessage(ACCESS_LOST);
    // Discard the old list immediately; an inaccessible row must not remain selectable while reloading.
    void refreshEvents(true);
  }, [refreshEvents]);

  useEffect(() => {
    if (selectedId && (forbidden || events.data && !selected)) {
      setSelectedId(null);
      setMessage(ACCESS_LOST);
    }
  }, [selectedId, selected, forbidden, events.data]);

  useEffect(() => {
    if (!selectedId) return;
    // The totals endpoint also permits ownership. Revalidate explicit assignments separately,
    // including when an organizer retains totals access after their staff assignment is removed.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') refreshAssignments();
    }, 30_000);
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
    return () => { clearInterval(timer); backHandler.remove(); };
  }, [selectedId, refreshAssignments, back]);

  const select = (event: AssignedEvent) => {
    setMessage(null);
    setSelectedId(event.id);
    refreshAssignments();
  };
  const signOut = () => { void session.signOut(); };

  if (selected) return <EventDashboardScreen key={selected.id} event={selected}
    loadAttendance={loadAttendance} assignmentError={events.error} onRefreshAssignments={refreshAssignments}
    onAccessLost={accessLost} onBack={back} onSignOut={signOut} />;
  return <AssignedEventsScreen email={user.email} events={events.data} loading={events.loading}
    error={events.error} message={message} onRefresh={refreshAssignments} onSelect={select} onSignOut={signOut} />;
}
