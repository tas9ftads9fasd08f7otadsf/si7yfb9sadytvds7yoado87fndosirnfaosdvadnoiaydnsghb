"use client";

import { type ReactNode, useEffect, useRef } from "react";

/** 152 A window over the page as the plan's §8.6 asks: a `<dialog>` opened modal, focus kept inside. */
export function Modal({ labelledBy, onClose, children }: { labelledBy: string; onClose: () => void; children: ReactNode }) {
  const frame = useRef<HTMLDialogElement>(null);
  const closing = useRef(onClose);
  closing.current = onClose;
  useEffect(() => {
    const dialog = frame.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // jsdom has no showModal; there the window is only open, which is all a unit test reads.
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    if (!dialog.contains(document.activeElement)) dialog.querySelector<HTMLElement>("input, button, select, textarea")?.focus();
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog ref={frame} className="modal-frame" aria-labelledby={labelledBy}
      onCancel={(event) => { event.preventDefault(); closing.current(); }}
      onPointerDown={(event) => { if (event.target === event.currentTarget) closing.current(); }}>
      {children}
    </dialog>
  );
}
