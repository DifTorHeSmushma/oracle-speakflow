<script lang="ts">
  import { cn } from "$lib/utils.js";
  let className: string | undefined = undefined;
  export { className as class };
</script>

<div class={cn("flex items-center justify-between", className)}>
  <slot />
</div>
