/* -------------------------------------------------------
   Programovanie vzorov – Teacher index page scaffold
   Fixes:
   - Pattern UI grouped: Konštantné + Rastúce (no broken grid)
   - Image upload A/B/C with enforced filenames: taskName0-2.png
   - Canvas preview in editor (live)
   - Safer init + no auto-open overlay
   - Python template stub per task (later we’ll finalize)
------------------------------------------------------- */

(function () {
    "use strict";

    /* ---------------- State ---------------- */

    const state = {
        project: {
            version: 1,
            tasks: [
                {
                    id: crypto.randomUUID(),
                    name: "Kruhy",
                    patternType: "AB",
                    patternMode: "constant", // "constant" | "growing"
                    beforeAfterEnabled: false,
                    beforeAfterSymbol: "A",
                    repeatCount: 4,
                    missingCount: 0,
                    xDist: 25,
                    images: {
                        A: { fileName: "kruhy0.png", dataUrl: null },
                        B: { fileName: "kruhy1.png", dataUrl: null },
                        C: { fileName: "kruhy2.png", dataUrl: null },
                    },
                    previewPngDataUrl: null,
                    pythonText: null,
                },
            ],
        },
    };

    /* ---------------- Elements ---------------- */

    const els = {
        // index
        tasksRoot: document.getElementById("tasksRoot"),
        emptyState: document.getElementById("emptyState"),
        tpl: document.getElementById("taskRowTpl"),
        btnAdd: document.getElementById("btnAdd"),
        btnLoad: document.getElementById("btnLoad"),
        btnSave: document.getElementById("btnSave"),
        btnExport: document.getElementById("btnExport"),
        fileLoad: document.getElementById("fileLoad"),

        // editor overlay
        editorOverlay: document.getElementById("editorOverlay"),
        btnEditorClose: document.getElementById("btnEditorClose"),
        inpTaskName: document.getElementById("inpTaskName"),
        patternRadioRoot: document.getElementById("patternRadioRoot"),
        chkBeforeAfter: document.getElementById("chkBeforeAfter"),
        segBeforeAfterSymbol: document.getElementById("segBeforeAfterSymbol"),
        inpRepeat: document.getElementById("inpRepeat"),
        inpMissing: document.getElementById("inpMissing"),
        inpXdist: document.getElementById("inpXdist"),
        btnRandom: document.getElementById("btnRandom"),
        btnDone: document.getElementById("btnDone"),
    };

    // Right card: image pickers (existing HTML structure)
    // We’ll find 3 rows (A/B/C) in editor and wire buttons to hidden file inputs.
    const picker = {
        rows: [],
        inputs: { A: null, B: null, C: null },
        buttons: { A: null, B: null, C: null },
        fileLabels: { A: null, B: null, C: null },
    };

    // Canvas preview
    let previewCanvas = null;
    let previewCtx = null;

    /* ---------------- Patterns ---------------- */

    // Konštantné
    const PATTERNS_CONSTANT = [
        { id: "AB", label: "AB" },
        { id: "ABA", label: "ABA" },
        { id: "ABB", label: "ABB" },
        { id: "ABAAB", label: "ABAAB" },
        { id: "ABABA", label: "ABABA" },
    ];

    // Rastúce (label s …, id bez bodiek)
    const PATTERNS_GROWING = [
        { id: "ABAAB", label: "ABAAB…" },
        { id: "ABABB", label: "ABABB…" },
        { id: "ABAABB", label: "ABAABB…" },
    ];

    function getPatternById(id, mode) {
        const list = mode === "growing" ? PATTERNS_GROWING : PATTERNS_CONSTANT;
        return list.find((p) => p.id === id) || null;
    }

    /* ---------------- Editor model ---------------- */

    const editor = {
        mode: "create", // "create" | "edit"
        editingId: null,
        data: null, // draft object
    };

    function getDefaultTaskDraft() {
        return {
            name: "",
            patternType: "AB",
            patternMode: "constant",
            beforeAfterEnabled: false,
            beforeAfterSymbol: "A",
            repeatCount: 4,
            missingCount: 0,
            xDist: 25,
            images: {
                A: { fileName: "", dataUrl: null },
                B: { fileName: "", dataUrl: null },
                C: { fileName: "", dataUrl: null },
            },
        };
    }

    /* ---------------- Utils ---------------- */

    function clampInt(v, min, max, fallback) {
        const n = Number.parseInt(v, 10);
        if (Number.isNaN(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    }

    // remove diacritics, spaces, weird chars; keep a-z0-9_-; lowercase
    function sanitizeBaseName(name) {
        const raw = (name || "").trim();
        if (!raw) return "zadanie";
        // remove diacritics
        const noDia = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        // make safe
        const safe = noDia
            .toLowerCase()
            .replace(/\s+/g, "")        // remove spaces (or change to "_" if you prefer)
            .replace(/[^a-z0-9_-]/g, "");
        return safe || "zadanie";
    }

    function ensureImageFileNamesFromTaskName(draft) {
        const base = sanitizeBaseName(draft.name);
        draft.images.A.fileName = `${base}0.png`;
        draft.images.B.fileName = `${base}1.png`;
        draft.images.C.fileName = `${base}2.png`;
    }

    function debounce(fn, ms = 120) {
        let t = null;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    }

    /* ---------------- Overlay ---------------- */

    function showOverlay(on) {
        if (!els.editorOverlay) return;
        els.editorOverlay.hidden = !on;
        document.body.style.overflow = on ? "hidden" : "";
    }

    /* ---------------- Index rendering ---------------- */

    function renderFileChips(container, task) {
        container.innerHTML = "";

        const make = (label, value, variant) => {
            const el = document.createElement("span");
            el.className = `chip chip--${variant}`;
            el.textContent = `${label}: ${value || "-"}`;
            container.appendChild(el);
        };

        make("A", task.images?.A?.fileName, "orange");
        make("B", task.images?.B?.fileName, "yellow");
        if (task.images?.C?.fileName) make("C", task.images?.C?.fileName, "sky");
    }

    function renderIndex() {
        const tasks = state.project.tasks;

        els.tasksRoot.innerHTML = "";
        els.emptyState.hidden = tasks.length !== 0;

        for (const t of tasks) {
            const node = els.tpl.content.firstElementChild.cloneNode(true);
            node.dataset.id = t.id;

            node.querySelector(".task__name").textContent = t.name || "Bez názvu";

// pattern chip (above buttons)
            const modeLabel = t.patternMode === "growing" ? "rastúci" : "konštantný";
            const p = getPatternById(t.patternType, t.patternMode);
            const label = p?.label ?? t.patternType ?? "-";
            node.querySelector(".task__pattern").textContent = `Vzor: ${label} (${modeLabel})`;

// preview strip
            const previewEl = node.querySelector(".task__preview");
            previewEl.innerHTML = "";
            if (t.previewPngDataUrl) {
                const img = document.createElement("img");
                img.src = t.previewPngDataUrl;
                img.alt = `Ukážka – ${t.name}`;
                previewEl.appendChild(img);
            } else {
                const hint = document.createElement("div");
                hint.className = "preview__placeholder";
                hint.textContent = "Ukážka sa zobrazí po uložení (Hotovo).";
                previewEl.appendChild(hint);
            }


            // actions
            node.querySelector(".task__edit").addEventListener("click", () => onEditTask(t.id));
            node.querySelector(".task__delete").addEventListener("click", () => onDeleteTask(t.id));

            wireDragAndDrop(node);
            els.tasksRoot.appendChild(node);
        }
    }


    /* ---------------- Actions ---------------- */

    function onAddTask() {
        openEditorCreate();
    }

    function onEditTask(taskId) {
        openEditorEdit(taskId);
    }

    function onDeleteTask(taskId) {
        const idx = state.project.tasks.findIndex((t) => t.id === taskId);
        if (idx === -1) return;
        const name = state.project.tasks[idx].name || "zadanie";
        const ok = confirm(`Naozaj chceš zrušiť "${name}"?`);
        if (!ok) return;
        state.project.tasks.splice(idx, 1);
        renderIndex();
    }

    /* ---------------- Save / Load / Export ---------------- */

    function downloadJson(filename, obj) {
        const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function onSaveProject() {
        // NOTE: dataUrl can be huge; you can later strip it for saving if needed
        downloadJson("vzory_project.json", state.project);
    }

    function onLoadProjectClick() {
        els.fileLoad.value = "";
        els.fileLoad.click();
    }

    async function onLoadProjectFile(file) {
        const text = await file.text();
        const parsed = JSON.parse(text);

        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.tasks)) {
            alert("Neplatný súbor projektu (očakávam JSON s tasks: []).");
            return;
        }

        state.project = {
            version: Number(parsed.version || 1),
            tasks: parsed.tasks.map((t) => ({
                id: t.id || crypto.randomUUID(),
                name: t.name || "",
                patternType: t.patternType || "AB",
                patternMode: t.patternMode === "growing" ? "growing" : "constant",
                beforeAfterEnabled: !!t.beforeAfterEnabled,
                beforeAfterSymbol: t.beforeAfterSymbol || "A",
                repeatCount: Number(t.repeatCount ?? 4),
                missingCount: Number(t.missingCount ?? 0),
                xDist: Number(t.xDist ?? 25),
                images: {
                    A: { fileName: t.images?.A?.fileName || "", dataUrl: t.images?.A?.dataUrl || null },
                    B: { fileName: t.images?.B?.fileName || "", dataUrl: t.images?.B?.dataUrl || null },
                    C: { fileName: t.images?.C?.fileName || "", dataUrl: t.images?.C?.dataUrl || null },
                },
                previewPngDataUrl: t.previewPngDataUrl || null,
                pythonText: t.pythonText || null,
            })),
        };

        renderIndex();
    }

    function onExport() {
        alert("Ďalší krok: Export ZIP (student.html + PNG + PY + images).");
    }

    /* ---------------- Drag & drop reorder ---------------- */

    let dragSrcId = null;

    function wireDragAndDrop(taskEl) {
        taskEl.addEventListener("dragstart", (e) => {
            dragSrcId = taskEl.dataset.id;
            taskEl.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
        });

        taskEl.addEventListener("dragend", () => {
            taskEl.classList.remove("dragging");
            dragSrcId = null;
        });

        taskEl.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
        });

        taskEl.addEventListener("drop", (e) => {
            e.preventDefault();
            const targetId = taskEl.dataset.id;
            if (!dragSrcId || dragSrcId === targetId) return;

            const srcIndex = state.project.tasks.findIndex((t) => t.id === dragSrcId);
            const targetIndex = state.project.tasks.findIndex((t) => t.id === targetId);
            if (srcIndex === -1 || targetIndex === -1) return;

            const [moved] = state.project.tasks.splice(srcIndex, 1);
            state.project.tasks.splice(targetIndex, 0, moved);

            renderIndex();
        });
    }

    /* ---------------- Editor: open/mount/read/save ---------------- */

    function openEditorCreate() {
        editor.mode = "create";
        editor.editingId = null;
        editor.data = getDefaultTaskDraft();
        mountEditor();
        showOverlay(true);
    }

    function openEditorEdit(taskId) {
        const t = state.project.tasks.find((x) => x.id === taskId);
        if (!t) return;

        editor.mode = "edit";
        editor.editingId = taskId;

        editor.data = {
            name: t.name || "",
            patternType: t.patternType || "AB",
            patternMode: t.patternMode === "growing" ? "growing" : "constant",
            beforeAfterEnabled: !!t.beforeAfterEnabled,
            beforeAfterSymbol: t.beforeAfterSymbol || "A",
            repeatCount: Number(t.repeatCount ?? 4),
            missingCount: Number(t.missingCount ?? 0),
            xDist: Number(t.xDist ?? 25),
            images: {
                A: { fileName: t.images?.A?.fileName || "", dataUrl: t.images?.A?.dataUrl || null },
                B: { fileName: t.images?.B?.fileName || "", dataUrl: t.images?.B?.dataUrl || null },
                C: { fileName: t.images?.C?.fileName || "", dataUrl: t.images?.C?.dataUrl || null },
            },
        };

        mountEditor();
        showOverlay(true);
    }

    function mountEditor() {
        // title
        const titleEl = document.getElementById("editorTitle");
        if (titleEl) {
            titleEl.textContent = editor.mode === "edit" ? "Upraviť zadanie" : "Nové zadanie";
        }

        // Ensure filenames follow rule immediately
        ensureImageFileNamesFromTaskName(editor.data);

        // fields
        els.inpTaskName.value = editor.data.name;
        els.chkBeforeAfter.checked = editor.data.beforeAfterEnabled;
        els.inpRepeat.value = editor.data.repeatCount;
        els.inpMissing.value = editor.data.missingCount;
        els.inpXdist.value = editor.data.xDist;

        // IMPORTANT:
        // patternRadioRoot in HTML currently has class "radioGrid".
        // That breaks grouping. We convert it into a normal container.
        els.patternRadioRoot.classList.remove("radioGrid");
        els.patternRadioRoot.innerHTML = "";
        els.patternRadioRoot.style.display = "block";

        // If current type doesn't exist in selected mode -> fallback
        if (!getPatternById(editor.data.patternType, editor.data.patternMode)) {
            editor.data.patternMode = "constant";
            editor.data.patternType = "AB";
        }

        buildPatternGroupsUI();

        // segment
        setSegValue(editor.data.beforeAfterSymbol);
        updateBeforeAfterUI();

        // image picker UI
        setupImagePickersIfNeeded();
        refreshImagePickerLabels();

        // preview canvas
        setupPreviewCanvasIfNeeded();
        renderEditorPreview();
    }

    function buildPatternGroupsUI() {
        const container = els.patternRadioRoot;

        const title = document.createElement("div");
        title.className = "field__label";
        title.textContent = "Typ vzoru";
        // In your HTML there is already "Typ vzoru" label above,
        // so we DON'T add another title here.

        const buildGroup = (groupName, list, mode) => {
            const h = document.createElement("div");
            h.className = "field__label";
            h.textContent = groupName;
            h.style.marginTop = "6px";

            const grid = document.createElement("div");
            grid.className = "radioGrid";
            grid.style.marginTop = "6px";

            list.forEach((p) => {
                const wrap = document.createElement("label");
                wrap.className = "radio";

                const checked = p.id === editor.data.patternType && editor.data.patternMode === mode;

                wrap.innerHTML = `
          <input
            type="radio"
            name="patternType"
            value="${p.id}"
            data-mode="${mode}"
            ${checked ? "checked" : ""}
          />
          <span class="radio__box">${p.label}</span>
        `;

                grid.appendChild(wrap);
            });

            container.appendChild(h);
            container.appendChild(grid);
        };

        buildGroup("Konštantné", PATTERNS_CONSTANT, "constant");
        buildGroup("Rastúce", PATTERNS_GROWING, "growing");
    }

    function readEditorIntoDraft() {
        editor.data.name = els.inpTaskName.value.trim();

        // enforce filenames from name (rule: taskName0..2.png)
        ensureImageFileNamesFromTaskName(editor.data);

        editor.data.beforeAfterEnabled = els.chkBeforeAfter.checked;

        const checked = els.patternRadioRoot.querySelector('input[name="patternType"]:checked');
        if (checked) {
            editor.data.patternType = checked.value || "AB";
            editor.data.patternMode = checked.dataset.mode === "growing" ? "growing" : "constant";
        } else {
            editor.data.patternType = "AB";
            editor.data.patternMode = "constant";
        }

        editor.data.repeatCount = clampInt(els.inpRepeat.value, 1, 999, 4);
        editor.data.missingCount = clampInt(els.inpMissing.value, 0, 999, 0);
        editor.data.xDist = clampInt(els.inpXdist.value, 1, 999, 25);

        const activeSeg = els.segBeforeAfterSymbol.querySelector(".seg__btn.is-active");
        editor.data.beforeAfterSymbol = activeSeg?.dataset?.val || "A";
    }

    function saveEditor() {
        readEditorIntoDraft();

        if (!editor.data.name) {
            alert("Prosím zadaj meno zadania.");
            els.inpTaskName.focus();
            return;
        }

        // generate python template stub now (later we make it proper)
        const pythonText = generatePythonTemplate(editor.data);

        if (editor.mode === "create") {
            state.project.tasks.unshift({
                id: crypto.randomUUID(),
                name: editor.data.name,
                patternType: editor.data.patternType,
                patternMode: editor.data.patternMode,
                beforeAfterEnabled: editor.data.beforeAfterEnabled,
                beforeAfterSymbol: editor.data.beforeAfterSymbol,
                repeatCount: editor.data.repeatCount,
                missingCount: editor.data.missingCount,
                xDist: editor.data.xDist,
                images: {
                    A: { fileName: editor.data.images.A.fileName, dataUrl: editor.data.images.A.dataUrl || null },
                    B: { fileName: editor.data.images.B.fileName, dataUrl: editor.data.images.B.dataUrl || null },
                    C: { fileName: editor.data.images.C.fileName, dataUrl: editor.data.images.C.dataUrl || null },
                },
                previewPngDataUrl: snapshotPreviewAsDataUrl(), // store preview image
                pythonText,
            });
        } else {
            const t = state.project.tasks.find((x) => x.id === editor.editingId);
            if (!t) return;

            Object.assign(t, {
                name: editor.data.name,
                patternType: editor.data.patternType,
                patternMode: editor.data.patternMode,
                beforeAfterEnabled: editor.data.beforeAfterEnabled,
                beforeAfterSymbol: editor.data.beforeAfterSymbol,
                repeatCount: editor.data.repeatCount,
                missingCount: editor.data.missingCount,
                xDist: editor.data.xDist,
                images: {
                    A: { fileName: editor.data.images.A.fileName, dataUrl: editor.data.images.A.dataUrl || null },
                    B: { fileName: editor.data.images.B.fileName, dataUrl: editor.data.images.B.dataUrl || null },
                    C: { fileName: editor.data.images.C.fileName, dataUrl: editor.data.images.C.dataUrl || null },
                },
                previewPngDataUrl: snapshotPreviewAsDataUrl(),
                pythonText,
            });
        }

        showOverlay(false);
        renderIndex();
    }

    /* ---------------- Before/after controls ---------------- */

    function setSegValue(val) {
        els.segBeforeAfterSymbol.querySelectorAll(".seg__btn").forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.val === val);
        });
    }

    function updateBeforeAfterUI() {
        const enabled = els.chkBeforeAfter.checked;
        els.segBeforeAfterSymbol.style.opacity = enabled ? "1" : ".45";
        els.segBeforeAfterSymbol.style.pointerEvents = enabled ? "auto" : "none";
    }

    function applyRandomSettings() {
        // mode first
        editor.data.patternMode = Math.random() < 0.5 ? "constant" : "growing";
        const list = editor.data.patternMode === "growing" ? PATTERNS_GROWING : PATTERNS_CONSTANT;
        const rnd = list[Math.floor(Math.random() * list.length)];
        editor.data.patternType = rnd?.id || "AB";

        editor.data.beforeAfterEnabled = Math.random() < 0.5;
        editor.data.beforeAfterSymbol = ["A", "B", "C"][Math.floor(Math.random() * 3)];

        // random reasonable numbers
        editor.data.repeatCount = clampInt(String(Math.floor(Math.random() * 7) + 3), 1, 999, 4);
        editor.data.missingCount = clampInt(String(Math.floor(Math.random() * 3)), 0, 999, 0);
        editor.data.xDist = clampInt(String([20, 25, 30, 35][Math.floor(Math.random() * 4)]), 1, 999, 25);

        mountEditor();
    }

    /* ---------------- Image upload A/B/C ---------------- */

    function setupImagePickersIfNeeded() {
        if (picker.rows.length) return;

        // Find the 3 rows in the "imgPickers" section (right card)
        // Structure in your HTML:
        // <div class="imgRow">
        //   <span class="imgTag ...">A</span>
        //   <button ...>Vyber obrázok A</button>
        //   <span class="imgFile muted">—</span>
        // </div>
        const rightCard = els.editorOverlay?.querySelector(".imgPickers");
        if (!rightCard) return;

        picker.rows = Array.from(rightCard.querySelectorAll(".imgRow"));
        const map = { 0: "A", 1: "B", 2: "C" };

        picker.rows.forEach((row, idx) => {
            const slot = map[idx];
            if (!slot) return;

            const btn = row.querySelector("button");
            const fileLabel = row.querySelector(".imgFile");
            if (!btn || !fileLabel) return;

            btn.disabled = false; // enable

            // create hidden input
            const inp = document.createElement("input");
            inp.type = "file";
            inp.accept = "image/png";
            inp.style.display = "none";

            inp.addEventListener("change", async () => {
                const file = inp.files?.[0];
                if (!file) return;

                // force PNG naming rule (we store "virtual filename" in state; file itself can be anything)
                ensureImageFileNamesFromTaskName(editor.data);

                const dataUrl = await readFileAsDataUrl(file);
                editor.data.images[slot].dataUrl = dataUrl;

                refreshImagePickerLabels();
                renderEditorPreview();
            });

            btn.addEventListener("click", () => {
                // if name empty, force user first (so filenames are correct)
                const nm = (els.inpTaskName.value || "").trim();
                if (!nm) {
                    alert("Najprv zadaj meno zadania (kvôli názvom súborov).");
                    els.inpTaskName.focus();
                    return;
                }
                // sync name immediately
                editor.data.name = nm;
                ensureImageFileNamesFromTaskName(editor.data);
                refreshImagePickerLabels();
                inp.value = "";
                inp.click();
            });

            row.appendChild(inp);

            picker.inputs[slot] = inp;
            picker.buttons[slot] = btn;
            picker.fileLabels[slot] = fileLabel;
        });
    }

    function refreshImagePickerLabels() {
        if (!picker.fileLabels.A) return;

        // Show enforced filenames and whether uploaded
        ensureImageFileNamesFromTaskName(editor.data);

        ["A", "B", "C"].forEach((slot) => {
            const lbl = picker.fileLabels[slot];
            if (!lbl) return;
            const fn = editor.data.images?.[slot]?.fileName || "—";
            const ok = !!editor.data.images?.[slot]?.dataUrl;
            lbl.textContent = ok ? fn : "—";
            lbl.classList.toggle("muted", !ok);
        });
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = reject;
            r.readAsDataURL(file);
        });
    }

    /* ---------------- Canvas Preview ---------------- */

    function setupPreviewCanvasIfNeeded() {
        if (previewCanvas) return;

        const box = els.editorOverlay?.querySelector(".previewBox");
        if (!box) return;

        box.innerHTML = ""; // replace hint
        previewCanvas = document.createElement("canvas");
        previewCanvas.width = 1400;
        previewCanvas.height = 260;
        previewCanvas.style.width = "100%";
        previewCanvas.style.height = "100%";
        previewCanvas.style.borderRadius = "16px";
        previewCanvas.style.display = "block";

        box.appendChild(previewCanvas);
        previewCtx = previewCanvas.getContext("2d");
    }

    function snapshotPreviewAsDataUrl() {
        if (!previewCanvas) return null;
        try {
            return previewCanvas.toDataURL("image/png");
        } catch {
            return null;
        }
    }

    // Build sequence of symbols to draw based on settings
    function buildSymbolSequence(draft) {
        const base = (draft.patternType || "AB").trim();
        const repeat = Math.max(1, Number(draft.repeatCount || 1));
        const missing = Math.max(0, Number(draft.missingCount || 0));

        let seq = [];

        if (draft.patternMode === "growing") {
            // Growing: segments 1..repeat from the base pattern
            // Example base=ABAAB, repeat=5 => A, AB, ABA, ABAA, ABAAB
            for (let i = 1; i <= repeat; i++) {
                const part = base.slice(0, Math.min(base.length, i));
                seq.push(...part.split(""));
            }
        } else {
            // Constant: repeat the base pattern 'repeat' times
            for (let i = 0; i < repeat; i++) {
                seq.push(...base.split(""));
            }
        }

        // Before/after symbol (one at start and one at end)
        if (draft.beforeAfterEnabled) {
            const s = draft.beforeAfterSymbol || "A";
            seq = [s, ...seq, s];
        }

        // Missing: remove last N symbols (simple & deterministic)
        if (missing > 0) {
            seq = seq.slice(0, Math.max(0, seq.length - missing));
        }

        // Keep only A/B/C
        seq = seq.filter((c) => c === "A" || c === "B" || c === "C");

        return seq;
    }

    // draw either uploaded image or placeholder tile
    async function drawTile(ctx, x, y, size, symbol, draft) {
        const slot = symbol; // A/B/C
        const dataUrl = draft.images?.[slot]?.dataUrl;

        if (dataUrl) {
            const img = await loadImage(dataUrl);
            ctx.drawImage(img, x, y, size, size);
            return;
        }

        // Placeholder (nice rounded square + letter)
        ctx.save();
        ctx.globalAlpha = 0.9;

        roundRect(ctx, x, y, size, size, 10);
        ctx.fillStyle = "rgba(255,255,255,.85)";
        ctx.fill();
        ctx.strokeStyle = "rgba(19,32,51,.14)";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "rgba(19,32,51,.75)";
        ctx.font = "700 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(symbol, x + size / 2, y + size / 2);

        ctx.restore();
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    function roundRect(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
    }

    const renderEditorPreview = debounce(async function () {
        if (!previewCtx || !previewCanvas) return;

        // sync draft from inputs without committing to task yet
        readEditorIntoDraft();
        refreshImagePickerLabels();

        const ctx = previewCtx;
        const w = previewCanvas.width;
        const h = previewCanvas.height;

        // clear
        ctx.clearRect(0, 0, w, h);

        // background
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.70)";
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        // info line
        const p = getPatternById(editor.data.patternType, editor.data.patternMode);
        const modeLabel = editor.data.patternMode === "growing" ? "Rastúce" : "Konštantné";
        const label = p?.label || editor.data.patternType;

        ctx.fillStyle = "rgba(19,32,51,.70)";
        ctx.font = "700 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`${modeLabel}: ${label}`, 18, 14);

        // sequence
        const seq = buildSymbolSequence(editor.data);
        const size = 44;
        const gap = clampInt(String(editor.data.xDist), 8, 160, 25);

        // layout: wrap to next line if needed
        let x = 18;
        let y = 46;
        const lineH = size + 16;

        for (let i = 0; i < seq.length; i++) {
            if (x + size > w - 18) {
                x = 18;
                y += lineH;
                if (y + size > h - 12) break; // stop if no space
            }
            await drawTile(ctx, x, y, size, seq[i], editor.data);
            x += size + gap;
        }
    }, 80);

    /* ---------------- Python template stub ---------------- */

    function generatePythonTemplate(draft) {
        // Later we’ll make the full “student template” with TODO sections.
        // For now: basic Tkinter scaffold + filenames following your rule.
        const base = sanitizeBaseName(draft.name);
        const fnA = `${base}0.png`;
        const fnB = `${base}1.png`;
        const fnC = `${base}2.png`;

        return [
            "import tkinter",
            "",
            "canvas = tkinter.Canvas(width=800, height=260, bg='white')",
            "canvas.pack()",
            "",
            "# TODO: nastav si velkost obrazkov",
            "S = 50",
            "",
            "# nacitanie obrazkov (musia byt v rovnakom priecinku)",
            `imgA = tkinter.PhotoImage(file='${fnA}')`,
            `imgB = tkinter.PhotoImage(file='${fnB}')`,
            `imgC = tkinter.PhotoImage(file='${fnC}')`,
            "",
            "# TODO: dopln program, ktory vykresli vzor podla zadania",
            "# Tip: pouzi canvas.create_image(x, y, image=imgA, anchor='nw')",
            "",
            "tkinter.mainloop()",
            "",
        ].join("\n");
    }

    /* ---------------- Wire events ---------------- */

    function wireEditorLivePreviewEvents() {
        // any change triggers preview update
        els.inpTaskName.addEventListener("input", () => {
            // keep filenames always matching name
            editor.data.name = els.inpTaskName.value.trim();
            ensureImageFileNamesFromTaskName(editor.data);
            refreshImagePickerLabels();
            renderEditorPreview();
        });

        els.patternRadioRoot.addEventListener("change", () => {
            renderEditorPreview();
        });

        els.chkBeforeAfter.addEventListener("change", () => {
            updateBeforeAfterUI();
            renderEditorPreview();
        });

        els.inpRepeat.addEventListener("input", renderEditorPreview);
        els.inpMissing.addEventListener("input", renderEditorPreview);
        els.inpXdist.addEventListener("input", renderEditorPreview);

        els.segBeforeAfterSymbol.addEventListener("click", (e) => {
            const btn = e.target.closest(".seg__btn");
            if (!btn) return;
            setSegValue(btn.dataset.val);
            renderEditorPreview();
        });
    }

    function wireEvents() {
        // index buttons
        els.btnAdd.addEventListener("click", onAddTask);
        els.btnSave.addEventListener("click", onSaveProject);
        els.btnLoad.addEventListener("click", onLoadProjectClick);
        els.btnExport.addEventListener("click", onExport);

        // load project
        els.fileLoad.addEventListener("change", (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            onLoadProjectFile(file).catch((err) => {
                console.error(err);
                alert("Nepodarilo sa načítať projekt.");
            });
        });

        // editor close
        els.btnEditorClose.addEventListener("click", () => showOverlay(false));
        els.editorOverlay.addEventListener("click", (e) => {
            if (e.target.classList.contains("overlay__backdrop")) showOverlay(false);
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && els.editorOverlay && !els.editorOverlay.hidden) {
                showOverlay(false);
            }
        });

        // editor action buttons
        els.btnRandom.addEventListener("click", applyRandomSettings);
        els.btnDone.addEventListener("click", saveEditor);

        // live preview
        wireEditorLivePreviewEvents();
    }

    /* ---------------- Init ---------------- */

    function assertElements() {
        const required = [
            "tasksRoot",
            "emptyState",
            "tpl",
            "btnAdd",
            "btnLoad",
            "btnSave",
            "btnExport",
            "fileLoad",
            "editorOverlay",
            "btnEditorClose",
            "inpTaskName",
            "patternRadioRoot",
            "chkBeforeAfter",
            "segBeforeAfterSymbol",
            "inpRepeat",
            "inpMissing",
            "inpXdist",
            "btnRandom",
            "btnDone",
        ];
        for (const k of required) {
            if (!els[k]) {
                throw new Error(`Missing element #${k} in DOM`);
            }
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        try {
            assertElements();

            // ensure overlay is CLOSED on load no matter what
            showOverlay(false);

            wireEvents();
            renderIndex();
        } catch (err) {
            console.error(err);
            alert("Chyba pri inicializácii. Pozri konzolu (Console).");
        }
    });
})();
