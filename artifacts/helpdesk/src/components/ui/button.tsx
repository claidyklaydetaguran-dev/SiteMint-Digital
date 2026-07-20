import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Phase 1C.1: this cva string deliberately omits any focus-visible outline
  // suppression or ring override — the
  // global `:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }`
  // rule (index.css) is left to apply natively. Its 2px offset opens a real
  // gap between the button's own fill/border and the ring, so the ring's
  // actual adjacent color is the surrounding surface (already measured
  // >=3:1 in both themes) rather than the button's own same-hue fill
  // (previously measured failing at 1.61:1 light / 1.45:1 dark because the
  // suppressed outline left only a 1px flush box-shadow ring touching the
  // fill directly).
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0" +
" hover-elevate active-elevate-2",
  {
    variants: {
      variant: {
        default:
           // @replit: no hover, and add primary border
           // Phase 1C: disabled state uses the shared button-disabled component
           // tokens (bg/text/border) instead of a generic opacity dim.
           "bg-primary text-primary-foreground border border-primary-border disabled:bg-button-disabled-bg disabled:text-button-disabled-fg disabled:border-button-disabled-border",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm border-destructive-border disabled:bg-button-disabled-bg disabled:text-button-disabled-fg disabled:border-button-disabled-border",
        outline:
          // @replit Shows the background color of whatever card / sidebar / accent background it is inside of.
          // Inherits the current text color. Uses shadow-xs. no shadow on active
          // No hover state
          " border [border-color:var(--button-outline)] shadow-xs active:shadow-none disabled:text-button-disabled-fg disabled:border-button-disabled-border ",
        secondary:
          // @replit border, no hover, no shadow, secondary border.
          "border bg-secondary text-secondary-foreground border border-secondary-border disabled:bg-button-disabled-bg disabled:text-button-disabled-fg disabled:border-button-disabled-border ",
        // @replit no hover, transparent border
        ghost: "border border-transparent disabled:text-button-disabled-fg",
        link: "text-primary underline-offset-4 hover:underline disabled:text-button-disabled-fg disabled:no-underline",
      },
      size: {
        // @replit changed sizes
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
