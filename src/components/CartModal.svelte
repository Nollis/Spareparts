<script>
    import { createEventDispatcher } from "svelte";
    import {
        cart,
        cartTotal,
        removeFromCart,
        updateQuantity,
        clearCart,
    } from "../lib/cartStore.js";

    export let currency = "SEK";
    export let currencyRate = 1;
    export let onNavigate = () => {};

    const dispatch = createEventDispatcher();

    function close() {
        dispatch("close");
    }

    function formatPrice(value, rate) {
        if (!value) return "0,00";
        const num = Number(value) / (rate || 1);
        return num.toFixed(2).replace(".", ",") + " " + currency;
    }
</script>

<div
    class="cart-modal-backdrop"
    on:click={close}
    on:keydown={(e) => e.key === "Escape" && close()}
    role="button"
    tabindex="-1"
    aria-label="Close cart"
>
    <div
        class="cart-modal"
        on:click|stopPropagation
        on:keydown|stopPropagation
        role="dialog"
        aria-modal="true"
        tabindex="-1"
    >
        <div class="cart-header">
            <h2><i class="shopping cart icon"></i> Kundvagn</h2>
        </div>

        <div class="cart-body">
            <table class="cart-table">
                <thead>
                    <tr>
                        <th>Artikel.nr</th>
                        <th>Produkt</th>
                        <th>Antal</th>
                        <th>Listpris</th>
                        <th>Nettopris</th>
                        <th>Totalt</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {#if $cart.length === 0}
                        <tr
                            ><td colspan="7" class="empty"
                                >Kundvagnen är tom.</td
                            ></tr
                        >
                    {:else}
                        {#each $cart as item}
                            <tr>
                                <td>{item.sku}</td>
                                <td>{item.name}</td>
                                <td>
                                    <input
                                        type="number"
                                        class="qty-input"
                                        min="1"
                                        value={item.qty}
                                        on:change={(e) =>
                                            updateQuantity(
                                                item.sku,
                                                Number(e.target.value),
                                            )}
                                    />
                                </td>
                                <td>{formatPrice(item.price, currencyRate)}</td>
                                <td>{formatPrice(item.price, currencyRate)}</td>
                                <td class="bold"
                                    >{formatPrice(
                                        item.price * item.qty,
                                        currencyRate,
                                    )}</td
                                >
                                <td>
                                    <button
                                        class="icon-btn remove-btn"
                                        aria-label="Ta bort produkt"
                                        on:click={() =>
                                            removeFromCart(item.sku)}
                                    >
                                        <i class="trash alternate outline icon"
                                        ></i>
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    {/if}
                </tbody>
            </table>

            {#if $cart.length > 0}
                <div class="cart-summary">
                    <span class="total-label">Totalt:</span>
                    <span class="total-value"
                        >{formatPrice($cartTotal, currencyRate)}</span
                    >
                </div>
            {/if}
        </div>

        <div class="cart-footer">
            <div class="left-actions">
                <button class="btn btn-secondary" on:click={close}>
                    <i class="times icon"></i> Stäng
                </button>
                <button
                    class="btn btn-secondary"
                    on:click={clearCart}
                    disabled={$cart.length === 0}
                >
                    <i class="trash icon"></i> Töm kundvagn
                </button>
            </div>
            <div class="right-actions">
                <button
                    class="btn btn-primary"
                    disabled={$cart.length === 0}
                    on:click={() => onNavigate("/checkout")}
                >
                    <i class="check icon"></i> Gå till kassan
                </button>
            </div>
        </div>
    </div>
</div>

<style>
    .cart-modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        z-index: 2000;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .cart-modal {
        background: #fff;
        width: 900px;
        max-width: 95%;
        border-radius: 6px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
        display: flex;
        flex-direction: column;
        max-height: 90vh;
        color: #333;
    }

    .cart-header {
        padding: 20px;
        border-bottom: 1px solid #eee;
    }

    .cart-header h2 {
        margin: 0;
        font-size: 1.5rem;
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .cart-body {
        padding: 20px;
        overflow-y: auto;
        flex: 1;
    }

    .cart-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.95rem;
    }

    .cart-table th {
        text-align: left;
        padding: 10px;
        color: #666;
        font-weight: 600;
        border-bottom: 1px solid #ddd;
    }

    .cart-table td {
        padding: 12px 10px;
        border-bottom: 1px solid #f0f0f0;
        vertical-align: middle;
    }

    .cart-table .empty {
        text-align: center;
        padding: 40px;
        color: #888;
        font-style: italic;
    }

    .qty-input {
        width: 60px;
        padding: 6px;
        border: 1px solid #ddd;
        border-radius: 4px;
        text-align: center;
    }

    .bold {
        font-weight: 700;
    }

    .icon-btn {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 1.1rem;
        color: #d9534f;
        opacity: 0.7;
        transition: opacity 0.2s;
    }

    .icon-btn:hover {
        opacity: 1;
    }

    .cart-summary {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 10px;
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid #eee;
        font-size: 1.1rem;
    }

    .total-label {
        font-weight: 600;
    }

    .total-value {
        font-weight: 700;
    }

    .cart-footer {
        padding: 20px;
        background: #f9f9f9;
        border-top: 1px solid #eee;
        border-radius: 0 0 6px 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .left-actions,
    .right-actions {
        display: flex;
        gap: 10px;
    }

    .btn {
        border: none;
        padding: 10px 18px;
        border-radius: 4px;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 0.9rem;
        transition: background 0.2s;
    }

    .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .btn-secondary {
        background: #e0e0e0;
        color: #555;
    }

    .btn-secondary:hover:not(:disabled) {
        background: #d0d0d0;
    }

    .btn-primary {
        background: #2185d0;
        color: #fff;
    }

    .btn-primary:hover:not(:disabled) {
        background: #1678c2;
    }
</style>
