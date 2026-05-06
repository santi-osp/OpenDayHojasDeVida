"use strict";

const RUNTIME_CONFIG = readRuntimeConfig();
const MAX_FILE_SIZE_MB = 8;
const SESSION_STORAGE_KEY = "openday_cv_analysis_history_v1";

const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "txt"]);
const ALLOWED_MIME_TYPES = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain"
]);

const state = {
    queue: [],
    analyses: [],
    processing: false,
    toastTimer: null
};

const elements = {
    dropZone: document.getElementById("dropZone"),
    fileInput: document.getElementById("fileInput"),
    analyzeBtn: document.getElementById("analyzeBtn"),
    clearQueueBtn: document.getElementById("clearQueueBtn"),
    progressBar: document.getElementById("progressBar"),
    progressText: document.getElementById("progressText"),
    fileList: document.getElementById("fileList"),
    resultsGrid: document.getElementById("resultsGrid"),
    metricTotal: document.getElementById("metricTotal"),
    metricAverage: document.getElementById("metricAverage"),
    metricApto: document.getElementById("metricApto"),
    metricRevisar: document.getElementById("metricRevisar"),
    metricNoRecomendado: document.getElementById("metricNoRecomendado"),
    frequentObservations: document.getElementById("frequentObservations"),
    executiveSummary: document.getElementById("executiveSummary"),
    downloadCsvBtn: document.getElementById("downloadCsvBtn"),
    clearHistoryBtn: document.getElementById("clearHistoryBtn"),
    toast: document.getElementById("toast")
};

initializeApp();

function initializeApp() {
    configurePdfWorker();
    restoreSessionHistory();
    bindEvents();
    renderQueue();
    renderResults();
    renderSummary();
}

function configurePdfWorker() {
    if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
}

function bindEvents() {
    elements.fileInput.addEventListener("change", (event) => {
        const files = Array.from(event.target.files || []);
        addFilesToQueue(files);
        elements.fileInput.value = "";
    });

    // Prevent bubbling from the hidden input so the picker opens only once.
    elements.fileInput.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    elements.dropZone.addEventListener("click", (event) => {
        if (event.target === elements.fileInput) {
            return;
        }

        elements.fileInput.click();
    });
    elements.dropZone.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            elements.fileInput.click();
        }
    });

    ["dragenter", "dragover"].forEach((eventName) => {
        elements.dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            elements.dropZone.classList.add("is-dragover");
        });
    });

    ["dragleave", "drop"].forEach((eventName) => {
        elements.dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            elements.dropZone.classList.remove("is-dragover");
        });
    });

    elements.dropZone.addEventListener("drop", (event) => {
        const files = Array.from(event.dataTransfer?.files || []);
        addFilesToQueue(files);
    });

    elements.analyzeBtn.addEventListener("click", analyzeQueue);
    elements.clearQueueBtn.addEventListener("click", clearQueue);

    if (elements.downloadCsvBtn) {
        elements.downloadCsvBtn.addEventListener("click", downloadCsvReport);
    }

    if (elements.clearHistoryBtn) {
        elements.clearHistoryBtn.addEventListener("click", clearSessionHistory);
    }
}

function addFilesToQueue(files) {
    if (!files.length) {
        return;
    }

    const newItems = [];
    const rejected = [];

    for (const file of files) {
        const validation = validateFile(file);

        if (!validation.valid) {
            rejected.push(`${file.name}: ${validation.reason}`);
            continue;
        }

        const duplicate = state.queue.some((item) => item.file.name === file.name && item.file.size === file.size);
        if (duplicate) {
            rejected.push(`${file.name}: ya está en la lista`);
            continue;
        }

        newItems.push({
            id: generateId(),
            file,
            status: "pending",
            message: "Pendiente",
            result: null,
            extractedLength: 0,
            processedAt: null
        });
    }

    state.queue.push(...newItems);
    renderQueue();
    updateAnalyzeButtonState();

    if (newItems.length > 0) {
        showToast(`Se agregaron ${newItems.length} archivo(s) a la cola.`);
    }

    if (rejected.length > 0) {
        showToast(`Algunos archivos fueron rechazados: ${rejected.slice(0, 2).join(" | ")}`);
    }
}

