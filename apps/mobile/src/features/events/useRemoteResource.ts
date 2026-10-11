import { useCallback, useEffect, useRef, useState } from 'react';

interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: unknown;
}

// Feature-local reads share refresh behavior, but each resource owns its data and request lifetime.
export function useRemoteResource<T>(load: () => Promise<T>) {
  const [state, setState] = useState<ResourceState<T>>({ data: null, loading: true, error: null });
  const generation = useRef(0);
  const refresh = useCallback(async (clearData = false) => {
    const request = ++generation.current;
    setState((previous) => ({ data: clearData ? null : previous.data, loading: true, error: null }));
    try {
      const data = await load();
      if (request === generation.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (request === generation.current) {
        setState((previous) => ({ ...previous, loading: false, error: error ?? new Error('Request failed') }));
      }
    }
  }, [load]);

  useEffect(() => {
    void refresh(true);
    // Switching resources or leaving protected screens invalidates every outstanding result.
    return () => { generation.current++; };
  }, [refresh]);

  return { ...state, refresh };
}
