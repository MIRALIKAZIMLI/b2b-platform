// Ortak arayüz parçaları (ui-guidelines.md): yüksek kontrastlı tipografi, katmanlı gölge, ince
// kenarlık, cömert boşluk, Indigo vurgu. Metin içermez; çağıran çeviri anahtarıyla verir.
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

function cx(...parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm backdrop-blur',
        'transition-all duration-200 hover:border-slate-300 hover:shadow-md',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        {eyebrow !== undefined && (
          <p className="text-xs font-semibold tracking-wider text-indigo-600 uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {title}
        </h1>
        {description !== undefined && (
          <p className="max-w-2xl text-sm font-normal text-slate-500">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet-danger';

const BUTTON: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/30',
  secondary:
    'border border-slate-200/80 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:shadow-md',
  danger:
    'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-md shadow-rose-500/20 hover:shadow-lg hover:shadow-rose-500/30',
  'quiet-danger':
    'border border-transparent text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700',
};

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold',
        'transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-60',
        BUTTON[variant],
        className,
      )}
    />
  );
}

/** Etiket, alan, ipucu ve hata (hata `role="alert"`, alan `aria-describedby` ile bağlı). */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-900">
        {label}
      </label>
      {children}
      {error !== undefined ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : (
        hint !== undefined && <p className="text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

const CONTROL =
  'block w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 ' +
  'transition-all duration-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none';

function controlClass(invalid: boolean): string {
  return cx(CONTROL, invalid ? 'border-rose-300' : 'border-slate-200/80 hover:border-slate-300');
}

export function TextInput({
  invalid = false,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...props} className={controlClass(invalid)} />;
}

export function SelectInput({
  invalid = false,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return <select {...props} className={controlClass(invalid)} />;
}

export function TextArea({
  invalid = false,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea {...props} className={cx(controlClass(invalid), 'resize-y')} />;
}

export function Badge({
  tone,
  children,
}: {
  tone: 'amber' | 'emerald' | 'slate';
  children: ReactNode;
}) {
  const tones = {
    amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  } as const;
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
