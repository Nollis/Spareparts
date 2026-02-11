<script>
  import { registerAccount } from "../lib/api.js";

  export let language = "se";

  let step = 1;
  let submitting = false;
  let error = "";
  let success = "";

  const copy = {
    se: {
      title: "Skapa nytt konto",
      intro:
        "N&#228;r du skapar ett nytt konto, kommer du f&#246;rst att f&#229; ett e-postmeddelande f&#246;r att bekr&#228;fta din e-postadress. N&#228;r du gjort detta kommer vi att f&#229; ett meddelande om din ans&#246;kan. Vi kommer att behandla din ans&#246;kan s&#229; fort vi kan, och n&#228;r du &#228;r godk&#228;nd kommer du att f&#229; alla inloggningsuppgifter du beh&#246;ver.",
      step1: "Kunduppgifter",
      step2: "Leveransadress",
      step3: "Fakturaadress",
      step4: "Skicka",
      firstName: "F&#246;rnamn",
      lastName: "Efternamn",
      phone: "Telefon/Mobil",
      company: "F&#246;retag",
      email: "E-postadress",
      street: "Gatuadress",
      street2: "Gatuadress 2",
      zip: "Postnummer",
      city: "Postadress",
      country: "Land",
      billingName: "F&#246;retagsnamn",
      billingEmail: "Faktura e-post",
      billingOrg: "Org.nr",
      next: "N&#228;sta steg",
      back: "Tillbaka",
      submit: "Skicka ans&#246;kan",
      done: "Tack! Din ans&#246;kan &#228;r skickad.",
    },
  };

  $: t = copy[language] || copy.se;

  let customer = {
    first_name: "",
    last_name: "",
    phone: "",
    company: "",
    email: "",
  };

  let shipping = {
    attn_first_name: "",
    attn_last_name: "",
    street: "",
    street_2: "",
    zip_code: "",
    postal_area: "",
    country: "",
  };

  let billing = {
    name: "",
    street: "",
    street_2: "",
    zip_code: "",
    postal_area: "",
    country: "",
    email: "",
    org_number: "",
  };
  let billingSameAsShipping = false;

  function nextStep() {
    error = "";
    if (step === 1) {
      if (!customer.first_name || !customer.last_name || !customer.phone || !customer.company || !customer.email) {
        error = "Fyll i alla obligatoriska f&#228;lt.";
        return;
      }
    }
    if (step === 2) {
      if (!shipping.street || !shipping.zip_code || !shipping.postal_area || !shipping.country) {
        error = "Fyll i alla obligatoriska f&#228;lt.";
        return;
      }
    }
    if (step === 3) {
      if (!billing.street || !billing.zip_code || !billing.postal_area) {
        error = "Fyll i alla obligatoriska f&#228;lt.";
        return;
      }
    }
    step = Math.min(4, step + 1);
  }

  function prevStep() {
    error = "";
    step = Math.max(1, step - 1);
  }

  function applyShippingToBilling() {
    billing = {
      ...billing,
      street: shipping.street,
      street_2: shipping.street_2,
      zip_code: shipping.zip_code,
      postal_area: shipping.postal_area,
      country: shipping.country,
    };
  }

  $: if (billingSameAsShipping) {
    applyShippingToBilling();
  }

  async function submit() {
    error = "";
    success = "";
    submitting = true;
    if (
      !billing.street &&
      !billing.street_2 &&
      !billing.zip_code &&
      !billing.postal_area &&
      !billing.country
    ) {
      applyShippingToBilling();
    }
    try {
      await registerAccount({ customer, shipping, billing });
      success = t.done;
      step = 4;
    } catch (e) {
      error = e?.message || "N&#229;got gick fel.";
    } finally {
      submitting = false;
    }
  }
</script>

