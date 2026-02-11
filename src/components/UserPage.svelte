<script>
  import { onMount } from "svelte";
  import { getCurrentUser, updateUser, listDeliveryAddresses } from "../lib/api.js";

  export let language = "se";

  let user = null;
  let deliveryAddresses = [];
  let selectedDeliveryAddressId = "";
  let loading = true;
  let saving = false;
  let error = "";
  let success = "";

  const labels = {
    se: {
      title: "Min sida",
      saveAll: "Spara alla uppgifter",
      saved: "Sparat.",
      notLoggedIn: "Du m&#229;ste logga in f&#246;r att se sidan.",
      firstName: "F&#246;rnamn",
      lastName: "Efternamn",
      phone: "Telefon/Mobil",
      email: "Anv&#228;ndarnamn / E-postadress (kan ej &#228;ndras)",
      mainCustomer: "Huvudkund",
      customerNo: "Kundnr.",
      customerName: "Kundnamn",
      deliveryTitle: "Se leveransadresser",
      deliverySelect: "V&#228;lj leveransadress",
      street: "Gatuadress",
      street2: "Gatuadress 2",
      zip: "Postnummer",
      city: "Postadress",
      country: "Land",
      customAddress: "(Egen adress)",
    },
    en: {
      title: "My page",
      saveAll: "Save all",
      saved: "Saved.",
      notLoggedIn: "You must log in to view this page.",
      firstName: "First name",
      lastName: "Last name",
      phone: "Phone/Mobile",
      email: "Username / Email (read only)",
      mainCustomer: "Main customer",
      customerNo: "Customer no.",
      customerName: "Customer name",
      deliveryTitle: "Delivery addresses",
      deliverySelect: "Select delivery address",
      street: "Street",
      street2: "Street 2",
      zip: "Postal code",
      city: "City",
      country: "Country",
      customAddress: "(Custom address)",
    },
    pl: {
      title: "Moja strona",
      saveAll: "Zapisz wszystko",
      saved: "Zapisano.",
      notLoggedIn: "Zaloguj si&#281;, aby zobaczy&#263; stron&#281;.",
      firstName: "Imi&#281;",
      lastName: "Nazwisko",
      phone: "Telefon",
      email: "Login / E-mail (tylko do odczytu)",
      mainCustomer: "G&#322;&#243;wny klient",
      customerNo: "Nr klienta",
      customerName: "Nazwa klienta",
      deliveryTitle: "Adresy dostawy",
      deliverySelect: "Wybierz adres dostawy",
      street: "Ulica",
      street2: "Ulica 2",
      zip: "Kod pocztowy",
      city: "Miasto",
      country: "Kraj",
      customAddress: "(W&#322;asny adres)",
    },
  };

  $: t = labels[language] || labels.se;

  async function loadUser() {
    loading = true;
    error = "";
    success = "";
    try {
      user = await getCurrentUser();
      deliveryAddresses = await listDeliveryAddresses();
      selectedDeliveryAddressId = user?.selected_delivery_address_id
        ? String(user.selected_delivery_address_id)
        : "";
    } catch (e) {
      user = null;
      error = e?.message || "Failed to load user.";
    } finally {
      loading = false;
    }
  }

  async function save() {
    if (!user) return;
    saving = true;
    error = "";
    success = "";
    try {
      const payload = {
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        selected_delivery_address_id: selectedDeliveryAddressId
          ? Number(selectedDeliveryAddressId)
          : null,
        billing: user.billing,
        shipping: user.shipping,
      };
      user = await updateUser(payload);
      success = t.saved;
    } catch (e) {
      error = e?.message || "Save failed.";
    } finally {
      saving = false;
    }
  }

  onMount(loadUser);

  function updateShippingFromSelection() {
    if (!user) return;
    if (!selectedDeliveryAddressId) {
      return;
    }
    const selected = deliveryAddresses.find(
      (item) => String(item.id) === String(selectedDeliveryAddressId)
    );
    if (!selected) return;
    user = {
      ...user,
      shipping: {
        ...user.shipping,
        attn_first_name: selected.attn_first_name || "",
        attn_last_name: selected.attn_last_name || "",
        street: selected.street || "",
        street_2: selected.street_2 || "",
        zip_code: selected.zip_code || "",
        postal_area: selected.postal_area || "",
        country: selected.country || "",
      },
    };
  }
</script>

