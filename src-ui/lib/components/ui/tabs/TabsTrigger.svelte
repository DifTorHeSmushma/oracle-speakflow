<script lang="ts">
  import { getContext } from "svelte";
  import type { Writable } from "svelte/store";
  import { cn } from "$lib/utils.js";

  export let value: string;
  let className: string | undefined = undefined;
  export { className as class };

  const activeTab = getContext<Writable<string>>("tabs:active");
  const setTab = getContext<(v: string) => void>("tabs:set");

  $: isActive = $activeTab === value;
</script>

<button
  role="tab"
  aria-selected={isActive}
  on:click={() => setTab(value)}
  class={cn(
    "inline-flex items-center justify-center whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium transition-colors",
    "focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
    isActive
      ? "bg-[var(--sf-surface)] text-[var(--sf-text)] shadow-sm"
      : "text-[var(--sf-muted)] hover:text-[var(--sf-text)]",
    className
  )}
>
  <slot />
</button>
