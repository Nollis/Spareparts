<script>
  import TreeItem from "./TreeItem.svelte";
  import { createEventDispatcher } from "svelte";

  export let categories = [];
  export let mainKey = "";
  export let language = "se";
  export let selectedKey = "";

  const dispatch = createEventDispatcher();
  let menuItems = [];

  const keyOf = (item) => item?.key || item?.slug || "";

  $: {
    if (categories.length && mainKey) {
      const cloned = categories.map((c) => ({
        ...c,
        children: [],
        _sortPos: Number(c.pos_num || c.menu_order || c.position || 0),
      }));

      cloned.sort((a, b) => {
        const diff = a._sortPos - b._sortPos;
        if (diff !== 0) return diff;
        return (a.id || 0) - (b.id || 0);
      });

      const byId = new Map();
      const byKey = new Map();
      cloned.forEach((c) => byId.set(c.id, c));
      cloned.forEach((c) => {
        const k = keyOf(c);
        if (k) byKey.set(k, c);
      });

      const inferParentKey = (key) => {
        if (!key || key === mainKey) return "";
        let candidate = key;
        while (candidate.includes("-")) {
          candidate = candidate.substring(0, candidate.lastIndexOf("-"));
          if (candidate === mainKey) return "";
          if (byKey.has(candidate)) return candidate;
        }
        return "";
      };

      cloned.forEach((node) => {
        if (!node.parent || node.parent === 0) {
          const nodeKey = keyOf(node);
          const inferred = inferParentKey(nodeKey);
          if (inferred) {
            const parent = byKey.get(inferred);
            if (parent?.id) {
              node.parent = parent.id;
            }
          }
        }
      });

      const roots = [];
      for (const node of cloned) {
        if (node.parent && byId.has(node.parent)) {
          byId.get(node.parent).children.push(node);
        } else {
          roots.push(node);
        }
      }

      const root = cloned.find((r) => keyOf(r) === mainKey);
      menuItems = root ? root.children : [];
    } else {
      menuItems = [];
    }
  }

  function handleSelect(event) {
    dispatch("select", event.detail);
  }
</script>

<div class="tree-root">
  {#each menuItems as item (item.id)}
    <TreeItem
      {item}
      {language}
      {selectedKey}
      on:select={handleSelect}
    />
  {/each}
</div>