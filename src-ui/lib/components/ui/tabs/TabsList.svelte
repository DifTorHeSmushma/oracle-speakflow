<script lang="ts">
  import { cn } from "$lib/utils.js";
  let className: string | undefined = undefined;
  export { className as class };
</script>

<div class={cn("inline-flex h-8 items-center rounded-md bg-[var(--sf-bg)] p-0.5 gap-0.5", className)}>
  <slot />
</div>
