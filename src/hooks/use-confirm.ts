"use client";

/**
 * Simple confirm dialog wrapper.
 * Uses native window.confirm for now — can be swapped with a styled modal later.
 */
export function useConfirm() {
  return {
    confirm: (message: string): boolean => {
      return window.confirm(message);
    },
  };
}
