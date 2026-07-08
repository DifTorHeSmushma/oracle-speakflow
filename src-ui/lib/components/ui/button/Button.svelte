<script lang="ts">
  import { cn } from "$lib/utils.js";

  export let variant: "default" | "secondary" | "ghost" | "destructive" | "outline" = "default";
  export let size: "default" | "sm" | "lg" | "icon" = "default";
  export let disabled = false;
  let className: string | undefined = undefined;
  export { className as class };

  const base = "inline-flex items-center justify-center gap-1 rounded-md font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 cursor-pointer";

  const variants: Record<string, string> = {
    default:     "bg-[var(--sf-accent)] text-[var(--sf-text)] hover:bg-[var(--sf-accent2)]",
    secondary:   "bg-[var(--sf-surface)] text-[var(--sf-muted)] border border-[var(--sf-border)] hover:bg-[var(--sf-bg)]",
    ghost:       "text-[var(--sf-muted)] hover:bg-[var(--sf-surface)] hover:text-[var(--sf-text)]",
    destructive: "border border-[var(--sf-error)] text-[var(--sf-error)] hover:bg-[#3b1010]",
    outline:     "border border-[var(--sf-border)] text-[var(--sf-muted)] hover:bg-[var(--sf-surface)]",
  };

  const sizes: Record<string, string> = {
    default: "h-7 px-3 text-xs",
    sm:      "h-6 px-2 text-xs",
    lg:      "h-9 px-4 text-sm",
    icon:    "h-7 w-7 text-xs",
  };
</script>

<button
  class={cn(base, variants[variant], sizes[size], className)}
  {disabled}
  on:click
  {...$$restProps}
>
  <slot />
</button>