function validateFile(file) {
    const extension = getExtension(file.name);
    const isAllowedExtension = ALLOWED_EXTENSIONS.has(extension);
    const isAllowedMime = !file.type || ALLOWED_MIME_TYPES.has(file.type);

    if (!isAllowedExtension || !isAllowedMime) {
        return {
            valid: false,
            reason: "tipo no permitido (usa PDF, DOCX o TXT)"
        };
    }

    const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
        return {
            valid: false,
            reason: `supera ${MAX_FILE_SIZE_MB}MB`
        };
    }

    return { valid: true };
}

function clearQueue() {
    if (state.processing) {
        showToast("No puedes limpiar la cola mientras hay procesamiento en curso.");
        return;
    }

    state.queue = [];
    resetProgress();
    renderQueue();
    updateAnalyzeButtonState();
}

async function analyzeQueue() {
    if (state.processing) {
        return;
    }

    const pendingItems = state.queue.filter((item) => item.status === "pending" || item.status === "error");
    if (!pendingItems.length) {
        showToast("No hay archivos pendientes para analizar.");
        return;
    }

    const apiConfig = getApiConfig();
    if (!apiConfig.configLoaded) {
        showToast("No se cargó config.js. Revisa que GitHub Pages despliegue desde GitHub Actions.");
        return;
    }

    if (!apiConfig.apiUrl) {
        showToast("No hay URL configurada para la Azure Function.");
        return;
    }

    if (!isValidUrl(apiConfig.apiUrl)) {
        showToast("La URL configurada para Azure Function no es válida.");
        return;
    }

    state.processing = true;
    updateAnalyzeButtonState();

    let done = 0;
    const total = pendingItems.length;
    updateProgress(0, `Iniciando análisis de ${total} archivo(s)...`);

    for (const item of pendingItems) {
        try {
            item.status = "extracting";
            item.message = "Extrayendo texto...";
            renderQueue();

            const extraction = await extractTextFromFile(item.file);
            item.extractedLength = extraction.text.length;

            if (!extraction.text.trim()) {
                throw new Error("No se pudo extraer texto utilizable del archivo.");
            }

            item.status = "sending";
            item.message = "Consultando IA en Azure Function...";
            renderQueue();

            const analysis = await callAzureFunction({
                apiConfig,
                fileName: item.file.name,
                text: extraction.text,
                pageCount: extraction.pageCount
            });

            item.status = "done";
            item.message = "Analizado";
            item.result = analysis;
            item.processedAt = new Date().toISOString();

            state.analyses.push({
                id: generateId(),
                fileName: item.file.name,
                fileType: getExtension(item.file.name),
                fileSize: item.file.size,
                extractedLength: extraction.text.length,
                processedAt: item.processedAt,
                analysis
            });

            persistSessionHistory();
            renderResults();
            renderSummary();
        } catch (error) {
            item.status = "error";
            item.message = normalizeError(error);
        }

        done += 1;
        updateProgress(Math.round((done / total) * 100), `Procesadas ${done} de ${total}.`);
        renderQueue();
    }

    state.processing = false;
    updateAnalyzeButtonState();
    showToast("Proceso finalizado. Revisa los resultados y descarga tu reporte.");
}

async function extractTextFromFile(file) {
    const extension = getExtension(file.name);

    if (extension === "pdf") {
        return extractTextFromPdf(file);
    }

    if (extension === "docx") {
        return extractTextFromDocx(file);
    }

    if (extension === "txt") {
        const text = await file.text();
        return {
            text,
            pageCount: inferPageCountFromText(text)
        };
    }

    throw new Error("Formato no soportado para extracción.");
}

async function extractTextFromPdf(file) {
    if (!window.pdfjsLib) {
        throw new Error("No fue posible cargar el motor de lectura PDF.");
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const pdfDocument = await window.pdfjsLib.getDocument({ data }).promise;
    const chunks = [];

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        const page = await pdfDocument.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
            .map((item) => item.str)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();

        if (pageText) {
            chunks.push(pageText);
        }
    }

    return {
        text: chunks.join("\n\n"),
        pageCount: pdfDocument.numPages
    };
}

