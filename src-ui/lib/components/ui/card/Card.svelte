<script lang="ts">
  import { cn } from "$lib/utils.js";
  let className: string | undefined = undefined;
  export { className as class };
</script>

<div class={cn("rounded-lg border border-[var(--sf-border)] bg-[var(--sf-surface)] text-[var(--sf-text)] shadow-sm", className)}>
  <slot />
</div>
