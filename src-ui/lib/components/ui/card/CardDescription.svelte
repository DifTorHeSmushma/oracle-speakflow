<script lang="ts">
  import { cn } from "$lib/utils.js";
  let className: string | undefined = undefined;
  export { className as class };
</script>

<p class={cn("text-xs text-[var(--sf-muted)]", className)}>
  <slot />
</p>
