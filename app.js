/* -------------------------------------------------------
   Programovanie vzorov – Učiteľ (app.js)

   ČO ROBÍ TENTO SÚBOR:
   - Správa projektu (zoznam zadaní) v pamäti
   - UI: render zoznamu zadaní, drag&drop poradie
   - Editor (overlay): vytvorenie/úprava zadania
   - Upload PNG obrázkov A/B/C (A a B nesmú byť rovnaké)
   - Canvas ukážka + uloženie náhľadu ako PNG (DataURL)
   - Uloženie/načítanie projektu do JSON
   - Export ZIP (žiacka verzia: student.html + student_app.js + student_styles.css + tasks/ súbory)
   - NOVÉ: vlastný vzor z reťazca A/B/C
------------------------------------------------------- */

(function () {
    "use strict";

    /* =======================================================
       1) STAV A DÁTA PROJEKTU
       ======================================================= */

    /** Stav aplikácie – tu držíme aktuálny projekt a všetky zadania. */
    const state = {
        project: {
            version: 2,
            tasks: [
                {
                    id: crypto.randomUUID(),
                    seed: crypto.randomUUID(),
                    name: "Kruhy",
                    patternType: "AB",
                    patternMode: "constant",
                    isCustomPattern: false,
                    customPattern: "",
                    beforeAfterEnabled: false,
                    beforeAfterSymbol: "A",
                    repeatCount: 4,
                    missingCount: 0,
                    missingIndices: [],
                    xDist: 25,
                    images: {
                        A: { fileName: "kruhy0.png", dataUrl: null, hash: null },
                        B: { fileName: "kruhy1.png", dataUrl: null, hash: null },
                        C: { fileName: "kruhy2.png", dataUrl: null, hash: null },
                    },
                    previewPngDataUrl: null,
                    pythonText: null,
                },
            ],
        },
    };

    /* =======================================================
       2) DOM ELEMENTY
       ======================================================= */

    const els = {
        // Index
        tasksRoot: document.getElementById("tasksRoot"),
        emptyState: document.getElementById("emptyState"),
        tpl: document.getElementById("taskRowTpl"),
        btnAdd: document.getElementById("btnAdd"),
        btnLoad: document.getElementById("btnLoad"),
        btnSave: document.getElementById("btnSave"),
        btnExport: document.getElementById("btnExport"),
        fileLoad: document.getElementById("fileLoad"),

        // Editor overlay
        editorOverlay: document.getElementById("editorOverlay"),
        btnEditorClose: document.getElementById("btnEditorClose"),
        inpTaskName: document.getElementById("inpTaskName"),
        patternRadioRoot: document.getElementById("patternRadioRoot"),
        inpCustomPattern: document.getElementById("inpCustomPattern"),
        customPatternField: document.getElementById("customPatternField"),
        chkBeforeAfter: document.getElementById("chkBeforeAfter"),
        segBeforeAfterSymbol: document.getElementById("segBeforeAfterSymbol"),
        inpRepeat: document.getElementById("inpRepeat"),
        inpMissing: document.getElementById("inpMissing"),
        inpXdist: document.getElementById("inpXdist"),
        btnRandom: document.getElementById("btnRandom"),
        btnDone: document.getElementById("btnDone"),
    };

    const picker = {
        rows: [],
        inputs: { A: null, B: null, C: null },
        buttons: { A: null, B: null, C: null },
        fileLabels: { A: null, B: null, C: null },
    };

    let previewCanvas = null;
    let previewCtx = null;

    /* =======================================================
       3) DEFINÍCIA VZOROV
       ======================================================= */

    const PATTERNS_CONSTANT = [
        { id: "AB", label: "AB" },
        { id: "ABA", label: "ABA" },
        { id: "ABB", label: "ABB" },
        { id: "ABAAB", label: "ABAAB" },
        { id: "ABABA", label: "ABABA" },
    ];

    const PATTERNS_GROWING = [
        { id: "ABAAB", label: "ABAAB…" },
        { id: "ABABB", label: "ABABB…" },
        { id: "ABAABB", label: "ABAABB…" },
    ];

    function getPatternById(id, mode) {
        const list = mode === "growing" ? PATTERNS_GROWING : PATTERNS_CONSTANT;
        return list.find((p) => p.id === id) || null;
    }

    /* =======================================================
       4) MODEL EDITORA (create/edit)
       ======================================================= */

    const editor = {
        mode: "create",
        editingId: null,
        data: null,
    };

    function getDefaultTaskDraft() {
        return {
            id: null,
            seed: crypto.randomUUID(),
            name: "",
            patternType: "AB",
            patternMode: "constant",
            isCustomPattern: false,
            customPattern: "",
            beforeAfterEnabled: false,
            beforeAfterSymbol: "A",
            repeatCount: 4,
            missingCount: 0,
            missingIndices: [],
            xDist: 25,
            images: {
                A: { fileName: "", dataUrl: null, hash: null },
                B: { fileName: "", dataUrl: null, hash: null },
                C: { fileName: "", dataUrl: null, hash: null },
            },
        };
    }

    /* =======================================================
       5) POMOCNÉ FUNKCIE (UTILS)
       ======================================================= */

    function clampInt(v, min, max, fallback) {
        const n = Number.parseInt(v, 10);
        if (Number.isNaN(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    }

    function sanitizeBaseName(name) {
        const raw = (name || "").trim();
        if (!raw) return "zadanie";
        const noDia = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const safe = noDia.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9_-]/g, "");
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

    function showOverlay(on) {
        if (!els.editorOverlay) return;
        els.editorOverlay.hidden = !on;
        document.body.style.overflow = on ? "hidden" : "";
    }

    function normalizeCustomPattern(value) {
        return String(value || "")
            .toUpperCase()
            .replace(/\s+/g, "")
            .replace(/[^ABC]/g, "");
    }

    function isValidCustomPattern(value) {
        return /^[ABC]+$/.test(String(value || ""));
    }

    function getEffectivePatternString(draft) {
        if (draft.isCustomPattern) {
            return normalizeCustomPattern(draft.customPattern) || "AB";
        }
        return (draft.patternType || "AB").trim();
    }

    function updateCustomPatternUI() {
        if (!els.customPatternField || !els.patternRadioRoot) return;
        const checked = els.patternRadioRoot.querySelector('input[name="patternType"]:checked');
        const isCustom = checked?.dataset?.custom === "true";
        els.customPatternField.style.display = isCustom ? "block" : "none";
    }

    /* =======================================================
       6) STABILNÉ “VYNECHANÉ” POZÍCIE (seeded)
       ======================================================= */

    function hashStringToU32(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function mulberry32(seed) {
        let t = seed >>> 0;
        return function () {
            t += 0x6d2b79f5;
            let x = Math.imul(t ^ (t >>> 15), 1 | t);
            x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
            return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
    }

    function makeDeterministicUniqueIndices(n, k, seedStr) {
        k = Math.max(0, Math.min(k, n));
        const idxs = Array.from({ length: n }, (_, i) => i);
        const rnd = mulberry32(hashStringToU32(seedStr || "seed"));
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
        }
        return idxs.slice(0, k).sort((a, b) => a - b);
    }

    function ensureStableMissingIndices(draft, seqLen) {
        const want = Math.max(0, Math.min(Number(draft.missingCount || 0), seqLen));

        const existing = Array.isArray(draft.missingIndices)
            ? draft.missingIndices.filter((i) => i >= 0 && i < seqLen)
            : [];

        if (existing.length === want) {
            draft.missingIndices = existing;
            return;
        }

        const patternKey = draft.isCustomPattern
            ? normalizeCustomPattern(draft.customPattern)
            : draft.patternType;

        const key = `${draft.seed}::${draft.patternMode}::${patternKey}::${draft.repeatCount}::${draft.beforeAfterEnabled ? draft.beforeAfterSymbol : "-"}`;
        draft.missingIndices = makeDeterministicUniqueIndices(seqLen, want, key);
    }

    /* =======================================================
       7) RENDER ZOZNAMU ZADANÍ (INDEX)
       ======================================================= */

    function renderIndex() {
        const tasks = state.project.tasks;

        els.tasksRoot.innerHTML = "";
        els.emptyState.hidden = tasks.length !== 0;

        for (const t of tasks) {
            const node = els.tpl.content.firstElementChild.cloneNode(true);
            node.dataset.id = t.id;

            node.querySelector(".task__name").textContent = t.name || "Bez názvu";

            const modeLabel = t.patternMode === "growing" ? "rastúci" : "konštantný";
            const p = getPatternById(t.patternType, t.patternMode);
            const label = t.isCustomPattern
                ? `Vlastný: ${t.customPattern || "-"}`
                : (p?.label ?? t.patternType ?? "-");
            node.querySelector(".task__pattern").textContent = `Vzor: ${label} (${modeLabel})`;

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

            node.querySelector(".task__edit").addEventListener("click", () => onEditTask(t.id));
            node.querySelector(".task__delete").addEventListener("click", () => onDeleteTask(t.id));

            wireDragAndDrop(node);

            els.tasksRoot.appendChild(node);
        }
    }

    /* =======================================================
       8) AKCIE NA INDEXE (add/edit/delete)
       ======================================================= */

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

    /* =======================================================
       9) ULOŽENIE/NAČÍTANIE PROJEKTU (JSON)
       ======================================================= */

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
            version: Number(parsed.version || 2),
            tasks: parsed.tasks.map((t) => ({
                id: t.id || crypto.randomUUID(),
                seed: t.seed || crypto.randomUUID(),
                name: t.name || "",
                patternType: t.patternType || "AB",
                patternMode: t.patternMode === "growing" ? "growing" : "constant",
                isCustomPattern: !!t.isCustomPattern,
                customPattern: t.customPattern || "",
                beforeAfterEnabled: !!t.beforeAfterEnabled,
                beforeAfterSymbol: t.beforeAfterSymbol || "A",
                repeatCount: Number(t.repeatCount ?? 4),
                missingCount: Number(t.missingCount ?? 0),
                missingIndices: Array.isArray(t.missingIndices) ? t.missingIndices : [],
                xDist: Number(t.xDist ?? 25),
                images: {
                    A: {
                        fileName: t.images?.A?.fileName || "",
                        dataUrl: t.images?.A?.dataUrl || null,
                        hash: t.images?.A?.hash || null,
                    },
                    B: {
                        fileName: t.images?.B?.fileName || "",
                        dataUrl: t.images?.B?.dataUrl || null,
                        hash: t.images?.B?.hash || null,
                    },
                    C: {
                        fileName: t.images?.C?.fileName || "",
                        dataUrl: t.images?.C?.dataUrl || null,
                        hash: t.images?.C?.hash || null,
                    },
                },
                previewPngDataUrl: t.previewPngDataUrl || null,
                pythonText: t.pythonText || null,
            })),
        };

        renderIndex();
    }

    /* =======================================================
       10) EXPORT ZIP (ŽIAK)
       ======================================================= */

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

    async function onExport() {
        if (typeof window.JSZip === "undefined") {
            alert(
                `Chýba knižnica JSZip. Pridaj do HTML:\n\n` +
                `<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>`
            );
            return;
        }

        const tasks = state.project.tasks;
        if (!tasks.length) {
            alert("Nemáš žiadne zadania na export.");
            return;
        }

        const zip = new JSZip();

        const tasksPayload = tasks.map((t, i) => ({
            id: t.id,
            name: t.name || `Zadanie ${i + 1}`,
            seed: t.seed,
            patternType: t.patternType,
            patternMode: t.patternMode,
            isCustomPattern: !!t.isCustomPattern,
            customPattern: t.customPattern || "",
            beforeAfterEnabled: !!t.beforeAfterEnabled,
            beforeAfterSymbol: t.beforeAfterSymbol || "A",
            repeatCount: Number(t.repeatCount ?? 4),
            missingCount: Number(t.missingCount ?? 0),
            missingIndices: Array.isArray(t.missingIndices) ? t.missingIndices : [],
            xDist: Number(t.xDist ?? 25),
            images: {
                A: { fileName: t.images?.A?.fileName || "", dataUrl: t.images?.A?.dataUrl || null },
                B: { fileName: t.images?.B?.fileName || "", dataUrl: t.images?.B?.dataUrl || null },
                C: { fileName: t.images?.C?.fileName || "", dataUrl: t.images?.C?.dataUrl || null },
            },
            pythonText: t.pythonText || generatePythonTemplate(t),
            previewPngDataUrl: t.previewPngDataUrl || null,
        }));

        const studentHtml = STUDENT_HTML_TEMPLATE.replace(
            "/*__TASKS_JSON__*/",
            JSON.stringify({ version: 1, tasks: tasksPayload }, null, 2)
        );

        zip.file("student.html", studentHtml);
        zip.file("student_app.js", STUDENT_APP_JS);
        zip.file("student_styles.css", STUDENT_STYLES_CSS);

        const tasksFolder = zip.folder("tasks");

        for (const t of tasks) {
            const base = sanitizeBaseName(t.name);
            const safeBase = base || `zadanie_${t.id.slice(0, 8)}`;

            const pyName = `${safeBase}.py`;
            const pyText = t.pythonText || generatePythonTemplate(t);
            tasksFolder.file(pyName, pyText);

            for (const slot of ["A", "B", "C"]) {
                const img = t.images?.[slot];
                if (!img?.dataUrl || !img?.fileName) continue;
                const bytes = dataUrlToUint8Array(img.dataUrl);
                tasksFolder.file(img.fileName, bytes, { binary: true });
            }
        }

        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "programovanie_vzorov_export.zip";
        a.click();
        URL.revokeObjectURL(url);
    }

    /* =======================================================
       11) DRAG & DROP REORDER
       ======================================================= */

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

    /* =======================================================
       12) EDITOR – OPEN/MOUNT/READ/SAVE
       ======================================================= */

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
            id: t.id,
            seed: t.seed || crypto.randomUUID(),
            name: t.name || "",
            patternType: t.patternType || "AB",
            patternMode: t.patternMode === "growing" ? "growing" : "constant",
            isCustomPattern: !!t.isCustomPattern,
            customPattern: t.customPattern || "",
            beforeAfterEnabled: !!t.beforeAfterEnabled,
            beforeAfterSymbol: t.beforeAfterSymbol || "A",
            repeatCount: Number(t.repeatCount ?? 4),
            missingCount: Number(t.missingCount ?? 0),
            missingIndices: Array.isArray(t.missingIndices) ? t.missingIndices.slice() : [],
            xDist: Number(t.xDist ?? 25),
            images: {
                A: { fileName: t.images?.A?.fileName || "", dataUrl: t.images?.A?.dataUrl || null, hash: t.images?.A?.hash || null },
                B: { fileName: t.images?.B?.fileName || "", dataUrl: t.images?.B?.dataUrl || null, hash: t.images?.B?.hash || null },
                C: { fileName: t.images?.C?.fileName || "", dataUrl: t.images?.C?.dataUrl || null, hash: t.images?.C?.hash || null },
            },
        };

        mountEditor();
        showOverlay(true);
    }

    function mountEditor() {
        const titleEl = document.getElementById("editorTitle");
        if (titleEl) titleEl.textContent = editor.mode === "edit" ? "Upraviť zadanie" : "Nové zadanie";

        ensureImageFileNamesFromTaskName(editor.data);

        els.inpTaskName.value = editor.data.name;
        els.chkBeforeAfter.checked = editor.data.beforeAfterEnabled;
        els.inpRepeat.value = editor.data.repeatCount;
        els.inpMissing.value = editor.data.missingCount;
        els.inpXdist.value = editor.data.xDist;
        if (els.inpCustomPattern) {
            els.inpCustomPattern.value = editor.data.customPattern || "";
        }

        els.patternRadioRoot.innerHTML = "";
        els.patternRadioRoot.style.display = "block";

        if (!editor.data.isCustomPattern && !getPatternById(editor.data.patternType, editor.data.patternMode)) {
            editor.data.patternMode = "constant";
            editor.data.patternType = "AB";
        }

        buildPatternGroupsUI();

        setSegValue(editor.data.beforeAfterSymbol);
        updateBeforeAfterUI();
        updateCustomPatternUI();

        setupImagePickersIfNeeded();
        refreshImagePickerLabels();

        setupPreviewCanvasIfNeeded();
        renderEditorPreview();
    }

    function buildPatternGroupsUI() {
        const container = els.patternRadioRoot;

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
                const checked =
                    !editor.data.isCustomPattern &&
                    p.id === editor.data.patternType &&
                    editor.data.patternMode === mode;

                wrap.innerHTML = `
          <input
            type="radio"
            name="patternType"
            value="${p.id}"
            data-mode="${mode}"
            data-custom="false"
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

        const h = document.createElement("div");
        h.className = "field__label";
        h.textContent = "Vlastný";
        h.style.marginTop = "6px";

        const grid = document.createElement("div");
        grid.className = "radioGrid";
        grid.style.marginTop = "6px";

        const wrap = document.createElement("label");
        wrap.className = "radio";
        const checked = !!editor.data.isCustomPattern;

        wrap.innerHTML = `
      <input
        type="radio"
        name="patternType"
        value="CUSTOM"
        data-mode="constant"
        data-custom="true"
        ${checked ? "checked" : ""}
      />
      <span class="radio__box">Vlastný vzor</span>
    `;
        grid.appendChild(wrap);

        container.appendChild(h);
        container.appendChild(grid);

        updateCustomPatternUI();
    }

    function readEditorIntoDraft() {
        editor.data.name = els.inpTaskName.value.trim();
        ensureImageFileNamesFromTaskName(editor.data);

        editor.data.beforeAfterEnabled = els.chkBeforeAfter.checked;

        const checked = els.patternRadioRoot.querySelector('input[name="patternType"]:checked');
        const isCustom = checked?.dataset?.custom === "true";

        editor.data.isCustomPattern = isCustom;

        if (isCustom) {
            editor.data.patternMode = "constant";
            editor.data.patternType = "CUSTOM";
            editor.data.customPattern = normalizeCustomPattern(els.inpCustomPattern?.value || "");
        } else if (checked) {
            editor.data.patternType = checked.value || "AB";
            editor.data.patternMode = checked.dataset.mode === "growing" ? "growing" : "constant";
            editor.data.customPattern = normalizeCustomPattern(els.inpCustomPattern?.value || "");
        } else {
            editor.data.isCustomPattern = false;
            editor.data.patternType = "AB";
            editor.data.patternMode = "constant";
            editor.data.customPattern = normalizeCustomPattern(els.inpCustomPattern?.value || "");
        }

        editor.data.repeatCount = clampInt(els.inpRepeat.value, 1, 999, 4);
        editor.data.missingCount = clampInt(els.inpMissing.value, 0, 999, 0);
        editor.data.xDist = clampInt(els.inpXdist.value, 1, 999, 25);

        const activeSeg = els.segBeforeAfterSymbol.querySelector(".seg__btn.is-active");
        editor.data.beforeAfterSymbol = activeSeg?.dataset?.val || "A";

        const seqLen = buildSymbolSequenceWithoutMissing(editor.data).length;
        ensureStableMissingIndices(editor.data, seqLen);
    }

    function saveEditor() {
        readEditorIntoDraft();

        if (!editor.data.name) {
            alert("Prosím zadaj meno zadania.");
            els.inpTaskName.focus();
            return;
        }

        if (editor.data.isCustomPattern && !isValidCustomPattern(editor.data.customPattern)) {
            alert("Vlastný vzor môže obsahovať iba písmená A, B, C a nesmie byť prázdny.");
            els.inpCustomPattern.focus();
            return;
        }

        const pythonText = generatePythonTemplate(editor.data);
        const previewPngDataUrl = snapshotPreviewAsCroppedDataUrl();

        if (editor.mode === "create") {
            state.project.tasks.push({
                id: crypto.randomUUID(),
                seed: editor.data.seed || crypto.randomUUID(),
                name: editor.data.name,
                patternType: editor.data.patternType,
                patternMode: editor.data.patternMode,
                isCustomPattern: !!editor.data.isCustomPattern,
                customPattern: editor.data.customPattern || "",
                beforeAfterEnabled: editor.data.beforeAfterEnabled,
                beforeAfterSymbol: editor.data.beforeAfterSymbol,
                repeatCount: editor.data.repeatCount,
                missingCount: editor.data.missingCount,
                missingIndices: Array.isArray(editor.data.missingIndices) ? editor.data.missingIndices.slice() : [],
                xDist: editor.data.xDist,
                images: {
                    A: { fileName: editor.data.images.A.fileName, dataUrl: editor.data.images.A.dataUrl || null, hash: editor.data.images.A.hash || null },
                    B: { fileName: editor.data.images.B.fileName, dataUrl: editor.data.images.B.dataUrl || null, hash: editor.data.images.B.hash || null },
                    C: { fileName: editor.data.images.C.fileName, dataUrl: editor.data.images.C.dataUrl || null, hash: editor.data.images.C.hash || null },
                },
                previewPngDataUrl,
                pythonText,
            });
        } else {
            const t = state.project.tasks.find((x) => x.id === editor.editingId);
            if (!t) return;

            Object.assign(t, {
                seed: editor.data.seed || t.seed || crypto.randomUUID(),
                name: editor.data.name,
                patternType: editor.data.patternType,
                patternMode: editor.data.patternMode,
                isCustomPattern: !!editor.data.isCustomPattern,
                customPattern: editor.data.customPattern || "",
                beforeAfterEnabled: editor.data.beforeAfterEnabled,
                beforeAfterSymbol: editor.data.beforeAfterSymbol,
                repeatCount: editor.data.repeatCount,
                missingCount: editor.data.missingCount,
                missingIndices: Array.isArray(editor.data.missingIndices) ? editor.data.missingIndices.slice() : [],
                xDist: editor.data.xDist,
                images: {
                    A: { fileName: editor.data.images.A.fileName, dataUrl: editor.data.images.A.dataUrl || null, hash: editor.data.images.A.hash || null },
                    B: { fileName: editor.data.images.B.fileName, dataUrl: editor.data.images.B.dataUrl || null, hash: editor.data.images.B.hash || null },
                    C: { fileName: editor.data.images.C.fileName, dataUrl: editor.data.images.C.dataUrl || null, hash: editor.data.images.C.hash || null },
                },
                previewPngDataUrl,
                pythonText,
            });
        }

        showOverlay(false);
        renderIndex();
    }

    /* =======================================================
       13) PRED/ZA – SEGMENT A UI
       ======================================================= */

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
        const useCustom = Math.random() < 0.35;

        if (useCustom) {
            const customPool = ["ABC", "AAB", "ACB", "ABCA", "CBA", "AACBB"];
            editor.data.isCustomPattern = true;
            editor.data.patternMode = "constant";
            editor.data.patternType = "CUSTOM";
            editor.data.customPattern = customPool[Math.floor(Math.random() * customPool.length)];
        } else {
            editor.data.isCustomPattern = false;
            editor.data.customPattern = "";
            editor.data.patternMode = Math.random() < 0.5 ? "constant" : "growing";
            const list = editor.data.patternMode === "growing" ? PATTERNS_GROWING : PATTERNS_CONSTANT;
            const rnd = list[Math.floor(Math.random() * list.length)];
            editor.data.patternType = rnd?.id || "AB";
        }

        editor.data.beforeAfterEnabled = Math.random() < 0.5;
        editor.data.beforeAfterSymbol = ["A", "B", "C"][Math.floor(Math.random() * 3)];

        editor.data.repeatCount = clampInt(String(Math.floor(Math.random() * 7) + 3), 1, 999, 4);
        editor.data.missingCount = clampInt(String(Math.floor(Math.random() * 3)), 0, 999, 0);
        editor.data.xDist = clampInt(String([20, 25, 30, 35][Math.floor(Math.random() * 4)]), 1, 999, 25);

        const seqLen = buildSymbolSequenceWithoutMissing(editor.data).length;
        ensureStableMissingIndices(editor.data, seqLen);

        mountEditor();
    }

    /* =======================================================
       14) UPLOAD OBRÁZKOV A/B/C + HASH
       ======================================================= */

    function setupImagePickersIfNeeded() {
        if (picker.rows.length) return;

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

            btn.disabled = false;

            const inp = document.createElement("input");
            inp.type = "file";
            inp.accept = "image/png";
            inp.style.display = "none";

            inp.addEventListener("change", async () => {
                const file = inp.files?.[0];
                if (!file) return;

                ensureImageFileNamesFromTaskName(editor.data);

                const { dataUrl, hash } = await readFileAsDataUrlAndHash(file);

                if (slot === "A" && editor.data.images.B.hash && editor.data.images.B.hash === hash) {
                    alert("Obrázok A nemôže byť rovnaký ako obrázok B. Vyber iný PNG.");
                    inp.value = "";
                    return;
                }
                if (slot === "B" && editor.data.images.A.hash && editor.data.images.A.hash === hash) {
                    alert("Obrázok B nemôže byť rovnaký ako obrázok A. Vyber iný PNG.");
                    inp.value = "";
                    return;
                }

                editor.data.images[slot].dataUrl = dataUrl;
                editor.data.images[slot].hash = hash;

                refreshImagePickerLabels();
                renderEditorPreview();
            });

            btn.addEventListener("click", () => {
                const nm = (els.inpTaskName.value || "").trim();
                if (!nm) {
                    alert("Najprv zadaj meno zadania (kvôli názvom súborov).");
                    els.inpTaskName.focus();
                    return;
                }
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

    async function readFileAsDataUrlAndHash(file) {
        const dataUrl = await readFileAsDataUrl(file);
        const buf = await file.arrayBuffer();
        const hashBuf = await crypto.subtle.digest("SHA-256", buf);
        const hashArr = Array.from(new Uint8Array(hashBuf));
        const hashHex = hashArr.map((b) => b.toString(16).padStart(2, "0")).join("");
        return { dataUrl, hash: hashHex };
    }

    /* =======================================================
       15) CANVAS PREVIEW – VYKRESLENIE + PNG SNAPSHOT
       ======================================================= */

    function syncPreviewCanvasCssHeight() {
        if (!previewCanvas) return;
        const box = previewCanvas.parentElement;
        if (!box) return;

        const cssW = box.clientWidth;
        const ratio = previewCanvas.height / previewCanvas.width;
        const cssH = Math.round(cssW * ratio);

        previewCanvas.style.height = `${cssH}px`;
    }

    function setupPreviewCanvasIfNeeded() {
        if (previewCanvas) return;

        const box = els.editorOverlay?.querySelector(".previewBox");
        if (!box) return;

        box.innerHTML = "";
        previewCanvas = document.createElement("canvas");
        previewCanvas.width = 1400;
        previewCanvas.height = 260;
        previewCanvas.style.width = "100%";
        previewCanvas.style.height = "auto";
        previewCanvas.style.display = "block";
        previewCanvas.style.borderRadius = "16px";

        box.appendChild(previewCanvas);
        previewCtx = previewCanvas.getContext("2d");
    }

    function snapshotPreviewAsCroppedDataUrl(pad = 16) {
        if (!previewCanvas || !previewCtx) return null;

        const w = previewCanvas.width;
        const h = previewCanvas.height;
        const img = previewCtx.getImageData(0, 0, w, h).data;

        let minX = w, minY = h, maxX = 0, maxY = 0;
        let found = false;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const a = img[(y * w + x) * 4 + 3];
                if (a > 10) {
                    found = true;
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }
        }

        if (!found) return previewCanvas.toDataURL("image/png");

        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(w - 1, maxX + pad);
        maxY = Math.min(h - 1, maxY + pad);

        const cw = maxX - minX + 1;
        const ch = maxY - minY + 1;

        const out = document.createElement("canvas");
        out.width = cw;
        out.height = ch;
        const octx = out.getContext("2d");

        octx.drawImage(previewCanvas, minX, minY, cw, ch, 0, 0, cw, ch);
        return out.toDataURL("image/png");
    }

    function buildSymbolSequenceWithoutMissing(draft) {
        const base = getEffectivePatternString(draft);
        const repeat = Math.max(1, Number(draft.repeatCount || 1));
        let seq = [];

        if (draft.patternMode === "growing" && !draft.isCustomPattern) {
            for (let i = 1; i <= repeat; i++) {
                const part = base.slice(0, Math.min(base.length, i));
                seq.push(...part.split(""));
            }
        } else {
            for (let i = 0; i < repeat; i++) {
                seq.push(...base.split(""));
            }
        }

        if (draft.beforeAfterEnabled) {
            const s = draft.beforeAfterSymbol || "A";
            seq = [s, ...seq, s];
        }

        return seq.map((c) => (c === "A" || c === "B" || c === "C" ? c : null));
    }

    function buildSymbolSequence(draft) {
        const seq = buildSymbolSequenceWithoutMissing(draft);
        ensureStableMissingIndices(draft, seq.length);
        const holes = new Set(draft.missingIndices || []);
        return seq.map((v, i) => (holes.has(i) ? null : v));
    }

    function measurePreviewLayout(draft, canvasW) {
        const seq = buildSymbolSequence(draft);

        const baseTile = 44;
        const gap = clampInt(String(draft.xDist), 8, 160, 25);

        const paddingX = 18;
        const paddingY = 18;
        const lineGap = 16;

        const usableW = canvasW - paddingX * 2;
        const perRow = Math.max(1, Math.floor((usableW + gap) / (baseTile + gap)));
        const rows = Math.max(1, Math.ceil(seq.length / perRow));
        const neededH = paddingY * 2 + rows * baseTile + (rows - 1) * lineGap;

        return { seq, gap, rows, tile: baseTile, neededH, paddingX, paddingY, lineGap, perRow };
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

    async function drawTile(ctx, x, y, size, symbol, draft) {
        const slot = symbol;
        const dataUrl = draft.images?.[slot]?.dataUrl;

        if (dataUrl) {
            const img = await loadImage(dataUrl);
            ctx.drawImage(img, x, y, size, size);
            return;
        }

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

    const renderEditorPreview = debounce(async function () {
        if (!previewCanvas) return;

        readEditorIntoDraft();
        refreshImagePickerLabels();

        const m = measurePreviewLayout(editor.data, previewCanvas.width);

        const newH = Math.max(180, Math.min(420, m.neededH));
        if (previewCanvas.height !== newH) {
            previewCanvas.height = newH;
            previewCtx = previewCanvas.getContext("2d");
            syncPreviewCanvasCssHeight();
        }

        const ctx = previewCtx;
        const w = previewCanvas.width;
        const h = previewCanvas.height;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "rgba(255,255,255,.70)";
        ctx.fillRect(0, 0, w, h);

        const seq = m.seq;
        const size = m.tile;
        const gap = m.gap;

        let x = m.paddingX;
        let y = m.paddingY;
        const lineH = size + m.lineGap;

        for (let i = 0; i < seq.length; i++) {
            if (x + size > w - m.paddingX) {
                x = m.paddingX;
                y += lineH;
                if (y + size > h - m.paddingY) break;
            }

            if (seq[i] !== null) {
                await drawTile(ctx, x, y, size, seq[i], editor.data);
            } else {
                ctx.save();
                ctx.globalAlpha = 0.35;
                ctx.setLineDash([6, 6]);
                ctx.strokeStyle = "rgba(19,32,51,.35)";
                ctx.lineWidth = 2;
                roundRect(ctx, x, y, size, size, 10);
                ctx.stroke();
                ctx.restore();
            }

            x += size + gap;
        }
    }, 80);

    /* =======================================================
       16) PYTHON TEMPLATE
       ======================================================= */

    function generatePythonTemplate(draft) {
        const base = sanitizeBaseName(draft.name);
        const fnA = `${base}0.png`;
        const fnB = `${base}1.png`;
        const fnC = `${base}2.png`;
        const hasC = !!(draft?.images?.C?.dataUrl);

        const loadLines = [
            "obrazky_import = []",
            `obrazky_import.append(tk.PhotoImage(file='${fnA}'))`,
            `obrazky_import.append(tk.PhotoImage(file='${fnB}'))`,
        ];
        if (hasC) loadLines.push(`obrazky_import.append(tk.PhotoImage(file='${fnC}'))`);

        return [
            "import tkinter as tk",
            "",
            "canvas = tk.Canvas(width=800, height=260, bg='white')",
            "canvas.pack()",
            "",
            "# nastavenia (mozes upravit)",
            "sirka = 50",
            "vyska = 50",
            "pozicia_x = 10",
            "pocet_opakovani = 6",
            "",
            "# nacitanie obrazkov do zoznamu",
            ...loadLines,
            "",
            "# A = obrazky_import[0], B = obrazky_import[1], C = obrazky_import[2] (ak existuje)",
            "# TODO: dopln funkciu vzor() podla zadania",
            "def vzor():",
            "    # sem dopln canvas.create_image(...)",
            "    pass",
            "",
            "for i in range(pocet_opakovani):",
            "    vzor()",
            "    # TODO: posun pozicia_x podla toho, kolko prvkov vzor nakresli",
            "    # pozicia_x += ...",
            "",
            "tk.mainloop()",
            "",
        ].join("\n");
    }

    /* =======================================================
       17) EVENTY – LIVE PREVIEW + UI
       ======================================================= */

    function wireEditorLivePreviewEventsOnce() {
        els.inpTaskName.addEventListener("input", () => {
            editor.data.name = els.inpTaskName.value.trim();
            ensureImageFileNamesFromTaskName(editor.data);
            refreshImagePickerLabels();
            renderEditorPreview();
        });

        els.patternRadioRoot.addEventListener("change", () => {
            updateCustomPatternUI();
            renderEditorPreview();
        });

        if (els.inpCustomPattern) {
            els.inpCustomPattern.addEventListener("input", () => {
                els.inpCustomPattern.value = normalizeCustomPattern(els.inpCustomPattern.value);
                renderEditorPreview();
            });
        }

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
        els.btnAdd.addEventListener("click", onAddTask);
        els.btnSave.addEventListener("click", onSaveProject);
        els.btnLoad.addEventListener("click", onLoadProjectClick);
        els.btnExport.addEventListener("click", () => onExport().catch(console.error));

        els.fileLoad.addEventListener("change", (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            onLoadProjectFile(file).catch((err) => {
                console.error(err);
                alert("Nepodarilo sa načítať projekt.");
            });
        });

        els.btnEditorClose.addEventListener("click", () => showOverlay(false));
        els.editorOverlay.addEventListener("click", (e) => {
            if (e.target.classList.contains("overlay__backdrop")) showOverlay(false);
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && els.editorOverlay && !els.editorOverlay.hidden) showOverlay(false);
        });

        els.btnRandom.addEventListener("click", applyRandomSettings);
        els.btnDone.addEventListener("click", saveEditor);

        wireEditorLivePreviewEventsOnce();
    }

    function assertElements() {
        const required = [
            "tasksRoot","emptyState","tpl","btnAdd","btnLoad","btnSave","btnExport","fileLoad",
            "editorOverlay","btnEditorClose","inpTaskName","patternRadioRoot","inpCustomPattern","customPatternField",
            "chkBeforeAfter","segBeforeAfterSymbol","inpRepeat","inpMissing","inpXdist","btnRandom","btnDone",
        ];
        for (const k of required) {
            if (!els[k]) throw new Error(`Missing element #${k} in DOM`);
        }
    }

    /* =======================================================
       18) INIT
       ======================================================= */

    window.addEventListener(
        "resize",
        debounce(() => {
            syncPreviewCanvasCssHeight();
            renderEditorPreview();
        }, 120)
    );

    document.addEventListener("DOMContentLoaded", () => {
        try {
            assertElements();
            showOverlay(false);
            wireEvents();
            renderIndex();
        } catch (err) {
            console.error(err);
            alert("Chyba pri inicializácii. Pozri konzolu (Console).");
        }
    });

    /* =======================================================
       19) ŽIACKY EXPORT BUNDLE
       ======================================================= */

    const STUDENT_HTML_TEMPLATE = `<!doctype html>
<html lang="sk">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Programovanie vzorov – Žiak</title>
  <link rel="stylesheet" href="student_styles.css" />
</head>
<body>

  <header class="topbar topbar--student">
    <div class="topbar__stripe" aria-hidden="true"></div>

    <div class="brand">
      <div class="brand__logo" aria-hidden="true">
        <svg class="brand__mark" viewBox="0 0 64 64" fill="none">
          <path d="M12 24c0-10 8-18 18-18h4c10 0 18 8 18 18v16c0 10-8 18-18 18h-4c-10 0-18-8-18-18V24z"
                fill="url(#g1)"/>
          <rect x="18" y="22" width="10" height="10" rx="3" fill="rgba(255,255,255,.92)"/>
          <rect x="30" y="22" width="10" height="10" rx="3" fill="rgba(255,255,255,.70)"/>
          <rect x="42" y="22" width="10" height="10" rx="3" fill="rgba(255,255,255,.92)"/>
          <rect x="18" y="34" width="10" height="10" rx="3" fill="rgba(255,255,255,.70)"/>
          <rect x="30" y="34" width="10" height="10" rx="3" fill="rgba(255,255,255,.92)"/>
          <rect x="42" y="34" width="10" height="10" rx="3" fill="rgba(255,255,255,.70)"/>
          <defs>
            <linearGradient id="g1" x1="12" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
              <stop stop-color="#5B63F6"/>
              <stop offset="0.55" stop-color="#1AA7BE"/>
              <stop offset="1" stop-color="#F6A800"/>
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div class="brand__meta">
        <div class="brand__title">Programovanie vzorov</div>
        <div class="brand__subtitle">Žiacke prostredie</div>
      </div>
    </div>
  </header>

  <main class="wrap">
    <h1 class="pageTitle">Programovanie vzorov</h1>
    <p class="pageSub">Každé zadanie má ukážku, kód si vieš stiahnuť a podľa potreby zobraziť/skryť.</p>

    <div class="globalActions">
      <button id="btnDownloadAll" class="btn btn--primary">stiahnuť všetky obrázky + kódy</button>
    </div>

    <div id="studentRoot" class="list"></div>
  </main>

  <script id="tasksData" type="application/json">
/*__TASKS_JSON__*/
  </script>

  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
  <script src="student_app.js"></script>
</body>
</html>`;

    const STUDENT_STYLES_CSS = `
:root{
  --orange:#C45A0A;
  --yellow:#F6A800;
  --sky:#C9D8E8;
  --teal:#00B9C8;
  --gray:#8F9B9B;

  --bg:#F4F8FC;
  --panel:#FFFFFF;
  --panel2:#F8FBFF;
  --text:#132033;
  --stroke:rgba(19,32,51,.12);

  --btn:#5B63F6;
  --btnText:#fff;
  --btn2:#FFFFFF;
  --btn2Text:#132033;
}

*{box-sizing:border-box}
body{
  margin:0;
  font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;
  background:
    radial-gradient(1200px 500px at 50% 85%, rgba(196,90,10,.10), transparent 50%),
    linear-gradient(180deg, rgba(23,127,175,.18), rgba(26,167,190,.10) 30%, var(--bg));
  color:var(--text);
}

.topbar.topbar--student{
  position:sticky;
  top:0;
  z-index:10;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
  padding:14px 18px;
  background: linear-gradient(90deg, rgba(91,99,246,.98), rgba(26,167,190,.92));
  border-bottom: 1px solid rgba(255,255,255,.28);
  box-shadow: 0 16px 40px rgba(0,0,0,.10);
  overflow:hidden;
}
.topbar.topbar--student .topbar__stripe{
  position:absolute;
  left:-60px; right:-60px;
  top:-22px;
  height:92px;
  background:
    radial-gradient(120px 80px at 20% 40%, rgba(255,255,255,.20), transparent 65%),
    radial-gradient(140px 90px at 55% 30%, rgba(246,168,0,.22), transparent 65%),
    radial-gradient(140px 90px at 85% 35%, rgba(255,255,255,.14), transparent 65%);
  pointer-events:none;
}
.topbar.topbar--student > *:not(.topbar__stripe){ position:relative; z-index:1; }

.topbar.topbar--student .brand{
  display:flex;
  align-items:center;
  gap:12px;
  min-width:220px;
  color:#fff;
}
.topbar.topbar--student .brand__logo{
  width:48px; height:48px;
  border-radius:16px;
  display:grid;
  place-items:center;
  background: rgba(255,255,255,.18);
  border: 1px solid rgba(255,255,255,.28);
  box-shadow: 0 14px 30px rgba(0,0,0,.10);
}
.topbar.topbar--student .brand__mark{ width:44px; height:44px; display:block; }
.topbar.topbar--student .brand__title{
  font-weight:900;
  font-size:16px;
  letter-spacing:.2px;
  line-height:1.1;
  color:#fff;
  text-shadow:0 1px 0 rgba(0,0,0,.10);
}
.topbar.topbar--student .brand__subtitle{
  font-weight:700;
  font-size:13px;
  margin-top:2px;
  color:rgba(255,255,255,.92);
  text-shadow:0 1px 0 rgba(0,0,0,.10);
}

.wrap{max-width:1100px;margin:18px auto 60px;padding:0 16px}
.pageTitle{margin:24px 0 6px;text-align:center;font-size:44px;letter-spacing:-.02em}
.pageSub{margin:0 0 22px;text-align:center;color:rgba(19,32,51,.65)}

.globalActions{display:flex;justify-content:center;margin:10px 0 18px}
.list{display:flex;flex-direction:column;gap:14px}

.card{
  background:var(--panel);
  border:1px solid var(--stroke);
  border-radius:18px;
  box-shadow:0 18px 45px rgba(19,32,51,.08);
  padding:16px 16px 14px;
}
.card__head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.titleRow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.taskTitle{font-size:20px;font-weight:800}
.badge{
  font-size:12px;font-weight:700;
  padding:4px 10px;border-radius:999px;
  background:rgba(91,99,246,.10);
  border:1px solid rgba(91,99,246,.25);
  color:#3E45D6;
}

.actions{display:flex;gap:10px;align-items:center}
.btn{
  border-radius:12px;
  border:1px solid rgba(19,32,51,.12);
  padding:9px 12px;
  font-weight:800;
  cursor:pointer;
  background:var(--btn2);
  color:var(--btn2Text);
}
.btn--primary{
  background:var(--btn);
  color:var(--btnText);
  border:1px solid rgba(91,99,246,.35);
}
.btn:active{transform:translateY(1px)}
.btn:focus{outline:3px solid rgba(91,99,246,.25);outline-offset:2px}

.preview{
  margin-top:12px;
  border-radius:16px;
  border:1px dashed rgba(19,32,51,.18);
  padding:14px;
  background:linear-gradient(180deg, rgba(248,251,255,.9), rgba(244,248,252,.9));
  overflow:auto;
}
.strip{display:flex;gap:10px;align-items:center;min-height:64px}
.tileImg{width:48px;height:48px;object-fit:contain}
.tileBlank{
  width:48px;height:48px;border-radius:12px;
  border:2px dashed rgba(19,32,51,.22);
  background:rgba(255,255,255,.55);
}

.codeBox{
  margin-top:12px;
  border:1px solid rgba(19,32,51,.12);
  border-radius:16px;
  background:rgba(255,255,255,.9);
  overflow:hidden;
}
.codeBox__bar{
  display:flex;justify-content:flex-end;
  padding:8px 10px;border-bottom:1px solid rgba(19,32,51,.10);
  background:linear-gradient(180deg, rgba(248,251,255,.9), rgba(244,248,252,.9));
}
.codeBox pre{
  margin:0;
  padding:14px 14px 16px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size:13px;
  line-height:1.4;
  overflow:auto;
  max-height:360px;
}
`;

    const STUDENT_APP_JS = `(() => {
  "use strict";

  const root = document.getElementById("studentRoot");
  const dataEl = document.getElementById("tasksData");
  const btnDownloadAll = document.getElementById("btnDownloadAll");

  function sanitizeBaseName(name) {
    const raw = (name || "").trim();
    if (!raw) return "zadanie";
    const noDia = raw.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
    const safe = noDia.toLowerCase().replace(/\\s+/g, "").replace(/[^a-z0-9_-]/g, "");
    return safe || "zadanie";
  }

  function normalizeCustomPattern(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/\\s+/g, "")
      .replace(/[^ABC]/g, "");
  }

  function getEffectivePatternString(t) {
    if (t.isCustomPattern) {
      return normalizeCustomPattern(t.customPattern) || "AB";
    }
    return String(t.patternType || "AB").trim();
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadDataUrl(filename, dataUrl) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }

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

  async function downloadAllZip(tasks) {
    if (typeof window.JSZip !== "undefined") {
      const zip = new window.JSZip();
      const folderImgs = zip.folder("images");
      const folderPy = zip.folder("templates");

      tasks.forEach((t, idx) => {
        const base = sanitizeBaseName(t.name || ("zadanie" + (idx + 1)));

        folderPy.file(base + ".py", t.pythonText || "");

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

  function buildSymbolSequenceWithoutMissing(t) {
    const base = getEffectivePatternString(t);
    const repeat = Math.max(1, Number(t.repeatCount || 1));
    let seq = [];

    if (t.patternMode === "growing" && !t.isCustomPattern) {
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

  function buildSymbolSequence(t) {
    const seq = buildSymbolSequenceWithoutMissing(t);
    const holes = new Set(Array.isArray(t.missingIndices) ? t.missingIndices : []);
    return seq.map((v, i) => (holes.has(i) ? null : v));
  }

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

      const preview = document.createElement("div");
      preview.className = "preview";
      const strip = document.createElement("div");
      strip.className = "strip";

      const seq = buildSymbolSequence(t);
      seq.forEach(sym => strip.appendChild(tileFor(sym, t)));
      preview.appendChild(strip);

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
})();`;

})();