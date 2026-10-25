import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'gold' | 'outline' | 'subtle' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'icon' | 'icon-sm'

const variants: Record<Variant, string> = {
  primary:
    'bg-ink text-canvas hover:bg-charcoal-soft active:bg-charcoal shadow-sm disabled:hover:bg-ink',
  gold: 'bg-gold text-white hover:bg-gold-ink active:bg-gold-ink shadow-sm disabled:hover:bg-gold',
  outline:
    'border border-line-strong bg-panel text-ink hover:border-ink-faint hover:bg-surface active:bg-panel-muted',
  subtle:
    'bg-panel-muted text-ink-soft hover:bg-line hover:text-ink active:bg-line-strong/60',
  ghost: 'text-ink-soft hover:bg-panel-muted hover:text-ink active:bg-line/70',
  danger: 'bg-danger text-white hover:bg-[#9c352a] active:bg-[#8a2f25] shadow-sm',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-9 gap-2 px-4 text-[13px]',
  icon: 'size-8',
  'icon-sm': 'size-7',
}

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'outline', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-md font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = 'Button'
