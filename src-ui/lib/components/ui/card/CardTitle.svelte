<script lang="ts">
  import { cn } from "$lib/utils.js";
  let className: string | undefined = undefined;
  export { className as class };
</script>

<h3 class={cn("text-sm font-semibold leading-none tracking-tight text-[var(--sf-text)]", className)}>
  <slot />
</h3>