async function extractTextFromDocx(file) {
    if (!window.mammoth) {
        throw new Error("No fue posible cargar el motor de lectura DOCX.");
    }

    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    const text = (result.value || "").replace(/\n{3,}/g, "\n\n");
    return {
        text,
        pageCount: inferPageCountFromText(text)
    };
}

async function callAzureFunction({ apiConfig, fileName, text, pageCount }) {
    const requestUrl = apiConfig.apiUrl;
    const headers = {
        "Content-Type": "application/json"
    };

    const payload = {
        fileName,
        text,
        pageCount: normalizePageCount(pageCount)
    };

    let response;
    try {
        response = await fetch(requestUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });
    } catch {
        throw new Error("No se pudo conectar con Azure Function (revisa CORS, URL o red).");
    }

    if (!response.ok) {
        const rawError = await safeReadResponse(response);
        throw new Error(`Azure Function respondió ${response.status}. ${rawError}`);
    }

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error("La respuesta de Azure Function no es JSON válido.");
    }

    return normalizeApiResponse(data);
}

function normalizePageCount(pageCount) {
    const value = Number(pageCount);
    if (Number.isInteger(value) && value > 0) {
        return value;
    }

    return 1;
}

function inferPageCountFromText(text) {
    const safeText = normalizeText(text, "");
    if (!safeText) {
        return 0;
    }

    // DOCX/TXT no siempre exponen paginación real en navegador; si hay saltos de página explícitos los respetamos.
    const explicitBreaks = safeText.match(/\f/g);
    if (explicitBreaks?.length) {
        return explicitBreaks.length + 1;
    }

    return 1;
}

function normalizeApiResponse(data) {
    const score = Number(data?.score ?? data?.puntuacionGeneral);
    const normalizedScore = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;

    const verdict = normalizeVerdict(data?.verdict ?? data?.veredicto);

    return {
        score: normalizedScore,
        verdict,
        summary: normalizeText(data?.summary ?? data?.resumenEvaluacion, "Sin resumen disponible."),
        strengths: normalizeArray(data?.strengths ?? data?.fortalezas),
        improvements: normalizeArray(data?.improvements ?? data?.oportunidadesMejora),
        missing_fields: normalizeArray(data?.missing_fields ?? data?.camposFaltantesODebiles),
        recommendations: normalizeArray(data?.recommendations ?? data?.consejosPracticos),
        erroresOrtograficos: normalizeOrthographicErrors(data?.erroresOrtograficos)
    };
}

function normalizeVerdict(rawVerdict) {
    const value = normalizeText(rawVerdict, "Revisar").toLowerCase();

    if (value.includes("alta recomend") || value.includes("altamente recomendado")) {
        return "Apto";
    }

    if (value.includes("media recomend")) {
        return "Revisar";
    }

    if (value.includes("baja recomend")) {
        return "No recomendado";
    }

    if (value.includes("apto")) {
        return "Apto";
    }

    if (value.includes("no recomendado") || value.includes("no_recomendado")) {
        return "No recomendado";
    }

    return "Revisar";
}

function normalizeArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => normalizeText(entry, ""))
        .filter(Boolean);
}

function normalizeOrthographicErrors(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => {
            if (!item || typeof item !== "object") {
                return null;
            }

            const textoOriginal = normalizeText(item.textoOriginal, "");
            const sugerencia = normalizeText(item.sugerencia, "");
            const contexto = normalizeText(item.contexto, "");

            if (!textoOriginal && !sugerencia && !contexto) {
                return null;
            }

            return {
                textoOriginal,
                sugerencia,
                contexto
            };
        })
        .filter(Boolean);
}

function normalizeText(value, fallback = "") {
    if (typeof value === "string") {
        const text = value.trim();
        return text || fallback;
    }

    return fallback;
}

