// Renders ```mermaid code blocks on the TypeDoc site as diagrams.
//
// TypeDoc emits a mermaid fence as <pre><code class="mermaid">…</code></pre> with the
// source HTML-escaped. This script swaps each one for <pre class="mermaid"> holding the
// raw source, then runs Mermaid 11 from jsDelivr. GitHub renders the same fences
// natively, so docs/HLD.md and README.md need nothing extra there.
// Loaded through the `customJs` option in typedoc.json.
(() => {
    const MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

    function mermaidTheme() {
        // TypeDoc stores the reader's choice as "os", "light" or "dark".
        const setting = document.documentElement.dataset.theme;
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const dark = setting === "dark" || (setting !== "light" && prefersDark);
        return dark ? "dark" : "neutral";
    }

    async function render() {
        const blocks = document.querySelectorAll("pre > code.mermaid, pre > code.language-mermaid");
        if (blocks.length === 0) {
            return;
        }

        const nodes = [];
        for (const code of blocks) {
            const graph = document.createElement("pre");
            graph.className = "mermaid";
            graph.style.textAlign = "center";
            graph.textContent = code.textContent;
            code.parentElement.replaceWith(graph);
            nodes.push(graph);
        }

        const { default: mermaid } = await import(MERMAID_URL);
        mermaid.initialize({ startOnLoad: false, theme: mermaidTheme(), securityLevel: "strict" });
        await mermaid.run({ nodes });
    }

    // TypeDoc keeps <body> hidden until its own script has loaded. Mermaid measures text
    // while laying out, so wait for the page to be visible (or give up waiting after 3 s).
    function whenVisible(callback) {
        const startedAt = Date.now();
        const check = () => {
            if (document.body.style.display !== "none" || Date.now() - startedAt > 3000) {
                callback();
            } else {
                setTimeout(check, 50);
            }
        };
        check();
    }

    function start() {
        whenVisible(() => {
            render().catch((error) => console.error("[mermaid] diagram rendering failed", error));
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
