import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { EventType, RunEvent } from './balance';

const STORAGE_KEY = 'run-for-it:events';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** AsyncStorage-backed event log: loads once, then persists every change. */
export function useEventLog() {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!isMounted) return;
      if (raw) setEvents(JSON.parse(raw));
      setIsLoaded(true);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isLoaded) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(events)).catch(() => {});
    }
  }, [events, isLoaded]);

  const addEvent = useCallback((type: EventType, km: number) => {
    setEvents((prev) => [...prev, { id: generateId(), type, km, timestamp: Date.now() }]);
  }, []);

  const deleteEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((event) => event.id !== id));
  }, []);

  const undoLast = useCallback(() => {
    setEvents((prev) => prev.slice(0, -1));
  }, []);

  return { events, isLoaded, addEvent, deleteEvent, undoLast };
}
