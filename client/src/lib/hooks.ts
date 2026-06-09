import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Habit, HabitGroup, Session, Settings, TimerPreset } from './types';

export interface Me {
  user: { id: string; email: string } | null;
}

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/auth/me'), staleTime: Infinity });
export const useHabits = () => useQuery({ queryKey: ['habits'], queryFn: () => api.get<Habit[]>('/habits') });
export const useGroups = () => useQuery({ queryKey: ['groups'], queryFn: () => api.get<HabitGroup[]>('/habit-groups') });
export const useTimers = () => useQuery({ queryKey: ['timers'], queryFn: () => api.get<TimerPreset[]>('/timers') });
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/settings') });
export const useSessions = () =>
  useQuery({ queryKey: ['sessions'], queryFn: () => api.get<Session[]>('/sessions') });

export function useInvalidate(key: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [key] });
}

/* ---- habits ---- */
export function useSaveHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (h: Partial<Habit> & { id?: string }) =>
      h.id ? api.patch<Habit>(`/habits/${h.id}`, h) : api.post<Habit>('/habits', h),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['habits'] }),
  });
}
export function useDeleteHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/habits/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['habits'] }),
  });
}

/* ---- groups ---- */
export function useSaveGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (g: Partial<HabitGroup> & { id?: string }) =>
      g.id ? api.patch<HabitGroup>(`/habit-groups/${g.id}`, g) : api.post<HabitGroup>('/habit-groups', g),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });
}
export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/habit-groups/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['habits'] });
    },
  });
}

/* ---- timers ---- */
export function useSaveTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (t: Partial<TimerPreset> & { id?: string }) =>
      t.id ? api.patch<TimerPreset>(`/timers/${t.id}`, t) : api.post<TimerPreset>('/timers', t),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timers'] }),
  });
}
export function useDeleteTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/timers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timers'] }),
  });
}

/* ---- settings ---- */
export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: Partial<Settings>) => api.patch<Settings>('/settings', s),
    onSuccess: (data) => qc.setQueryData(['settings'], data),
  });
}
