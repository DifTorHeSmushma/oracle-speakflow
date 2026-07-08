<script lang="ts">
  import { cn } from "$lib/utils.js";
  let className: string | undefined = undefined;
  export { className as class };
</script>

<h2 class={cn("text-sm font-semibold text-[var(--sf-text)]", className)}>
  <slot />
</h2>
