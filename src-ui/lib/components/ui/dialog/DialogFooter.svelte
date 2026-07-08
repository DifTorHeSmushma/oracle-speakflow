<script lang="ts">
  import { cn } from "$lib/utils.js";
  let className: string | undefined = undefined;
  export { className as class };
</script>

<div class={cn("flex items-center justify-end gap-2 border-t border-[var(--sf-border)] pt-3", className)}>
  <slot />
</div>
