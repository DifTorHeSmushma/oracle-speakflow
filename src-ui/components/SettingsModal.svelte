<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  } from "$lib/components/ui/dialog/index.js";
  import {
    Tabs, TabsList, TabsTrigger, TabsContent,
  } from "$lib/components/ui/tabs/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import SettingsFields from "./SettingsFields.svelte";
  import ApiKeyPanel from "./ApiKeyPanel.svelte";
  import HotkeyEditor from "./HotkeyEditor.svelte";
  import ModelDownloader from "./ModelDownloader.svelte";
  import VoiceSettings from "./VoiceSettings.svelte";
  import DictionaryPanel from "./DictionaryPanel.svelte";
  import type { VoiceMode } from "../../src/types/voice.js";
  import { DEFAULT_VAD_CONFIG, DEFAULT_CORRECTION_CONFIG } from "../../src/types/voice.js";

  const dispatch = createEventDispatcher<{ close: void }>();

  let open = true;
  let model              = "whisper-large-v3-turbo";
  let language           = "en";
  let verbose            = false;
  let transcriptionMode: "local" | "remote" = "remote";
  let saved              = false;
  let modelPresent       = true;
  let activeTab          = "voice";

  let voiceMode: VoiceMode = "handsFree";
  let terminalVariantEnabled = false;
  let positiveThreshold = DEFAULT_VAD_CONFIG.positiveSpeechThreshold;
  let negativeThreshold = DEFAULT_VAD_CONFIG.negativeSpeechThreshold;
  let vadMinSpeechFrames = DEFAULT_VAD_CONFIG.minSpeechFrames;
  let vadRedemptionFrames = DEFAULT_VAD_CONFIG.redemptionFrames;
  let vadPreSpeechPadFrames = DEFAULT_VAD_CONFIG.preSpeechPadFrames;
  let llmCorrectionEnabled = DEFAULT_CORRECTION_CONFIG.llmEnabled;
  let llmLatencyBudgetMs = DEFAULT_CORRECTION_CONFIG.llmLatencyBudgetMs;

  onMount(async () => {
    if (window.electronAPI) {
      modelPresent = await window.electronAPI.checkModel();
      const voice = await window.electronAPI.getVoiceSettings?.();
      if (voice) {
        llmLatencyBudgetMs = voice.correction.llmLatencyBudgetMs;
      }
    }
  });

  function save(): void {
    if (window.electronAPI) {
      window.electronAPI.sendConfigUpdate({
        model,
        language,
        transcriptionMode,
        voiceMode,
        terminalVariantEnabled,
        vad: {
          positiveSpeechThreshold: positiveThreshold,
          negativeSpeechThreshold: negativeThreshold,
          minSpeechFrames: vadMinSpeechFrames,
          redemptionFrames: vadRedemptionFrames,
          preSpeechPadFrames: vadPreSpeechPadFrames,
        },
        correction: {
          llmEnabled: llmCorrectionEnabled,
          llmLatencyBudgetMs,
        },
      });
    }
    saved = true;
    setTimeout(() => { saved = false; close(); }, 800);
  }

  function close(): void {
    open = false;
    dispatch("close");
  }

  function openExternal(url: string): void {
    window.electronAPI?.openExternal(url);
  }
</script>

