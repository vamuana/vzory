(() => {
    "use strict";

    // =============== DOM ===============
    const root = document.getElementById("studentRoot");
    const dataEl = document.getElementById("tasksData");
    const btnDownloadAll = document.getElementById("btnDownloadAll");

    // =============== Pomocné funkcie ===============

    // Bezpečný base názov (na názvy súborov)
    function sanitizeBaseName(name) {
        const raw = (name || "").trim();
        if (!raw) return "zadanie";
        const noDia = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const safe = noDia.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9_-]/g, "");
        return safe || "zadanie";
    }

    // Stiahni textový súbor
    function downloadText(filename, text) {
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Stiahni dataURL ako súbor
    function downloadDataUrl(filename, dataUrl) {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = filename;
        a.click();
    }

    // dataURL -> bytes (pre ZIP)
    function dataUrlToUint8Array(dataUrl) {
        const parts = String(dataUrl).split(",");
        const meta = parts[0] || "";
        const b64 = parts[1] || "";
        if (!meta.includes("base64")) {
            const txt = decodeURIComponent(b64);
            return new TextEncoder().encode(txt);
        }
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }

    // Stiahni všetko – ZIP ak je JSZip, inak jednotlivo
    async function downloadAllZip(tasks) {
        if (typeof window.JSZip !== "undefined") {
            const zip = new window.JSZip();
            const folderImgs = zip.folder("images");
            const folderPy = zip.folder("templates");

            tasks.forEach((t, idx) => {
                const base = sanitizeBaseName(t.name || ("zadanie" + (idx + 1)));

                // python
                folderPy.file(base + ".py", t.pythonText || "");

                // images
                for (const slot of ["A", "B", "C"]) {
                    const meta = t.images?.[slot];
                    if (!meta?.dataUrl) continue;
                    const bytes = dataUrlToUint8Array(meta.dataUrl);
                    const fallback = base + (slot === "A" ? "0" : slot === "B" ? "1" : "2") + ".png";
                    folderImgs.file(meta.fileName || fallback, bytes, { binary: true });
                }
            });

            const blob = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "programovanie_vzorov_vsetko.zip";
            a.click();
            URL.revokeObjectURL(url);
            return;
        }

        // fallback: jednotlivo
        tasks.forEach((t, idx) => {
            const base = sanitizeBaseName(t.name || ("zadanie" + (idx + 1)));
            downloadText(base + ".py", t.pythonText || "");
            for (const slot of ["A", "B", "C"]) {
                const meta = t.images?.[slot];
                if (!meta?.dataUrl) continue;
                const name = meta.fileName || (base + (slot === "A" ? "0" : slot === "B" ? "1" : "2") + ".png");
                downloadDataUrl(name, meta.dataUrl);
            }
        });
    }

    // Sekvencia bez missing
    function buildSymbolSequenceWithoutMissing(t) {
        const base = String(t.patternType || "AB").trim();
        const repeat = Math.max(1, Number(t.repeatCount || 1));
        let seq = [];

        if (t.patternMode === "growing") {
            for (let i = 1; i <= repeat; i++) {
                const part = base.slice(0, Math.min(base.length, i));
                seq.push(...part.split(""));
            }
        } else {
            for (let i = 0; i < repeat; i++) {
                seq.push(...base.split(""));
            }
        }

        if (t.beforeAfterEnabled) {
            const s = t.beforeAfterSymbol || "A";
            seq = [s, ...seq, s];
        }

        return seq.map(c => (c === "A" || c === "B" || c === "C") ? c : null);
    }

    // Sekvencia s missing podľa missingIndices
    function buildSymbolSequence(t) {
        const seq = buildSymbolSequenceWithoutMissing(t);
        const holes = new Set(Array.isArray(t.missingIndices) ? t.missingIndices : []);
        return seq.map((v, i) => (holes.has(i) ? null : v));
    }

    // Vytvorí jeden tile (obrázok alebo prázdny placeholder)
    function tileFor(symbol, t) {
        if (symbol === null) {
            const div = document.createElement("div");
            div.className = "tileBlank";
            return div;
        }

        const embedded = t.images?.[symbol]?.dataUrl;
        const fn = t.images?.[symbol]?.fileName;

        const img = document.createElement("img");
        img.className = "tileImg";
        img.alt = symbol;

        if (embedded) {
            img.src = embedded;
            return img;
        }

        if (fn) {
            img.src = "./tasks/" + fn;
            return img;
        }

        const div = document.createElement("div");
        div.className = "tileBlank";
        return div;
    }

    // =============== Render ===============
    function render() {
        root.innerHTML = "";

        let payload = null;
        try {
            payload = JSON.parse(dataEl.textContent || "{}");
        } catch (_) {
            payload = { tasks: [] };
        }

        const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];

        if (btnDownloadAll) {
            btnDownloadAll.onclick = () => {
                if (!tasks.length) return;
                downloadAllZip(tasks).catch(() => alert("Nepodarilo sa stiahnuť všetko."));
            };
        }

        tasks.forEach((t, idx) => {
            const card = document.createElement("div");
            card.className = "card";

            const head = document.createElement("div");
            head.className = "card__head";

            const titleRow = document.createElement("div");
            titleRow.className = "titleRow";

            const h = document.createElement("div");
            h.className = "taskTitle";
            h.textContent = t.name || ("Zadanie " + (idx + 1));

            const badge = document.createElement("span");
            badge.className = "badge";
            badge.textContent = "zadanie";

            titleRow.appendChild(h);
            titleRow.appendChild(badge);

            const actions = document.createElement("div");
            actions.className = "actions";

            const btnDl = document.createElement("button");
            btnDl.className = "btn btn--primary";
            btnDl.textContent = "stiahnuť kód";
            btnDl.addEventListener("click", () => {
                const base = sanitizeBaseName(t.name || ("zadanie" + (idx + 1)));
                downloadText(base + ".py", t.pythonText || "");
            });

            const btnToggle = document.createElement("button");
            btnToggle.className = "btn";
            btnToggle.textContent = "zobraziť kód";

            actions.appendChild(btnDl);
            actions.appendChild(btnToggle);

            head.appendChild(titleRow);
            head.appendChild(actions);

            // preview
            const preview = document.createElement("div");
            preview.className = "preview";
            const strip = document.createElement("div");
            strip.className = "strip";

            const seq = buildSymbolSequence(t);
            seq.forEach(sym => strip.appendChild(tileFor(sym, t)));
            preview.appendChild(strip);

            // code box
            const codeBox = document.createElement("div");
            codeBox.className = "codeBox";
            codeBox.hidden = true;

            const codeBar = document.createElement("div");
            codeBar.className = "codeBox__bar";

            const btnCopy = document.createElement("button");
            btnCopy.className = "btn";
            btnCopy.textContent = "skopírovať kód";
            btnCopy.addEventListener("click", async () => {
                try {
                    await navigator.clipboard.writeText(t.pythonText || "");
                    btnCopy.textContent = "skopírované ✓";
                    setTimeout(() => (btnCopy.textContent = "skopírovať kód"), 1200);
                } catch {
                    alert("Nepodarilo sa skopírovať. Skús označiť text ručne.");
                }
            });

            codeBar.appendChild(btnCopy);

            const pre = document.createElement("pre");
            pre.textContent = t.pythonText || "";

            codeBox.appendChild(codeBar);
            codeBox.appendChild(pre);

            btnToggle.addEventListener("click", () => {
                const show = codeBox.hidden;
                codeBox.hidden = !show;
                btnToggle.textContent = show ? "skryť kód" : "zobraziť kód";
            });

            card.appendChild(head);
            card.appendChild(preview);
            card.appendChild(codeBox);

            root.appendChild(card);
        });
    }

    render();
})();