function renderQueue() {
    const list = elements.fileList;
    list.innerHTML = "";

    if (!state.queue.length) {
        const empty = document.createElement("li");
        empty.className = "muted-empty";
        empty.textContent = "No hay archivos cargados todavía.";
        list.appendChild(empty);
        return;
    }

    const fragment = document.createDocumentFragment();

    state.queue.forEach((item) => {
        const li = document.createElement("li");
        li.className = "file-item";

        const meta = document.createElement("div");
        meta.className = "file-meta";

        const fileName = document.createElement("p");
        fileName.className = "file-name";
        fileName.textContent = item.file.name;

        const details = document.createElement("p");
        details.className = "file-extra";
        details.textContent = `${formatBytes(item.file.size)} | ${item.message}`;

        meta.appendChild(fileName);
        meta.appendChild(details);

        const badge = document.createElement("span");
        badge.className = `badge ${item.status}`;
        badge.textContent = statusLabel(item.status);

        li.appendChild(meta);
        li.appendChild(badge);

        fragment.appendChild(li);
    });

    list.appendChild(fragment);
}

function renderResults() {
    elements.resultsGrid.innerHTML = "";

    if (!state.analyses.length) {
        const empty = document.createElement("p");
        empty.className = "muted-empty";
        empty.textContent = "Aún no hay análisis para mostrar.";
        elements.resultsGrid.appendChild(empty);
        return;
    }

    const sortedAnalyses = [...state.analyses].sort((a, b) => new Date(b.processedAt) - new Date(a.processedAt));

    const fragment = document.createDocumentFragment();
    sortedAnalyses.forEach((entry) => {
        fragment.appendChild(buildResultCard(entry));
    });

    elements.resultsGrid.appendChild(fragment);
}

function buildResultCard(entry) {
    const card = document.createElement("article");
    card.className = "result-card";

    const head = document.createElement("div");
    head.className = "result-head";

    const fileName = document.createElement("h3");
    fileName.className = "result-file";
    fileName.textContent = entry.fileName;

    const score = document.createElement("span");
    score.className = "score-chip";
    score.textContent = `${entry.analysis.score.toFixed(1)}`;

    head.appendChild(fileName);
    head.appendChild(score);

    const verdict = document.createElement("p");
    verdict.className = "result-verdict";
    verdict.textContent = `Veredicto: ${entry.analysis.verdict}`;

    const summary = document.createElement("p");
    summary.className = "result-summary";
    summary.textContent = entry.analysis.summary;

    card.appendChild(head);
    card.appendChild(verdict);
    card.appendChild(summary);
    card.appendChild(buildListBlock("Fortalezas", entry.analysis.strengths));
    card.appendChild(buildOrthographicErrorsBlock(entry.analysis.erroresOrtograficos));
    card.appendChild(buildListBlock("Mejoras", entry.analysis.improvements));
    card.appendChild(buildListBlock("Campos faltantes", entry.analysis.missing_fields));
    card.appendChild(buildListBlock("Recomendaciones", entry.analysis.recommendations));

    return card;
}

function buildListBlock(title, values) {
    const block = document.createElement("section");
    block.className = "result-block";

    const heading = document.createElement("h4");
    heading.textContent = title;
    block.appendChild(heading);

    if (!values.length) {
        const empty = document.createElement("p");
        empty.className = "muted-empty";
        empty.textContent = "Sin observaciones.";
        block.appendChild(empty);
        return block;
    }

    const ul = document.createElement("ul");
    values.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        ul.appendChild(li);
    });

    block.appendChild(ul);
    return block;
}

function buildOrthographicErrorsBlock(errors) {
    const normalizedErrors = normalizeOrthographicErrors(errors);

    const block = document.createElement("section");
    block.className = "result-block";

    const heading = document.createElement("h4");
    heading.textContent = `Errores ortográficos (${normalizedErrors.length})`;
    block.appendChild(heading);

    if (!normalizedErrors.length) {
        const empty = document.createElement("p");
        empty.className = "muted-empty";
        empty.textContent = "No se detectaron errores ortográficos";
        block.appendChild(empty);
        return block;
    }

    const ul = document.createElement("ul");
    ul.className = "orthography-list";

    normalizedErrors.forEach((item) => {
        const li = document.createElement("li");
        li.className = "orthography-item";

        const original = document.createElement("p");
        original.className = "orthography-line";
        original.textContent = `Texto original: ${item.textoOriginal || "Sin dato"}`;

        const suggestion = document.createElement("p");
        suggestion.className = "orthography-line";
        suggestion.textContent = `Sugerencia: ${item.sugerencia || "Sin sugerencia"}`;

        const context = document.createElement("p");
        context.className = "orthography-line";
        context.textContent = `Contexto: ${item.contexto || "Sin contexto"}`;

        li.appendChild(original);
        li.appendChild(suggestion);
        li.appendChild(context);
        ul.appendChild(li);
    });

    block.appendChild(ul);
    return block;
}

