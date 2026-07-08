<script lang="ts">
  import { setContext } from "svelte";
  import { writable } from "svelte/store";

  export let value: string;

  const activeTab = writable(value);
  $: activeTab.set(value);

  setContext("tabs:active", activeTab);
  setContext("tabs:set", (v: string) => { value = v; activeTab.set(v); });
</script>

<div class="flex flex-col gap-0">
  <slot />
</div>
