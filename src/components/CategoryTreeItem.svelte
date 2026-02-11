<script>
    import { createEventDispatcher } from "svelte";

    export let item;
    export let index;
    export let expanded;
    export let selected;
    export let language;
    export let allItems = [];
    export let isChild = false;
    export let usePosNum = true;
    export let isLast = false;

    const dispatch = createEventDispatcher();

    function getLabel(item, index) {
        return index + 1 + ". ";
    }

    function getDisplayName(item, lang) {
        if (!item) return "";
        const langName = item.lang_name?.[lang];
        return langName || item.name || "";
    }

    function getChildren(parentId) {
        return allItems
            .filter((i) => i.parent === parentId)
            .sort((a, b) => {
                const posA = Number(
                    a.pos_num || a.menu_order || a.position || 0,
                );
                const posB = Number(
                    b.pos_num || b.menu_order || b.position || 0,
                );
                if (posA !== posB) return posA - posB;
                return a.id - b.id;
            });
    }

    function hasChildren(item) {
        return getChildren(item.id).length > 0;
    }

    function toggleNode() {
        dispatch("toggle", item);
    }

    function selectNode() {
        dispatch("select", item);
    }

    $: currentLabel = getLabel(item, index);
    $: active = (selected?.key || selected?.slug) === (item.key || item.slug);
    $: isOpen = expanded.has(item.id);
    $: children = isOpen ? getChildren(item.id) : [];
</script>

<div class={`tree-node ${isChild ? "child" : ""} ${isLast ? "last" : ""}`}>
    <button
        class={`tree-item ${isChild ? "child" : ""} ${active ? "active" : ""}`}
        on:click={selectNode}
    >
        {#if hasChildren(item)}
            <span
                class={`tree-caret ${isOpen ? "open" : ""}`}
                on:click|stopPropagation={toggleNode}
                aria-hidden="true"
            ></span>
        {:else}
            <span class="tree-spacer" aria-hidden="true"></span>
        {/if}
        <span class="tree-number">{currentLabel}</span>
        <span class="tree-label">{getDisplayName(item, language)}</span>
    </button>

    {#if isOpen && children.length > 0}
        <div class="tree-children">
            {#each children as child, childIndex}
                <svelte:self
                    item={child}
                    index={childIndex}
                    {expanded}
                    {selected}
                    {language}
                    {allItems}
                    {usePosNum}
                    isChild={true}
                    isLast={childIndex === children.length - 1}
                    on:select
                    on:toggle
                />
            {/each}
        </div>
    {/if}
</div>

<style>
    .tree-node {
        position: relative;
    }

    .tree-item {
        margin: 0;
        padding: 6px 12px;
        position: relative;
    }

    .tree-children {
        margin-left: 20px;
        padding-left: 0;
        display: flex;
        flex-direction: column;
        position: relative;
    }

    /* Vertical line: drawn on the child itself */
    .tree-node.child::before {
        content: "";
        position: absolute;
        left: -11px; /* Align with parent's vertical flow */
        width: 1px;
        background: #cbd5e0;
        top: 0;
        bottom: 0;
    }

    /* If it's the last child, stop the line halfway (L-shape) */
    .tree-node.child.last::before {
        bottom: auto;
        height: 20px; /* Adjust based on item height/center */
    }

    /* Horizontal line connector */
    .tree-node.child::after {
        content: "";
        position: absolute;
        left: -11px;
        top: 20px; /* Center-ish */
        width: 10px;
        height: 1px;
        background: #cbd5e0;
    }

    .tree-item.child {
        /* No internal lines */
    }

    .tree-item.active {
        background: #ebf8ff;
        color: #2b6cb0;
        font-weight: 600;
    }

    .tree-number {
        font-weight: 600;
        min-width: 25px;
        color: #4a5568;
    }

    .tree-label {
        white-space: normal;
        line-height: 1.3;
        text-align: left;
        color: #2d3748;
    }

    .tree-caret {
        cursor: pointer;
        z-index: 2;
    }
</style>
