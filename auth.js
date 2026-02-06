// auth.js — Supabase authentication wrapper
// All functions return {data, error} and never throw to the UI.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Initialize the Supabase client once at module load
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Create a new account with email and password.
 * The user will receive a confirmation email by default (Supabase setting).
 */
export async function signUp(email, password) {
  console.log('[auth] signUp called for:', email);
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) {
    console.log('[auth] signUp error:', error.message);
  } else {
    console.log('[auth] signUp success — user id:', data.user?.id);
  }
  return { data, error };
}

/**
 * Sign in an existing user with email and password.
 */
export async function signIn(email, password) {
  console.log('[auth] signIn called for:', email);
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    console.log('[auth] signIn error:', error.message);
  } else {
    console.log('[auth] signIn success — user id:', data.user?.id);
  }
  return { data, error };
}

/**
 * Sign out the current user and clear the session.
 */
export async function signOut() {
  console.log('[auth] signOut called');
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    console.log('[auth] signOut error:', error.message);
  } else {
    console.log('[auth] signOut success');
  }
  return { data: null, error };
}

/**
 * Get the currently authenticated user, or null if not signed in.
 */
export async function getCurrentUser() {
  console.log('[auth] getCurrentUser called');
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) {
    console.log('[auth] getCurrentUser error:', error.message);
    return null;
  }
  console.log('[auth] getCurrentUser — user id:', data.user?.id ?? 'none');
  return data.user ?? null;
}

/**
 * Subscribe to auth state changes (sign-in, sign-out, token refresh, etc.).
 * Returns the subscription object so the caller can unsubscribe later if needed.
 */
export function onAuthStateChange(callback) {
  console.log('[auth] onAuthStateChange listener registered');
  const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
    (event, session) => {
      console.log('[auth] auth state changed — event:', event);
      callback(event, session);
    }
  );
  return subscription;
}