<section class="user-page">
  <div class="container">
    <div class="page-header">
      <h1>{@html t.title}</h1>
      <button class="btn-save" on:click={save} disabled={saving || !user}>
        <i class="save outline icon"></i>
        {saving ? "..." : t.saveAll}
      </button>
    </div>

    {#if loading}
      <p class="muted">Loading...</p>
    {:else if !user}
      <p class="muted">{@html t.notLoggedIn}</p>
    {:else}
      {#if error}
        <div class="alert alert-error">{error}</div>
      {/if}
      {#if success}
        <div class="alert alert-success">{success}</div>
      {/if}

      <div class="top-form">
        <label>
          {@html t.firstName}
          <input type="text" bind:value={user.first_name} />
        </label>
        <label>
          {@html t.phone}
          <input type="text" bind:value={user.phone} />
        </label>
        <label>
          {@html t.lastName}
          <input type="text" bind:value={user.last_name} />
        </label>
        <label>
          {@html t.email}
          <input type="text" value={user.email} disabled />
        </label>
      </div>

      <div class="split">
        <div class="card main-card">
          <div class="card-title">{@html t.mainCustomer}</div>
          <div class="row">
            <div class="row-label">{@html t.customerNo}</div>
            <div class="row-value">{user.company?.customer_number || ""}</div>
          </div>
          <div class="row">
            <div class="row-label">{@html t.customerName}</div>
            <div class="row-value">{user.company?.name || ""}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">{@html t.deliveryTitle}</div>
          <label class="select-label">
            {@html t.deliverySelect}
            <select bind:value={selectedDeliveryAddressId} on:change={updateShippingFromSelection}>
              <option value="">{@html t.customAddress}</option>
              {#each deliveryAddresses as address}
                <option value={String(address.id)}>
                  {address.street} {address.zip_code}
                </option>
              {/each}
            </select>
          </label>

          <div class="form-grid">
            <label>
              {@html t.street}
              <input type="text" bind:value={user.shipping.street} />
            </label>
            <label>
              {@html t.street2}
              <input type="text" bind:value={user.shipping.street_2} />
            </label>
            <label>
              {@html t.zip}
              <input type="text" bind:value={user.shipping.zip_code} />
            </label>
            <label>
              {@html t.city}
              <input type="text" bind:value={user.shipping.postal_area} />
            </label>
            <label class="span-2">
              {@html t.country}
              <input type="text" bind:value={user.shipping.country} />
            </label>
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  .user-page {
    padding: 40px 0 80px;
    background: #fff;
  }

  .container {
    width: min(1100px, 92vw);
    margin: 0 auto;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }

  h1 {
    margin: 0;
    font-size: 1.9rem;
    font-weight: 700;
  }

  .btn-save {
    border: none;
    padding: 10px 16px;
    border-radius: 4px;
    font-weight: 600;
    cursor: pointer;
    background: #bdbdbd;
    color: #fff;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .btn-save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .muted {
    color: #666;
  }

  .top-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(220px, 1fr));
    gap: 14px 32px;
    padding: 10px 0 18px;
    border-bottom: 1px solid #e0e0e0;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.9rem;
    color: #444;
  }

  input,
  select {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px 10px;
    font-size: 0.95rem;
    background: #fff;
  }

  input:disabled {
    background: #f5f5f5;
    color: #888;
  }

  .split {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) minmax(320px, 1.4fr);
    gap: 22px;
    margin-top: 22px;
  }

  .card {
    border: 1px solid #e3e3e3;
    border-radius: 6px;
    background: #fff;
  }

  .main-card .row {
    display: grid;
    grid-template-columns: 120px 1fr;
    padding: 12px 14px;
    border-top: 1px solid #eee;
    font-size: 0.9rem;
  }

  .main-card .row:first-of-type {
    border-top: none;
  }

  .card-title {
    font-weight: 600;
    padding: 12px 14px;
    border-bottom: 1px solid #eee;
    background: #fafafa;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(160px, 1fr));
    gap: 12px 16px;
    padding: 12px 14px 16px;
  }

  .span-2 {
    grid-column: span 2;
  }

  .select-label {
    padding: 12px 14px 0;
  }

  .alert {
    padding: 10px 12px;
    border-radius: 4px;
    margin: 12px 0;
    font-size: 0.9rem;
  }

  .alert-error {
    background: #fbe9e7;
    color: #b71c1c;
  }

  .alert-success {
    background: #e8f5e9;
    color: #1b5e20;
  }

  @media (max-width: 900px) {
    .top-form {
      grid-template-columns: 1fr;
    }

    .split {
      grid-template-columns: 1fr;
    }

    .form-grid {
      grid-template-columns: 1fr;
    }

    .span-2 {
      grid-column: span 1;
    }
  }
</style>
