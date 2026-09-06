"use client";

import { sileo } from "sileo";

/**
 * Thin wrapper over sileo (CLAUDE.md §3: non-blocking feedback).
 *
 * Why wrap it at all: sileo's raw API takes an options object per call, so
 * without a wrapper every call site would repeat the same shape and drift.
 * This also gives us one place to change position/duration policy later, and
 * one seam to swap the library if it ever comes to that.
 *
 * Use these for anything the user does NOT have to acknowledge. For an
 * irreversible action, use confirmAction() from ./confirm instead.
 */

type ToastInput = {
  title: string;
  description?: string;
  /** Milliseconds; `null` keeps the toast until dismissed. */
  duration?: number | null;
};

export const toast = {
  success: ({ title, description, duration }: ToastInput) =>
    sileo.success({ title, description, duration }),

  error: ({ title, description, duration }: ToastInput) =>
    // Errors linger a little longer — the user may need to read the reason.
    sileo.error({ title, description, duration: duration ?? 6000 }),

  warning: ({ title, description, duration }: ToastInput) =>
    sileo.warning({ title, description, duration }),

  info: ({ title, description, duration }: ToastInput) =>
    sileo.info({ title, description, duration }),

  /**
   * Drives a toast through loading -> success/error from a promise. The
   * intended shape for async mutations such as booking creation.
   */
  promise: <T>(
    promise: Promise<T> | (() => Promise<T>),
    messages: {
      loading: ToastInput;
      success: ToastInput | ((data: T) => ToastInput);
      error: ToastInput;
    },
  ) =>
    sileo.promise(promise, {
      loading: messages.loading,
      success: (data: T) =>
        typeof messages.success === "function" ? messages.success(data) : messages.success,
      error: messages.error,
    }),

  dismiss: (id: string) => sileo.dismiss(id),
};
