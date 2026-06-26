import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { buildManualSession } from './sessionLog';
import type { CalendarEvent, Habit, HabitGroup, RestDay, Session, Settings, Task, TaskAttachment, TimerPreset, VacationDay } from './types';

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

/**
 * Log a habit by hand (no timer): POST a completed session, refresh today's
 * stats. `note` records what was done; `endedAt` back-dates the log (defaults to
 * now) so a forgotten day can be filled in.
 */
export function useLogSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ habitId, minutes, note, endedAt }: { habitId: string; minutes: number; note?: string | null; endedAt?: number }) =>
      api.post('/sessions', buildManualSession(habitId, minutes, endedAt ?? Date.now(), note ?? null)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
}

/** Delete one session by id (used to un-mark an abstinence day). */
export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
}

/* ---- rest days (whole-day streak skips) ---- */
export const useRestDays = () => useQuery({ queryKey: ['rest-days'], queryFn: () => api.get<RestDay[]>('/rest-days') });

/** Toggle a date's rest-day status: POST to skip it, DELETE to un-skip it. */
export function useToggleRestDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, on }: { date: string; on: boolean }) =>
      on ? api.post('/rest-days', { date }) : api.del(`/rest-days/${date}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rest-days'] }),
  });
}

/** Mark or clear an inclusive date range as rest days (bulk). */
export function useSetRestRange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ start, end, on }: { start: string; end: string; on: boolean }) =>
      on ? api.post('/rest-days/range', { start, end }) : api.del('/rest-days/range', { start, end }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rest-days'] }),
  });
}

/* ---- vacation days (whole-day lighter goal) ---- */
export const useVacationDays = () => useQuery({ queryKey: ['vacation-days'], queryFn: () => api.get<VacationDay[]>('/vacation-days') });

/** Toggle a date's vacation status: POST to mark it, DELETE to clear it. */
export function useToggleVacationDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, on }: { date: string; on: boolean }) =>
      on ? api.post('/vacation-days', { date }) : api.del(`/vacation-days/${date}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vacation-days'] }),
  });
}

/** Mark or clear an inclusive date range as vacation (bulk). */
export function useSetVacationRange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ start, end, on }: { start: string; end: string; on: boolean }) =>
      on ? api.post('/vacation-days/range', { start, end }) : api.del('/vacation-days/range', { start, end }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vacation-days'] }),
  });
}

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

/* ---- tasks ---- */
export const useTasks = () => useQuery({ queryKey: ['tasks'], queryFn: () => api.get<Task[]>('/tasks') });

export function useSaveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (t: Partial<Task> & { id?: string }) =>
      t.id ? api.patch<Task>(`/tasks/${t.id}`, t) : api.post<Task>('/tasks', t),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

/* ---- task attachments (pasted images) ---- */
export const useTaskAttachments = (taskId: string) =>
  useQuery({
    queryKey: ['task-attachments', taskId],
    queryFn: () => api.get<TaskAttachment[]>(`/tasks/${taskId}/attachments`),
  });

export function useUploadAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { taskId: string; dataUrl: string; width: number; height: number }) =>
      api.post<TaskAttachment>(`/tasks/${v.taskId}/attachments`, { dataUrl: v.dataUrl, width: v.width, height: v.height }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['task-attachments', v.taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; taskId: string }) => api.del(`/attachments/${v.id}`),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['task-attachments', v.taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

/* ---- calendar (read-only Google events) ---- */
export function useCalendarEvents(from: string, to: string) {
  return useQuery({
    queryKey: ['calendar-events', from, to],
    queryFn: () => api.get<{ configured: boolean; events: CalendarEvent[] }>(`/calendar/events?from=${from}&to=${to}`),
    select: (d) => d.events,
    staleTime: 5 * 60 * 1000,
    retry: false, // unconfigured/unreachable calendar should fail quietly, not retry-spam
  });
}

/** Optimistic done-toggle: flips the row immediately, rolls back on error. */
export function useToggleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => api.patch<Task>(`/tasks/${id}`, { done }),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      const prev = qc.getQueryData<Task[]>(['tasks']);
      qc.setQueryData<Task[]>(['tasks'], (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, done, completedAt: done ? Date.now() : null } : t)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tasks'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
