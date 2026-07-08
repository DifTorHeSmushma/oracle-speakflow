<script lang="ts">
  import { getContext } from "svelte";
  import type { Writable } from "svelte/store";
  import { cn } from "$lib/utils.js";

  export let value: string;
  let className: string | undefined = undefined;
  export { className as class };

  const activeTab = getContext<Writable<string>>("tabs:active");
  $: isActive = $activeTab === value;
</script>

{#if isActive}
  <div
    role="tabpanel"
    class={cn("mt-2 focus-visible:outline-none", className)}
  >
    <slot />
  </div>
{/if}
