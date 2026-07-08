<script lang="ts">
  import { cn } from "$lib/utils.js";
  let className: string | undefined = undefined;
  export { className as class };
</script>

<div class={cn("flex flex-col gap-1 p-4 pb-2", className)}>
  <slot />
</div>
