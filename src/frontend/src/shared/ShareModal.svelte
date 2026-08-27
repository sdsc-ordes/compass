<script lang="ts">
  import { X, Copy, Check } from 'lucide-svelte';
  // @ts-ignore — qrcode has no bundled types
  import QRCode from 'qrcode';
  import { i18n, type Lang } from './i18n';

  export let url: string;
  export let lang: Lang = 'en';
  export let onClose: () => void = () => {};

  $: t = i18n[lang] || i18n.en;

  let qrDataUrl = '';
  let copied = false;

  // Generate QR code reactively when url changes
  $: if (url) {
    QRCode.toDataURL(url, {
      width: 200,
      margin: 2,
      color: { dark: '#1e293b', light: '#ffffff' },
    }).then((dataUrl: string) => {
      qrDataUrl = dataUrl;
    }).catch((e: Error) => {
      console.error('[Compass] QR code generation failed:', e);
    });
  }

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      copied = true;
      setTimeout(() => (copied = false), 2000);
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<div class="backdrop" on:click|self={onClose} role="dialog" aria-modal="true" aria-label={t.shareTitle}>
  <div class="modal">
    <div class="modal-header">
      <h3>{t.shareTitle}</h3>
      <button class="close-btn" on:click={onClose} aria-label="Close">
        <X size={18} />
      </button>
    </div>
    <div class="modal-body">
      <p class="share-hint">{t.shareHint}</p>
      <div class="qr-wrapper">
        {#if qrDataUrl}
          <img src={qrDataUrl} alt="QR code" width="200" height="200" />
        {:else}
          <div class="qr-placeholder">Generating...</div>
        {/if}
      </div>
      <div class="link-row">
        <input type="text" readonly value={url} class="link-input" />
        <button class="copy-btn" on:click={copyLink} title={t.copyLink}>
          {#if copied}
            <Check size={16} />
          {:else}
            <Copy size={16} />
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .modal {
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    width: 360px;
    max-width: 90vw;
    overflow: hidden;
    animation: slideUp 0.2s ease-out;
  }

  @keyframes slideUp {
    from { transform: translateY(16px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #e2e8f0;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #1e293b;
  }

  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: #64748b;
    padding: 4px;
    display: flex;
    align-items: center;
    border-radius: 4px;
    transition: background 0.15s, color 0.15s;
  }
  .close-btn:hover {
    background: #f1f5f9;
    color: #1e293b;
  }

  .modal-body {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .share-hint {
    margin: 0;
    font-size: 0.8125rem;
    color: #64748b;
    text-align: center;
  }

  .qr-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #ffffff;
  }

  .link-row {
    display: flex;
    width: 100%;
    gap: 0.5rem;
  }

  .link-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.75rem;
    font-family: monospace;
    color: #334155;
    background: #f8fafc;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .copy-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    background: white;
    border-radius: 6px;
    cursor: pointer;
    color: #475569;
    transition: background 0.15s, color 0.15s;
  }
  .copy-btn:hover {
    background: #f1f5f9;
    color: #0284c7;
  }
</style>
