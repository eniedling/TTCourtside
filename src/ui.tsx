import type { ComponentChildren } from 'preact';

type IconName = 'bolt' | 'warn' | 'undo' | 'swap' | 'reset' | 'sliders' | 'share' | 'live' | 'chart' | 'list' | 'close' | 'trash' | 'ball';

const paths: Record<IconName, string> = {
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  warn: 'M12 3 2 21h20L12 3zm0 6v6m0 3v.5',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  swap: 'M7 7h13m0 0-4-4m4 4-4 4M17 17H4m0 0 4 4m-4-4 4-4',
  reset: 'M4 4v6h6M20 12a8 8 0 1 1-2.3-5.7L20 9',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  share: 'M12 3v12m0-12-4 4m4-4 4 4M5 13v6h14v-6',
  live: 'M4 6h16v12H4zM12 6v12',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h0M4 12h0M4 18h0',
  close: 'M6 6l12 12M18 6 6 18',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  ball: 'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
};

export function Icon({ name, class: cls = 'w-4 h-4' }: { name: IconName; class?: string }) {
  return (
    <svg viewBox="0 0 24 24" class={cls} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose?: () => void; title?: string; children: ComponentChildren }) {
  if (!open) return null;
  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div class="max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        {(title || onClose) && (
          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 class="text-base font-extrabold text-white">{title}</h2>
            {onClose && (
              <button onClick={onClose} class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:text-white" aria-label="Close">
                <Icon name="close" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Toast({ text }: { text: string | null }) {
  return (
    <div
      class={`pointer-events-none fixed left-1/2 top-[calc(var(--sat)+3.5rem)] z-[60] -translate-x-1/2 rounded-full border border-sky-500/50 bg-slate-800/95 px-4 py-2 text-xs font-bold text-white shadow-xl transition-opacity duration-200 ${text ? 'opacity-100' : 'opacity-0'}`}
      role="status"
      aria-live="polite"
    >
      {text}
    </div>
  );
}

export const haptic = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported on iOS */
  }
};
