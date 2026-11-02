"use client";

import { useEffect, useRef, type ReactNode } from "react";

type SheetProps = {
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
};

export function Sheet({ open, label, onClose, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      className="sheet mx-auto mt-auto mb-0 w-full max-w-lg rounded-t-2xl bg-surface p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-foreground"
    >
      {children}
    </dialog>
  );
}
