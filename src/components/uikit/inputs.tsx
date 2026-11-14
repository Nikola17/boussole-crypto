import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
// Formulaires : champ, nombre, sélection, zone de texte, interrupteur, segments (découpage du grand ui.tsx, lot 18).

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block min-w-0', className)}>
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[0.7rem] text-muted">{hint}</span>}
    </label>
  );
}

const inputCls = 'h-10 w-full min-w-0 rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(inputCls, className)} {...rest} />;
}

export function NumberInput({ value, onChange, className, step = 'any', ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number | ''; onChange: (v: number | '') => void }) {
  const [text, setText] = useState(value === '' ? '' : String(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value === '' ? '' : String(value));
    }
  }, [value]);
  return (
    <input
      inputMode="decimal"
      className={clsx(inputCls, 'tnum', className)}
      value={text}
      step={step}
      onChange={(e) => {
        const raw = e.target.value.replace(',', '.').replace(/\s/g, '');
        setText(e.target.value);
        if (raw === '') { last.current = ''; onChange(''); return; }
        const n = Number(raw);
        if (Number.isFinite(n)) { last.current = n; onChange(n); }
      }}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative min-w-0">
      <select className={clsx(inputCls, 'appearance-none pr-8', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(inputCls, 'h-auto min-h-20 py-2', className)} {...rest} />;
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-3')}
      >
        <span className={clsx('absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={clsx('inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-surface-2 p-0.5', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
