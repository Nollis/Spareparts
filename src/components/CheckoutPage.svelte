<script>
  import { cart, cartTotal, updateQuantity, removeFromCart, clearCart } from "../lib/cartStore.js";
  import { getCurrentUser } from "../lib/api.js";

  export let language = "se";
  export let currency = "SEK";
  export let currencyRate = 1;

  const copy = {
    se: {
      step1: "Kundvagn",
      step1Sub: "Dina valda produkter",
      step2: "Kunduppgifter",
      step2Sub: "Orderuppgifter och leveransadress",
      step3: "Bekr&#228;fta best&#228;llning",
      step3Sub: "Granska och skicka din best&#228;llning",
      title: "Kundvagn",
      colSku: "Artikel.nr",
      colProduct: "Produkt",
      colQty: "Antal",
      colList: "Listpris",
      colNet: "Nettopris",
      colTotal: "Totalt",
      total: "Totalt",
      empty: "Kundvagnen &#228;r tom.",
      clear: "T&#246;m kundvagn",
      next: "N&#228;sta steg",
      note1: "Fraktkostnad tillkommer",
      note2: "Reservation f&#246;r pris&#228;ndringar",
    },
  };

  $: t = copy[language] || copy.se;

  let step = 1;
  let user = null;
  let loadingUser = false;
  let error = "";

  function formatPrice(value, rate) {
    if (!value) return `0,00 ${currency}`;
    const num = Number(value) / (rate || 1);
    return num.toFixed(2).replace(".", ",") + " " + currency;
  }

  async function loadUser() {
    loadingUser = true;
    error = "";
    try {
      user = await getCurrentUser();
    } catch (e) {
      user = null;
      error = e?.message || "Could not load user.";
    } finally {
      loadingUser = false;
    }
  }

  function nextStep() {
    if (step === 1 && $cart.length === 0) return;
    if (step === 2 && !user) return;
    step = Math.min(3, step + 1);
    if (step === 2 && !user) {
      loadUser();
    }
  }

  function prevStep() {
    step = Math.max(1, step - 1);
  }
</script>

