<script>
  import { createEventDispatcher } from "svelte";
  import { login } from "../lib/api.js";

  const dispatch = createEventDispatcher();

  let email = "";
  let password = "";
  let error = "";
  let loading = false;

  function close() {
    dispatch("close");
  }

  async function handleSubmit() {
    error = "";
    loading = true;
    try {
      const user = await login(email, password);
      dispatch("success", { user });
      close();
    } catch (e) {
      error = e?.message || "Login failed.";
    } finally {
      loading = false;
    }
  }
</script>

<div
  class="login-modal-backdrop"
  on:click={close}
  on:keydown={(e) => e.key === "Escape" && close()}
  role="button"
  tabindex="-1"
  aria-label="Close login"
>
  <div
    class="login-modal"
    on:click|stopPropagation
    on:keydown|stopPropagation
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="login-header">
      <h2>Logga in p&#229; ditt konto</h2>
    </div>

    <div class="login-body">
      <div class="field">
        <label class="sr-only" for="login-email">Anv&#228;ndarnamn / E-postadress</label>
        <div class="input-icon">
          <i class="user icon" aria-hidden="true"></i>
          <input
            id="login-email"
            type="text"
            placeholder="Anv&#228;ndarnamn / E-postadress"
            bind:value={email}
            autocomplete="username"
          />
        </div>
      </div>

      <div class="field">
        <label class="sr-only" for="login-password">L&#246;senord</label>
        <div class="input-icon">
          <i class="lock icon" aria-hidden="true"></i>
          <input
            id="login-password"
            type="password"
            placeholder="L&#246;senord"
            bind:value={password}
            autocomplete="current-password"
          />
        </div>
      </div>

      {#if error}
        <div class="error">{error}</div>
      {/if}

      <button class="btn-login" on:click={handleSubmit} disabled={loading}>
        {loading ? "Loggar in..." : "Logga in"}
      </button>

      <div class="login-meta">
        <button class="link" type="button">Gl&#246;mt l&#246;senord?</button>
      </div>
    </div>

    <div class="login-footer">
      <button class="btn-close" on:click={close}>
        <i class="times icon"></i> St&#228;ng
      </button>
    </div>
  </div>
</div>

<style>
  .login-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 2200;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .login-modal {
    background: #fff;
    width: 520px;
    max-width: 95%;
    border-radius: 6px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    color: #333;
  }

  .login-header {
    padding: 22px 24px 12px;
    text-align: center;
    border-bottom: 1px solid #eee;
  }

  .login-header h2 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
  }

  .login-body {
    padding: 20px 24px 10px;
  }

  .field {
    margin-bottom: 14px;
  }

  .input-icon {
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px 10px;
    background: #fafafa;
  }

  .input-icon input {
    border: none;
    outline: none;
    background: transparent;
    width: 100%;
    font-size: 0.95rem;
  }

  .btn-login {
    width: 100%;
    border: none;
    padding: 12px 18px;
    border-radius: 4px;
    font-weight: 700;
    cursor: pointer;
    background: #f2c9c9;
    color: #fff;
    font-size: 0.95rem;
    transition: background 0.2s;
  }

  .btn-login:hover:not(:disabled) {
    background: #e7b5b5;
  }

  .btn-login:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .login-meta {
    display: flex;
    justify-content: flex-end;
    margin-top: 10px;
    font-size: 0.85rem;
  }

  .login-meta .link {
    color: #666;
    text-decoration: none;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    cursor: pointer;
  }

  .login-meta .link:hover {
    text-decoration: underline;
  }

  .error {
    color: #c0392b;
    font-size: 0.9rem;
    margin-bottom: 10px;
  }

  .login-footer {
    padding: 14px 20px;
    background: #f9f9f9;
    border-top: 1px solid #eee;
    border-radius: 0 0 6px 6px;
    display: flex;
    justify-content: flex-end;
  }

  .btn-close {
    border: none;
    padding: 10px 16px;
    border-radius: 4px;
    font-weight: 600;
    cursor: pointer;
    background: #8f8f8f;
    color: #fff;
  }

  .btn-close:hover {
    background: #7a7a7a;
  }
</style>
