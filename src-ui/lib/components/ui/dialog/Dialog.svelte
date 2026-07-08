<script lang="ts">
  import { setContext } from "svelte";
  import { writable } from "svelte/store";

  export let open = false;

  const openStore = writable(open);
  $: openStore.set(open);

  setContext("dialog:open", openStore);
  setContext("dialog:close", () => { open = false; });
</script>

<slot />