<section class="checkout-page">
  <div class="container">
    <div class="checkout-shell">
      <div class="steps">
        <div class={`step ${step === 1 ? "active" : ""}`}>
          <div class="step-title">
            <i class="shopping cart icon"></i> {@html t.step1}
          </div>
          <div class="step-sub">{@html t.step1Sub}</div>
        </div>
        <div class={`step ${step === 2 ? "active" : ""}`}>
          <div class="step-title">
            <i class="truck icon"></i> {@html t.step2}
          </div>
          <div class="step-sub">{@html t.step2Sub}</div>
        </div>
        <div class={`step ${step === 3 ? "active" : ""}`}>
          <div class="step-title">
            <i class="clipboard check icon"></i> {@html t.step3}
          </div>
          <div class="step-sub">{@html t.step3Sub}</div>
        </div>
      </div>

      <div class="panel">
        {#if step === 1}
          <h2>{@html t.title}</h2>
          {#if $cart.length === 0}
            <p class="empty">{@html t.empty}</p>
          {:else}
            <table>
              <thead>
                <tr>
                  <th>{@html t.colSku}</th>
                  <th>{@html t.colProduct}</th>
                  <th>{@html t.colQty}</th>
                  <th>{@html t.colList}</th>
                  <th>{@html t.colNet}</th>
                  <th>{@html t.colTotal}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {#each $cart as item}
                  <tr>
                    <td>{item.sku}</td>
                    <td>{item.name}</td>
                    <td>
                      <input
                        type="number"
                        class="qty"
                        min="1"
                        value={item.qty}
                        on:change={(e) => updateQuantity(item.sku, Number(e.target.value))}
                      />
                    </td>
                    <td>{formatPrice(item.price, currencyRate)}</td>
                    <td>{formatPrice(item.price, currencyRate)}</td>
                    <td class="bold">{formatPrice(item.price * item.qty, currencyRate)}</td>
                    <td>
                      <button
                        class="icon-btn"
                        on:click={() => removeFromCart(item.sku)}
                        aria-label="Remove from cart"
                        title="Remove from cart"
                      >
                        <i class="trash alternate outline icon" aria-hidden="true"></i>
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>

            <div class="totals">
              <div class="notes">
                <div>{@html t.note1}</div>
                <div>{@html t.note2}</div>
              </div>
              <div class="sum">
                <span>{@html t.total}:</span>
                <strong>{formatPrice($cartTotal, currencyRate)}</strong>
              </div>
            </div>

            <div class="actions">
              <button class="ghost" on:click={clearCart}>
                <i class="trash icon"></i> {@html t.clear}
              </button>
              <button class="primary" on:click={nextStep}>
                {@html t.next} <i class="arrow right icon"></i>
              </button>
            </div>
          {/if}
        {:else if step === 2}
          <h2>{@html t.step2}</h2>
          {#if loadingUser}
            <p>Loading...</p>
          {:else if !user}
            <p class="empty">You need to log in to continue.</p>
          {:else}
            <div class="summary-grid">
              <div>
                <h3>Kontakt</h3>
                <p>{user.first_name} {user.last_name}</p>
                <p>{user.email}</p>
                <p>{user.phone}</p>
              </div>
              <div>
                <h3>Leveransadress</h3>
                <p>{user.shipping.street}</p>
                <p>{user.shipping.postal_area} {user.shipping.zip_code}</p>
                <p>{user.shipping.country}</p>
              </div>
            </div>
            <div class="actions">
              <button class="ghost" on:click={prevStep}>Tillbaka</button>
              <button class="primary" on:click={nextStep}>
                {@html t.next} <i class="arrow right icon"></i>
              </button>
            </div>
          {/if}
        {:else}
          <h2>{@html t.step3}</h2>
          <p>Granska din best&#228;llning och skicka.</p>
          <div class="actions">
            <button class="ghost" on:click={prevStep}>Tillbaka</button>
            <button class="primary">Skicka best&#228;llning</button>
          </div>
        {/if}
      </div>
    </div>
  </div>
</section>

<style>
  .checkout-page {
    padding: 30px 0 80px;
    background: #f4f7f9;
  }

  .container {
    width: min(1100px, 92vw);
    margin: 0 auto;
  }

  .checkout-shell {
    background: #fff;
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    overflow: hidden;
  }

  .steps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    background: #f7f7f7;
    border-bottom: 1px solid #e0e0e0;
  }

  .step {
    padding: 16px 18px;
    border-right: 1px solid #e0e0e0;
    color: #9aa3ad;
  }

  .step:last-child {
    border-right: none;
  }

  .step.active {
    background: #fff;
    color: #1b1b1f;
  }

  .step-title {
    font-weight: 700;
  }

  .step-sub {
    font-size: 0.85rem;
  }

  .panel {
    padding: 18px 24px 24px;
  }

  h2 {
    margin: 0 0 12px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  th,
  td {
    border-bottom: 1px solid #eee;
    padding: 10px;
  }

  .qty {
    width: 60px;
    padding: 6px;
    border: 1px solid #ddd;
    border-radius: 4px;
  }

  .bold {
    font-weight: 700;
  }

  .icon-btn {
    border: none;
    background: transparent;
    cursor: pointer;
    color: #d9534f;
  }

  .totals {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding: 14px 0;
  }

  .notes {
    font-style: italic;
    color: #666;
    font-size: 0.85rem;
  }

  .sum {
    font-weight: 600;
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
    margin-top: 12px;
  }

  .primary {
    background: #2185d0;
    color: #fff;
    border: none;
    padding: 10px 16px;
    border-radius: 4px;
    font-weight: 600;
    cursor: pointer;
  }

  .ghost {
    background: #e0e0e0;
    color: #444;
    border: none;
    padding: 10px 16px;
    border-radius: 4px;
    font-weight: 600;
    cursor: pointer;
  }

  .empty {
    color: #777;
  }
</style>
