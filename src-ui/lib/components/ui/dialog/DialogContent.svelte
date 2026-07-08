<script lang="ts">
  import { getContext } from "svelte";
  import type { Writable } from "svelte/store";
  import { cn } from "$lib/utils.js";

  let className: string | undefined = undefined;
  export { className as class };

  const openStore = getContext<Writable<boolean>>("dialog:open");
  const close = getContext<() => void>("dialog:close");

  function handleOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) close();
  }

  function handleKey(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }
</script>

<svelte:window on:keydown={handleKey} />

{#if $openStore}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/65"
    on:click={handleOverlayClick}
    role="dialog"
    aria-modal="true"
  >
    <div
      class={cn(
        "relative z-50 w-[280px] rounded-lg border border-[var(--sf-border)] bg-[var(--sf-surface)] shadow-xl",
        "flex flex-col gap-3 p-4 max-h-[90vh] overflow-y-auto",
        className
      )}
    >
      <slot />
    </div>
  </div>
{/if}
