import { api } from './api.js';

export const state = {
  me: null,
  settings: null,
  currentMonth: null,
  viewMonth: null,
  meta: null,
  lastSaved: null,
  saving: false
};

const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn(state));

export function setSaving(on) { state.saving = on; emit(); }
export function markSaved(at) { state.saving = false; state.lastSaved = at || new Date().toISOString(); emit(); }

export async function loadSession() {
  const data = await api.get('/auth/me');
  state.me = data.user;
  state.settings = data.settings;
  state.currentMonth = data.current_month;
  if (!state.viewMonth) state.viewMonth = data.current_month;
  if (!state.meta) state.meta = await api.get('/meta');
  emit();
  return state;
}

export function clearSession() {
  state.me = null;
  state.settings = null;
  state.viewMonth = null;
  emit();
}

export function setViewMonth(month) { state.viewMonth = month; emit(); }

/* Wraps a mutation so every write updates the shared "last saved" indicator. */
export async function saving(fn) {
  setSaving(true);
  try {
    const result = await fn();
    markSaved(result && result.saved_at);
    return result;
  } catch (err) {
    setSaving(false);
    throw err;
  }
}

export const isOwner = () => !!state.me && state.me.role === 'owner';
export const combinedOn = () => !!state.settings && state.settings.conversion_enabled;
