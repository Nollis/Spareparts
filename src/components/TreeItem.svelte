<script>
  import { createEventDispatcher } from "svelte";

  export let item;
  export let language = "se";
  export let selectedKey = "";
  export let isChild = false;

  const dispatch = createEventDispatcher();
  let open = false;

  const keyOf = (it) => it?.key || it?.slug || "";

  function hasSelectedDescendant(node, key) {
    if (!node?.children?.length) return false;
    for (const child of node.children) {
      const childKey = keyOf(child);
      if (childKey === key) return true;
      if (hasSelectedDescendant(child, key)) return true;
    }
    return false;
  }

  function toggle(event) {
    if (event) event.stopPropagation();
    const next = !open;
    open = next;
    if (next) {
      dispatch("select", item);
    }
  }

  function select(event) {
    if (event) event.stopPropagation();
    if (hasChildren && !open) {
      open = true;
    }
    dispatch("select", item);
  }

  $: labelText =
    item.lang_name?.[language] || item.name || item.slug || item.key || "";
  $: posNum = Number(item.pos_num || item.menu_order || item.position || 0);
  $: displayNumber = posNum > 0 ? `${posNum}.` : "";
  $: isActive = selectedKey === item.key || selectedKey === item.slug;
  $: hasChildren = item.children && item.children.length > 0;
  $: sortedChildren =
    hasChildren
      ? [...item.children].sort((a, b) => {
          const posA = Number(a.pos_num || a.menu_order || a.position || 0);
          const posB = Number(b.pos_num || b.menu_order || b.position || 0);
          if (posA !== posB) return posA - posB;
          return (a.id || 0) - (b.id || 0);
        })
      : [];

  $: if (hasChildren && selectedKey) {
    if (keyOf(item) === selectedKey || hasSelectedDescendant(item, selectedKey)) {
      open = true;
    }
  }
</script>

<div class={`tree-node ${isChild ? "child" : ""}`}>
  <button
    class={`tree-item ${isChild ? "child" : ""} ${isActive ? "active" : ""}`}
    on:click={select}
    type="button"
  >
    {#if hasChildren}
      <span
        class={`tree-caret ${open ? "open" : ""}`}
        on:click|stopPropagation={toggle}
        aria-hidden="true"
      ></span>
    {:else}
      <span class="tree-spacer" aria-hidden="true"></span>
    {/if}
    <span class="tree-number">{displayNumber}</span>
    <span class="tree-label">{labelText}</span>
  </button>

  {#if open && sortedChildren.length > 0}
    <div class="tree-children">
      {#each sortedChildren as child (child.id)}
        <svelte:self
          item={child}
          {language}
          {selectedKey}
          isChild={true}
          on:select
        />
      {/each}
    </div>
  {/if}
</div>