<section class="register-page">
  <div class="container">
    <div class="register-shell">
      <div class="register-intro">
        <h1>{@html t.title}</h1>
        <p class="intro">{@html t.intro}</p>
      </div>

      <div class="steps">
        <div class={`step ${step >= 1 ? "active" : ""}`}>1 {t.step1}</div>
        <div class={`step ${step >= 2 ? "active" : ""}`}>2 {t.step2}</div>
        <div class={`step ${step >= 3 ? "active" : ""}`}>3 {t.step3}</div>
        <div class={`step ${step >= 4 ? "active" : ""}`}>4 {t.step4}</div>
      </div>

      {#if error}
        <div class="alert alert-error">{@html error}</div>
      {/if}
      {#if success}
        <div class="alert alert-success">{@html success}</div>
      {/if}

      {#if step === 1}
        <div class="panel">
          <h2>{@html t.step1}</h2>
        <div class="grid">
          <label>{@html t.firstName}<input type="text" bind:value={customer.first_name} /></label>
          <label>{@html t.phone}<input type="text" bind:value={customer.phone} /></label>
          <label>{@html t.lastName}<input type="text" bind:value={customer.last_name} /></label>
          <label>{@html t.company}<input type="text" bind:value={customer.company} /></label>
          <label class="span-2">{@html t.email}<input type="text" bind:value={customer.email} /></label>
        </div>
        <div class="actions">
          <button class="primary" on:click={nextStep}>{@html t.next}</button>
        </div>
        </div>
      {:else if step === 2}
        <div class="panel">
          <h2>{@html t.step2}</h2>
        <div class="grid">
          <label>{@html t.firstName}<input type="text" bind:value={shipping.attn_first_name} /></label>
          <label>{@html t.lastName}<input type="text" bind:value={shipping.attn_last_name} /></label>
          <label>{@html t.street}<input type="text" bind:value={shipping.street} /></label>
          <label>{@html t.street2}<input type="text" bind:value={shipping.street_2} /></label>
          <label>{@html t.zip}<input type="text" bind:value={shipping.zip_code} /></label>
          <label>{@html t.city}<input type="text" bind:value={shipping.postal_area} /></label>
          <label class="span-2">{@html t.country}<input type="text" bind:value={shipping.country} /></label>
        </div>
        <div class="actions">
          <button class="ghost" on:click={prevStep}>{@html t.back}</button>
          <button class="primary" on:click={nextStep}>{@html t.next}</button>
        </div>
        </div>
      {:else if step === 3}
        <div class="panel">
          <h2>{@html t.step3}</h2>
        <label class="checkbox">
          <input type="checkbox" bind:checked={billingSameAsShipping} />
          Anv&#228;nd samma som leveransadress
        </label>
        <div class="grid">
          <label>{@html t.billingName}<input type="text" bind:value={billing.name} /></label>
          <label>{@html t.billingEmail}<input type="text" bind:value={billing.email} /></label>
          <label>{@html t.billingOrg}<input type="text" bind:value={billing.org_number} /></label>
          <label>{@html t.street}<input type="text" bind:value={billing.street} /></label>
          <label>{@html t.street2}<input type="text" bind:value={billing.street_2} /></label>
          <label>{@html t.zip}<input type="text" bind:value={billing.zip_code} /></label>
          <label>{@html t.city}<input type="text" bind:value={billing.postal_area} /></label>
          <label class="span-2">{@html t.country}<input type="text" bind:value={billing.country} /></label>
        </div>
        <div class="actions">
          <button class="ghost" on:click={prevStep}>{@html t.back}</button>
          <button class="primary" on:click={nextStep}>{@html t.next}</button>
        </div>
        </div>
      {:else}
        <div class="panel">
          <h2>{@html t.step4}</h2>
          <p>{@html t.intro}</p>
          <div class="actions">
            <button class="ghost" on:click={prevStep}>{@html t.back}</button>
            <button class="primary" on:click={submit} disabled={submitting}>
              {submitting ? "..." : t.submit}
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</section>

<style>
  .register-page {
    padding: 40px 0 80px;
    background: #f4f7f9;
  }

  .container {
    width: min(1100px, 92vw);
    margin: 0 auto;
  }

  .register-shell {
    background: #fff;
    border: 1px solid #e5e5e5;
    border-radius: 10px;
    box-shadow: 0 16px 30px rgba(20, 20, 20, 0.08);
    overflow: hidden;
  }

  .register-intro {
    padding: 20px 24px 10px;
    background: transparent;
  }

  h1 {
    margin: 0 0 8px;
    font-size: 2rem;
  }

  .intro {
    color: #555;
    max-width: 900px;
    margin: 0;
    background: transparent;
    box-shadow: none;
    border: none;
  }

  .steps {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0;
    border-bottom: 1px solid #ddd;
    background: #f7f7f7;
  }

  .step {
    padding: 12px 10px;
    text-align: center;
    font-weight: 600;
    border-right: 1px solid #ddd;
  }

  .step:last-child {
    border-right: none;
  }

  .step.active {
    background: #fff;
    color: #1b5e20;
  }

  .panel {
    border-top: 1px solid #eee;
    padding: 18px 24px 22px;
    background: #fff;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(220px, 1fr));
    gap: 12px 20px;
    margin-top: 10px;
  }

  .span-2 {
    grid-column: span 2;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.9rem;
  }

  input {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px 10px;
    font-size: 0.95rem;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 16px;
  }

  .alert {
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .alert-error {
    background: #ffebee;
    color: #b71c1c;
  }

  .alert-success {
    background: #e8f5e9;
    color: #1b5e20;
  }

  .primary {
    background: #ef7d32;
    color: #fff;
    border: none;
    padding: 10px 16px;
    border-radius: 999px;
    font-weight: 600;
  }

  .ghost {
    background: transparent;
    border: 1px solid #ddd;
    padding: 10px 16px;
    border-radius: 999px;
    font-weight: 600;
  }
</style>