function renderSummary() {
    const report = buildConsolidatedReport();

    elements.metricTotal.textContent = String(report.metrics.totalEvaluated);
    elements.metricAverage.textContent = report.metrics.averageScore.toFixed(1);
    elements.metricApto.textContent = String(report.metrics.verdictCounts.apto);
    elements.metricRevisar.textContent = String(report.metrics.verdictCounts.revisar);
    elements.metricNoRecomendado.textContent = String(report.metrics.verdictCounts.noRecomendado);

    elements.frequentObservations.innerHTML = "";
    if (!report.metrics.topObservations.length) {
        const empty = document.createElement("li");
        empty.textContent = "Sin observaciones aún.";
        elements.frequentObservations.appendChild(empty);
    } else {
        report.metrics.topObservations.forEach((item) => {
            const li = document.createElement("li");
            li.textContent = `${item.text} (${item.count})`;
            elements.frequentObservations.appendChild(li);
        });
    }

    elements.executiveSummary.textContent = report.executiveSummary;
}

function buildConsolidatedReport() {
    const total = state.analyses.length;
    const sumScores = state.analyses.reduce((sum, entry) => sum + entry.analysis.score, 0);
    const averageScore = total ? sumScores / total : 0;

    const verdictCounts = {
        apto: 0,
        revisar: 0,
        noRecomendado: 0
    };

    const observationsMap = new Map();

    state.analyses.forEach((entry) => {
        const verdict = entry.analysis.verdict;
        if (verdict === "Apto") {
            verdictCounts.apto += 1;
        } else if (verdict === "No recomendado") {
            verdictCounts.noRecomendado += 1;
        } else {
            verdictCounts.revisar += 1;
        }

        const candidates = [
            ...entry.analysis.improvements,
            ...entry.analysis.missing_fields,
            ...entry.analysis.recommendations
        ];

        for (const observation of candidates) {
            const key = observation.toLowerCase();
            const item = observationsMap.get(key) || { text: observation, count: 0 };
            item.count += 1;
            observationsMap.set(key, item);
        }
    });

    const topObservations = Array.from(observationsMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

    const executiveSummary = createExecutiveSummary({
        total,
        averageScore,
        verdictCounts,
        topObservations
    });

    return {
        generatedAt: new Date().toISOString(),
        metrics: {
            totalEvaluated: total,
            averageScore,
            verdictCounts,
            topObservations
        },
        executiveSummary,
        records: state.analyses
    };
}

function createExecutiveSummary({ total, averageScore, verdictCounts, topObservations }) {
    if (!total) {
        return "Aún no hay evaluaciones. Carga y analiza hojas de vida para generar el diagnóstico del Open Day.";
    }

    let level = "riesgo alto";
    if (averageScore >= 80) {
        level = "alto potencial";
    } else if (averageScore >= 60) {
        level = "potencial medio";
    }

    const mostFrequent = topObservations[0]?.text || "sin observaciones recurrentes";

    return `Se evaluaron ${total} hojas de vida con un promedio de ${averageScore.toFixed(1)} puntos (${level}). ` +
        `Distribución: ${verdictCounts.apto} Apto, ${verdictCounts.revisar} Revisar y ${verdictCounts.noRecomendado} No recomendado. ` +
        `La observación más repetida fue: ${mostFrequent}.`;
}

function downloadCsvReport() {
    if (!state.analyses.length) {
        showToast("No hay datos para exportar en CSV.");
        return;
    }

    const header = [
        "fileName",
        "fileType",
        "fileSize",
        "score",
        "verdict",
        "summary",
        "strengths",
        "improvements",
        "missing_fields",
        "recommendations",
        "processedAt"
    ];

    const rows = state.analyses.map((entry) => {
        return [
            entry.fileName,
            entry.fileType,
            entry.fileSize,
            entry.analysis.score.toFixed(1),
            entry.analysis.verdict,
            entry.analysis.summary,
            entry.analysis.strengths.join(" | "),
            entry.analysis.improvements.join(" | "),
            entry.analysis.missing_fields.join(" | "),
            entry.analysis.recommendations.join(" | "),
            entry.processedAt
        ].map(escapeCsvCell);
    });

    const content = [header.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const fileName = `reporte-cv-${formatDateForFile(new Date())}.csv`;
    downloadFile(fileName, content, "text/csv;charset=utf-8");
}

function escapeCsvCell(value) {
    const text = String(value ?? "").replace(/"/g, '""');
    return `"${text}"`;
}

function clearSessionHistory() {
    if (state.processing) {
        showToast("Espera a que termine el procesamiento para borrar historial.");
        return;
    }

    state.analyses = [];
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    renderResults();
    renderSummary();
    showToast("Historial de sesión eliminado.");
}

function restoreSessionHistory() {
    try {
        const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) {
            return;
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return;
        }

        state.analyses = parsed.filter((item) => item && item.analysis && item.fileName);
    } catch (error) {
        console.warn("No fue posible restaurar historial de sesión:", error);
    }
}

function persistSessionHistory() {
    try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state.analyses));
    } catch (error) {
        console.warn("No fue posible guardar historial en sesión:", error);
    }
}

