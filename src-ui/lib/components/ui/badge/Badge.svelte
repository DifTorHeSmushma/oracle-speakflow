<script lang="ts">
  import { cn } from "$lib/utils.js";

  export let variant: "default" | "secondary" | "outline" | "destructive" = "default";
  let className: string | undefined = undefined;
  export { className as class };

  const variants: Record<string, string> = {
    default:     "bg-[var(--sf-accent)] text-[var(--sf-text)]",
    secondary:   "bg-[var(--sf-surface)] text-[var(--sf-muted)] border border-[var(--sf-border)]",
    outline:     "border border-[var(--sf-border)] text-[var(--sf-muted)]",
    destructive: "bg-[var(--sf-error)]/20 text-[var(--sf-error)] border border-[var(--sf-error)]/30",
  };
</script>

<span class={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", variants[variant], className)}>
  <slot />
</span>
