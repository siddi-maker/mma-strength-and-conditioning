import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

const variants: Record<Variant, string> = {
  primary: 'bg-red-600 text-white active:bg-red-700',
  secondary: 'bg-neutral-800 text-neutral-100 active:bg-neutral-700',
  ghost: 'bg-transparent text-neutral-300 active:bg-neutral-800',
  danger: 'bg-red-950 text-red-300 border border-red-900 active:bg-red-900',
  success: 'bg-emerald-600 text-white active:bg-emerald-700',
};

export function Button({ variant = 'secondary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={cx(
        'min-h-12 rounded-xl px-4 font-semibold transition-colors select-none disabled:opacity-40',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-2xl bg-neutral-900 p-4', className)}>{children}</section>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">{children}</h2>
      {right}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  label,
  unit,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  label?: string;
  unit?: string;
}) {
  const v = value ?? 0;
  const set = (x: number) => onChange(Math.min(max, Math.max(min, Math.round(x * 100) / 100)));
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs text-neutral-400">{label}</span>}
      <div className="flex items-center gap-1">
        <button type="button" aria-label={`decrease ${label ?? ''}`} className="h-12 w-12 rounded-xl bg-neutral-800 text-2xl active:bg-neutral-700" onClick={() => set(v - step)}>
          −
        </button>
        <StepperInput value={v} onCommit={set} />
        <button type="button" aria-label={`increase ${label ?? ''}`} className="h-12 w-12 rounded-xl bg-neutral-800 text-2xl active:bg-neutral-700" onClick={() => set(v + step)}>
          +
        </button>
        {unit && <span className="ml-1 text-sm text-neutral-400">{unit}</span>}
      </div>
    </div>
  );
}

function StepperInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);
  return (
    <input
      inputMode="decimal"
      className="h-12 w-20 rounded-xl bg-neutral-950 text-center text-lg font-semibold tabular-nums outline-none focus:ring-2 focus:ring-red-600"
      value={text}
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const raw = e.target.value.replace(',', '.');
        if (!/^\d*\.?\d*$/.test(raw)) return;
        setText(raw);
        const n = parseFloat(raw);
        onCommit(Number.isNaN(n) ? 0 : n);
      }}
    />
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        'flex min-h-12 w-full items-center justify-between rounded-xl px-4 text-left font-medium',
        checked ? 'bg-emerald-900/60 text-emerald-200' : 'bg-neutral-800 text-neutral-300',
      )}
    >
      <span>{label}</span>
      <span className={cx('flex h-7 w-12 items-center rounded-full p-1 transition-colors', checked ? 'bg-emerald-500' : 'bg-neutral-600')}>
        <span className={cx('h-5 w-5 rounded-full bg-white transition-transform', checked && 'translate-x-5')} />
      </span>
    </button>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  unit,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  unit?: string;
  placeholder?: string;
}) {
  // Keep the raw text while typing so "77." or "0," aren't swallowed by re-rendering from the number.
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value === undefined ? '' : String(value));
  }, [value, focused]);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-neutral-400">{label}</span>
      <div className="flex items-center rounded-xl bg-neutral-800 focus-within:ring-2 focus-within:ring-red-600">
        <input
          type="text"
          inputMode="decimal"
          placeholder={placeholder}
          className="h-12 w-full min-w-0 bg-transparent px-3 text-lg font-semibold tabular-nums outline-none"
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const raw = e.target.value.replace(',', '.');
            if (!/^\d*\.?\d*$/.test(raw)) return;
            setText(raw);
            const n = parseFloat(raw);
            onChange(Number.isNaN(n) ? undefined : n);
          }}
        />
        {unit && <span className="pr-3 text-sm text-neutral-400">{unit}</span>}
      </div>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx('min-h-12 flex-1 rounded-xl px-3 text-sm font-semibold whitespace-nowrap', value === o.value ? 'bg-red-600 text-white' : 'bg-neutral-800 text-neutral-300')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Circular progress ring. Turns green inside the target band, amber above it. */
export function Ring({ value, min, max, label, unit, size = 88 }: { value: number; min: number; max: number; label: string; unit: string; size?: number }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = min > 0 ? Math.min(1, value / min) : 0;
  const color = value > max ? '#f59e0b' : value >= min ? '#10b981' : '#ef4444';
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} ${value} of ${min}–${max} ${unit}`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#262626" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="fill-neutral-100 text-[15px] font-bold">
          {fmt(value)}
        </text>
        <text x="50%" y="68%" textAnchor="middle" dominantBaseline="middle" className="fill-neutral-500 text-[10px]">
          / {fmt(min)}
          {unit}
        </text>
      </svg>
      <span className="text-xs text-neutral-400">{label}</span>
    </div>
  );
}

export function Bar({ value, max, ok, className }: { value: number; max: number; ok?: boolean; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cx('h-2.5 w-full overflow-hidden rounded-full bg-neutral-800', className)}>
      <div className={cx('h-full rounded-full', ok ? 'bg-emerald-500' : 'bg-red-500')} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function fmt(n: number | undefined, decimals = 1): string {
  if (n === undefined || Number.isNaN(n)) return '–';
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString();
  return Number.isInteger(n) ? String(n) : n.toFixed(decimals);
}

export function Page({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-40">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{title}</h1>
        {right}
      </header>
      {children}
    </div>
  );
}