<Dialog bind:open on:close={close}>
  <DialogContent>

    <DialogHeader>
      <DialogTitle>Settings</DialogTitle>
      <Button variant="ghost" size="icon" on:click={close} class="close-x">✕</Button>
    </DialogHeader>

    <Tabs bind:value={activeTab}>
      <TabsList class="tabs-list">
        <TabsTrigger value="voice">Voice</TabsTrigger>
        <TabsTrigger value="dictionary">Dictionary</TabsTrigger>
        <TabsTrigger value="engine">Engine</TabsTrigger>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="support">Support</TabsTrigger>
      </TabsList>

      <TabsContent value="voice">
        <div class="tab-body">
          <VoiceSettings
            bind:voiceMode
            bind:terminalVariantEnabled
            bind:positiveThreshold
            bind:negativeThreshold
            bind:vadMinSpeechFrames
            bind:vadRedemptionFrames
            bind:vadPreSpeechPadFrames
            bind:llmCorrectionEnabled
          />
          <HotkeyEditor />
        </div>
      </TabsContent>

      <TabsContent value="dictionary">
        <div class="tab-body">
          <DictionaryPanel />
        </div>
      </TabsContent>

      <TabsContent value="engine">
        <div class="tab-body">
          <SettingsFields bind:model bind:language bind:verbose bind:transcriptionMode />
          {#if transcriptionMode === "local" && !modelPresent}
            <ModelDownloader onDone={() => { modelPresent = true; }} />
          {/if}
        </div>
      </TabsContent>

      <TabsContent value="account">
        <div class="tab-body">
          <ApiKeyPanel />
        </div>
      </TabsContent>

      <TabsContent value="support">
        <div class="tab-body support-tab">
          <p class="support-heading">Support development</p>
          <p class="support-sub">Oracle SpeakFlow is free and open source.</p>
          <div class="support-btns">
            <button class="support-link" on:click={() => openExternal("https://www.buymeacoffee.com/oraclespeakflow")}>
              ☕ Buy Me a Coffee
            </button>
            <button class="support-link" on:click={() => openExternal("https://github.com/sponsors/DifTorHeSmushma")}>
              ❤ GitHub Sponsors
            </button>
          </div>
          <p class="support-repo">
            <button class="repo-link" on:click={() => openExternal("https://github.com/DifTorHeSmushma/oracle-speakflow")}>
              View on GitHub →
            </button>
          </p>
        </div>
      </TabsContent>
    </Tabs>

    <DialogFooter>
      {#if saved}
        <span class="saved-notice">Saved!</span>
      {/if}
      <Button variant="ghost" size="sm" on:click={close}>Cancel</Button>
      <Button variant="default" size="sm" on:click={save}>Save</Button>
    </DialogFooter>

  </DialogContent>
</Dialog>

<style>
  :global(.close-x) {
    color: var(--sf-muted2) !important;
    font-size: 13px !important;
    padding: 0 4px !important;
  }
  :global(.close-x:hover) {
    color: var(--sf-error) !important;
  }

  :global(.tabs-list) {
    width: 100%;
    flex-wrap: wrap;
  }

  .tab-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 4px 0;
    min-height: 100px;
    max-height: 280px;
    overflow-y: auto;
  }

  .support-tab {
    align-items: center;
    text-align: center;
    gap: 8px;
  }

  .support-heading {
    font-size: var(--sf-text-body, 12px);
    font-weight: 600;
    color: var(--sf-text);
  }

  .support-sub {
    font-size: var(--sf-text-caption, 11px);
    color: var(--sf-muted);
  }

  .support-btns {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }

  .support-link {
    background: none;
    border: 1px solid var(--sf-border);
    border-radius: var(--sf-radius-sm);
    color: var(--sf-text);
    font-size: var(--sf-text-caption, 11px);
    padding: 6px 12px;
    cursor: pointer;
    width: 100%;
    transition: background 0.15s, border-color 0.15s;
  }

  .support-link:hover {
    background: var(--sf-surface2);
    border-color: var(--sf-border2);
  }

  .support-repo {
    font-size: var(--sf-text-micro, 10px);
  }

  .repo-link {
    background: none;
    border: none;
    color: var(--sf-accent3);
    cursor: pointer;
    font-size: var(--sf-text-micro, 10px);
    padding: 0;
  }

  .repo-link:hover {
    text-decoration: underline;
  }

  .saved-notice {
    font-size: var(--sf-text-caption, 11px);
    color: var(--sf-success);
    margin-right: auto;
  }
</style>
