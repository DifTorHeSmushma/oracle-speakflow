<script lang="ts">
  import { cn } from "$lib/utils.js";
  let className: string | undefined = undefined;
  export { className as class };
</script>

<div class={cn("flex items-center p-4 pt-0", className)}>
  <slot />
</div>
