'use client';
// Ortak pencere (F2.13b; Müfettiş 17 #59 L1–L2). Kurallar:
// - `document.body`'ye portal (kartın `backdrop-blur`u sabit konumlu çocuğu kırpmasın).
// - Açılışta odak BİR KEZ verilir: `data-autofocus` öğesi, yoksa ilk odaklanabilir öğe. `onClose`
//   ref'te tutulur; üst bileşen yeniden çizilince odak sıçramaz (L1).
// - Tab / Shift+Tab pencerede döner; Esc ve arka plan kapatır; kapanınca odak açan öğeye döner (L2).
import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FOCUSABLE, wrapFocus } from './focus-trap';

export function Dialog({
  labelledBy,
  describedBy,
  onClose,
  children,
  tone = 'default',
}: {
  labelledBy: string;
  describedBy?: string;
  onClose: () => void;
  children: ReactNode;
  tone?: 'default' | 'danger';
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = panel.current;
    const first =
      root?.querySelector<HTMLElement>('[data-autofocus]') ??
      root?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close.current();
        return;
      }
      if (event.key !== 'Tab' || root === null) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      const active = document.activeElement;
      const index = items.findIndex((item) => item === active);
      const target = wrapFocus(index, items.length, event.shiftKey);
      if (target !== undefined) {
        event.preventDefault();
        items[target]?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener?.isConnected === true) opener.focus();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
        onClick={() => {
          close.current();
        }}
      />
      <div
        ref={panel}
        role={tone === 'danger' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xl sm:p-8"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
