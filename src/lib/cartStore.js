import { writable, derived } from 'svelte/store';

function createCart() {
    const { subscribe, update, set } = writable([]);

    return {
        subscribe,
        addItem: (item, quantity = 1) => {
            update(items => {
                if (quantity <= 0) return items;

                const index = items.findIndex(i => i.sku === item.sku);
                if (index !== -1) {
                    // Update existing item
                    const newItems = [...items];
                    newItems[index].qty += quantity;
                    return newItems;
                } else {
                    // Add new item
                    return [...items, { ...item, qty: quantity }];
                }
            });
        },
        removeItem: (sku) => {
            update(items => items.filter(i => i.sku !== sku));
        },
        updateQuantity: (sku, qty) => {
            update(items => {
                const index = items.findIndex(i => i.sku === sku);
                if (index !== -1) {
                    const newItems = [...items];
                    newItems[index].qty = qty;
                    return newItems;
                }
                return items;
            });
        },
        clear: () => set([])
    };
}

export const cart = createCart();

export const cartCount = derived(cart, $cart => {
    return $cart.reduce((total, item) => total + item.qty, 0);
});

export const cartTotal = derived(cart, $cart => {
    return $cart.reduce((total, item) => total + (item.price * item.qty), 0);
});

export const addToCart = cart.addItem;
export const removeFromCart = cart.removeItem;
export const updateQuantity = cart.updateQuantity;
export const clearCart = cart.clear;