function updateAnalyzeButtonState() {
    const hasPending = state.queue.some((item) => item.status === "pending" || item.status === "error");
    if (elements.analyzeBtn) {
        elements.analyzeBtn.disabled = state.processing || !hasPending;
    }

    if (elements.clearQueueBtn) {
        elements.clearQueueBtn.disabled = state.processing || !state.queue.length;
    }
}

function updateProgress(percentage, text) {
    const safePercentage = Math.max(0, Math.min(100, Number(percentage) || 0));
    if (elements.progressBar) {
        elements.progressBar.style.width = `${safePercentage}%`;
    }

    if (elements.progressText) {
        elements.progressText.textContent = text;
    }
}

function resetProgress() {
    updateProgress(0, "Sin procesamiento en curso.");
}

function statusLabel(status) {
    if (status === "extracting") {
        return "Extrayendo";
    }

    if (status === "sending") {
        return "Analizando";
    }

    if (status === "done") {
        return "Completado";
    }

    if (status === "error") {
        return "Error";
    }

    return "Pendiente";
}

function getApiConfig() {
    return {
        configLoaded: RUNTIME_CONFIG.configLoaded,
        apiUrl: RUNTIME_CONFIG.apiUrl
    };
}

function readRuntimeConfig() {
    const config = window.OpenDayCvConfig || {};

    return {
        configLoaded: Boolean(window.OpenDayCvConfig),
        apiUrl: normalizeConfigValue(config.apiUrl, "")
    };
}

function normalizeConfigValue(value, fallback) {
    if (typeof value !== "string") {
        return fallback;
    }

    const trimmed = value.trim();
    return trimmed || fallback;
}

function isValidUrl(value) {
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}

function showToast(message) {
    if (!message) {
        return;
    }

    if (!elements.toast) {
        console.info(message);
        return;
    }

    elements.toast.textContent = message;
    elements.toast.classList.add("visible");

    if (state.toastTimer) {
        clearTimeout(state.toastTimer);
    }

    state.toastTimer = setTimeout(() => {
        elements.toast.classList.remove("visible");
    }, 3200);
}

function normalizeError(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return "Error inesperado.";
}

async function safeReadResponse(response) {
    try {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            const data = await response.json();
            return JSON.stringify(data);
        }

        return await response.text();
    } catch (error) {
        return "Sin detalle adicional.";
    }
}

function getExtension(fileName) {
    const parts = fileName.toLowerCase().split(".");
    return parts.length > 1 ? parts.pop() : "";
}

function generateId() {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    const kb = bytes / 1024;
    if (kb < 1024) {
        return `${kb.toFixed(1)} KB`;
    }

    return `${(kb / 1024).toFixed(2)} MB`;
}

function formatDateForFile(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");

    return `${year}${month}${day}-${hour}${minute}${second}`;
}

function downloadFile(fileName, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
