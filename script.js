const CONFIG = {
    maxLogLines: 500,
    autoSaveInterval: 30000,
    moduleDirectory: "./modules/",
    moduleExtension: ".sol",
};

const STORAGE_KEY = "sol-engine-projects-v1";

let currentExecutionId = 0;
let activeExecutionId = null;
let conSoleReSolver = null;
let commandHistory = [];
let historyIndex = -1;
let autoSaveTimer = null;

const moduleCache = new Map();
const moduleLoading = new Map();

const editor = document.getElementById("code-editor");
const logOutput = document.getElementById("log-output");
const SoltuxDisplay = document.getElementById("Soltux-display");
const SoltuxInput = document.getElementById("Soltux-input");
const projectSelect = document.getElementById("project-select");
const projectTree = document.getElementById("project-tree");
const newProjectBtn = document.getElementById("new-project-btn");
const saveProjectBtn = document.getElementById("save-project-btn");
const deleteProjectBtn = document.getElementById("delete-project-btn");
const newFileBtn = document.getElementById("new-file-btn");
const newFolderBtn = document.getElementById("new-folder-btn");
const importProjectBtn = document.getElementById("import-project-btn");
const toggleExplorerBtn = document.getElementById("toggle-explorer-btn");

const state = {
    projects: [],
    activeProjectId: null,
    activeFilePath: null,
    selectedFolderPath: "",
    expandedFolders: new Set(),
};

class SolRuntime {
    constructor() {
        this.variables = new Map();
        this.functions = new Map();
        this.breakpoints = new Set();
        this.debugMode = false;
    }

    setVar(name, value) {
        this.variables.set(name, value);
        if (this.debugMode) log(`[DEBUG] ${name} = ${JSON.stringify(value)}`, "#ffeb3b");
    }

    getVar(name) { return this.variables.get(name); }
    hasVar(name) { return this.variables.has(name); }
    deleteVar(name) { this.variables.delete(name); }
    clear() { this.variables.clear(); this.functions.clear(); }
}

const runtime = new SolRuntime();

function uid() { return `p_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`; }
function createFolderNode(name) { return { type: "folder", name, children: {} }; }
function createFileNode(name, content = "") { return { type: "file", name, content }; }
function normalizeRelativePath(path) {
    return String(path || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}
function joinPath(parentPath, childName) {
    const parent = normalizeRelativePath(parentPath);
    return parent ? `${parent}/${childName}` : childName;
}
function getParentPath(path) {
    const normalized = normalizeRelativePath(path);
    if (!normalized) return "";
    const parts = normalized.split("/");
    if (parts.length <= 1) return "";
    parts.pop();
    return parts.join("/");
}
function findNode(project, path) {
    const normalized = normalizeRelativePath(path);
    let current = project.root;
    if (!normalized) return current;

    const parts = normalized.split("/");
    for (const part of parts) {
        if (!current || current.type !== "folder" || !current.children[part]) return null;
        current = current.children[part];
    }
    return current;
}

function listProjectFiles(project) {
    const list = [];

    function walk(node, path) {
        if (!node) return;
        if (node.type === "file") {
            list.push({ path, name: node.name, content: node.content || "" });
            return;
        }

        Object.keys(node.children || {}).forEach(key => {
            const child = node.children[key];
            const childPath = path ? `${path}/${key}` : key;
            walk(child, childPath);
        });
    }

    walk(project.root, "");
    return list;
}

function ensureProjectDefaults(project) {
    if (!findNode(project, "main.sol")) createFileNodeAtPath(project, "", "main.sol", "create math = require(\"math\")\nlog(math.sum(10, 20))\n");
    if (!findNode(project, "modules")) createFolderNodeAtPath(project, "", "modules");
    if (!findNode(project, "modules/math.sol")) createFileNodeAtPath(project, "modules", "math.sol", "function sum(a, b) {\n    return a + b\n}\n\nreturn {\n    sum: sum\n}\n");
    if (!state.activeFilePath) state.activeFilePath = "main.sol";
}

function createFolderNodeAtPath(project, parentPath, folderName) {
    const parent = findNode(project, parentPath);
    const name = String(folderName || "").trim();
    if (!name || !parent || parent.type !== "folder") return null;
    if (parent.children[name]) return parent.children[name];
    parent.children[name] = createFolderNode(name);
    project.updatedAt = new Date().toISOString();
    return parent.children[name];
}

function findAvailableName(project, parentPath, desiredName) {
    const parent = findNode(project, parentPath);
    if (!parent || parent.type !== "folder") return desiredName;

    const base = desiredName;
    let candidate = base;
    let counter = 1;

    while (parent.children[candidate]) {
        const info = base.includes(".") ? base.split(".") : [base, ""];
        const extension = info.length > 1 ? `.${info.slice(1).join(".")}` : "";
        const stem = info.length > 1 ? info[0] : base;
        candidate = `${stem}_${counter}${extension}`;
        counter += 1;
    }

    return candidate;
}

function createFileNodeAtPath(project, parentPath, fileName, content = "") {
    const parent = findNode(project, parentPath);
    const name = String(fileName || "").trim();
    if (!name || !parent || parent.type !== "folder") return null;
    const safeName = findAvailableName(project, parentPath, name);
    parent.children[safeName] = createFileNode(safeName, content);
    project.updatedAt = new Date().toISOString();
    return parent.children[safeName];
}

function createProject(name) {
    const project = {
        id: uid(),
        name: name || "MeuProjeto",
        root: createFolderNode("root"),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    ensureProjectDefaults(project);
    state.projects.push(project);
    state.activeProjectId = project.id;
    state.activeFilePath = "main.sol";
    state.selectedFolderPath = "";
    state.expandedFolders.add("");
    state.expandedFolders.add("modules");
    persistProjects();
    renderAll();
    openFileInEditor("main.sol");
    return project;
}

function getActiveProject() {
    return state.projects.find(project => project.id === state.activeProjectId) || null;
}

function persistProjects() {
    const payload = {
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        activeFilePath: state.activeFilePath,
        selectedFolderPath: state.selectedFolderPath,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    if (editor && editor.innerText) localStorage.setItem("Sol_code", editor.innerText);
}

function loadProjectsFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.projects) || parsed.projects.length === 0) return false;
        state.projects = parsed.projects;
        state.activeProjectId = parsed.activeProjectId || state.projects[0].id;
        state.activeFilePath = parsed.activeFilePath || "main.sol";
        state.selectedFolderPath = parsed.selectedFolderPath || "";
        state.expandedFolders = new Set(["", "modules"]);
        return true;
    } catch (error) {
        console.warn("Failed to load projects from storage", error);
        return false;
    }
}

function deleteNode(project, path) {
    const normalized = normalizeRelativePath(path);
    if (!normalized) return false;
    const parentPath = getParentPath(normalized);
    const parentNode = findNode(project, parentPath);
    if (!parentNode || parentNode.type !== "folder") return false;
    const name = normalized.split("/").pop();
    if (!parentNode.children[name]) return false;
    delete parentNode.children[name];
    project.updatedAt = new Date().toISOString();
    return true;
}

function renameNode(project, path, newName) {
    const normalized = normalizeRelativePath(path);
    const cleanName = String(newName || "").trim();
    if (!normalized || !cleanName) return false;

    const node = findNode(project, normalized);
    if (!node) return false;

    const parentPath = getParentPath(normalized);
    const parentNode = findNode(project, parentPath);
    if (!parentNode || parentNode.type !== "folder") return false;

    const oldName = normalized.split("/").pop();
    const safeName = findAvailableName(project, parentPath, cleanName);
    if (safeName !== oldName && parentNode.children[safeName]) return false;

    const oldNode = parentNode.children[oldName];
    delete parentNode.children[oldName];
    oldNode.name = safeName;
    parentNode.children[safeName] = oldNode;
    project.updatedAt = new Date().toISOString();

    if (state.activeFilePath === normalized) {
        state.activeFilePath = joinPath(parentPath, safeName);
    }
    return true;
}

function saveActiveFile() {
    const project = getActiveProject();
    if (!project || !state.activeFilePath) return;
    const node = findNode(project, state.activeFilePath);
    if (!node || node.type !== "file") return;
    node.content = editor.innerText;
    project.updatedAt = new Date().toISOString();
    persistProjects();
    renderExplorer();
}

function openFileInEditor(path) {
    const project = getActiveProject();
    if (!project) return;
    const node = findNode(project, path);
    if (!node || node.type !== "file") return;
    state.activeFilePath = path;
    editor.innerText = node.content || "";
    updateEditor();
    renderExplorer();
    persistProjects();
}

function getSelectedParentPath() {
    if (state.selectedFolderPath) return state.selectedFolderPath;
    if (state.activeFilePath) return getParentPath(state.activeFilePath);
    return "";
}

function createProjectFile() {
    const project = getActiveProject();
    if (!project) return;
    const parentPath = getSelectedParentPath();
    const name = window.prompt("Nome do arquivo:", "novo.sol");
    if (!name) return;
    const fileName = name.trim();
    if (!fileName) return;

    createFileNodeAtPath(project, parentPath, fileName, "");
    const fullPath = joinPath(parentPath, fileName);
    persistProjects();
    renderExplorer();
    openFileInEditor(fullPath);
}

function createProjectFolder() {
    const project = getActiveProject();
    if (!project) return;
    const parentPath = getSelectedParentPath();
    const name = window.prompt("Nome da pasta:", "modules");
    if (!name) return;
    const folderName = name.trim();
    if (!folderName) return;

    createFolderNodeAtPath(project, parentPath, folderName);
    const fullPath = joinPath(parentPath, folderName);
    state.selectedFolderPath = fullPath;
    state.expandedFolders.add(fullPath);
    persistProjects();
    renderExplorer();
}

function toggleExplorer() {
    const panel = document.getElementById("project-explorer");
    if (!panel) return;
    panel.classList.toggle("open");
}

function renderProjectSelect() {
    if (!projectSelect) return;
    projectSelect.innerHTML = state.projects.map(project => (
        `<option value="${project.id}" ${project.id === state.activeProjectId ? "selected" : ""}>${project.name}</option>`
    )).join("");
}

function renderExplorer() {
    if (!projectTree) return;
    const project = getActiveProject();
    if (!project) {
        projectTree.innerHTML = '<div class="empty-state">Nenhum projeto disponível.</div>';
        return;
    }

    renderProjectSelect();

    function renderFolder(folderPath, folderNode, depth = 0) {
        if (!folderNode || folderNode.type !== "folder") return "";
        const children = Object.keys(folderNode.children || {});
        const expanded = state.expandedFolders.has(folderPath);
        const rowClass = state.selectedFolderPath === folderPath ? "selected" : "";

        return `
            <div class="explorer-node">
                <div class="explorer-row folder-row ${rowClass}" data-path="${folderPath}" data-type="folder" style="padding-left:${depth * 12 + 8}px;">
                    <span class="explorer-toggle">${children.length ? (expanded ? '▾' : '▸') : '•'}</span>
                    <span class="folder-icon">📁</span>
                    <span class="explorer-name">${folderNode.name || "Projeto"}</span>
                    <span class="explorer-actions">
                        <button type="button" data-action="new-file" data-path="${folderPath}" title="Novo arquivo">+</button>
                        <button type="button" data-action="new-folder" data-path="${folderPath}" title="Nova pasta">▣</button>
                        <button type="button" data-action="rename" data-path="${folderPath}" title="Renomear">✎</button>
                        <button type="button" data-action="delete" data-path="${folderPath}" title="Excluir">×</button>
                    </span>
                </div>
                ${expanded && children.length ? `<div class="explorer-child-list">${children.map(name => {
                    const child = folderNode.children[name];
                    const childPath = folderPath ? `${folderPath}/${name}` : name;
                    return child.type === "folder" ? renderFolder(childPath, child, depth + 1) : renderFile(childPath, child, depth + 1);
                }).join("")}</div>` : ""}
            </div>
        `;
    }

    function renderFile(filePath, fileNode, depth = 0) {
        const selected = state.activeFilePath === filePath ? "selected" : "";
        return `
            <div class="explorer-node">
                <div class="explorer-row file-row ${selected}" data-path="${filePath}" data-type="file" style="padding-left:${depth * 12 + 8}px;">
                    <span class="explorer-toggle"> </span>
                    <span class="file-icon">📄</span>
                    <span class="explorer-name">${fileNode.name || filePath}</span>
                    <span class="explorer-actions">
                        <button type="button" data-action="rename" data-path="${filePath}" title="Renomear">✎</button>
                        <button type="button" data-action="delete" data-path="${filePath}" title="Excluir">×</button>
                    </span>
                </div>
            </div>
        `;
    }

    projectTree.innerHTML = renderFolder("", project.root);
}

function renderAll() {
    renderProjectSelect();
    renderExplorer();
    if (projectSelect) projectSelect.value = state.activeProjectId || projectSelect.value;
}

projectTree.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    const row = event.target.closest(".explorer-row");
    const project = getActiveProject();
    if (!project) return;

    if (actionButton) {
        const action = actionButton.getAttribute("data-action");
        const path = normalizeRelativePath(actionButton.getAttribute("data-path") || "");

        if (action === "new-file") {
            state.selectedFolderPath = path;
            createProjectFile();
            return;
        }

        if (action === "new-folder") {
            state.selectedFolderPath = path;
            createProjectFolder();
            return;
        }

        if (action === "rename") {
            const node = findNode(project, path);
            const currentName = node ? node.name : "";
            const nextName = window.prompt("Novo nome:", currentName);
            if (!nextName) return;
            renameNode(project, path, nextName.trim());
            persistProjects();
            renderExplorer();
            return;
        }

        if (action === "delete") {
            if (!path) return;
            const node = findNode(project, path);
            if (!node) return;
            const confirmMessage = node.type === "folder" ? "Excluir pasta e tudo dentro dela?" : "Excluir arquivo?";
            if (!window.confirm(confirmMessage)) return;
            deleteNode(project, path);
            if (state.activeFilePath === path) state.activeFilePath = "main.sol";
            if (state.selectedFolderPath === path) state.selectedFolderPath = getParentPath(path);
            persistProjects();
            renderExplorer();
            return;
        }
    }

    if (row) {
        const rowPath = normalizeRelativePath(row.getAttribute("data-path") || "");
        const rowType = row.getAttribute("data-type");

        if (rowType === "folder") {
            state.selectedFolderPath = rowPath;
            state.expandedFolders.add(rowPath);
            renderExplorer();
            return;
        }

        if (rowType === "file") {
            state.selectedFolderPath = getParentPath(rowPath);
            openFileInEditor(rowPath);
        }
    }
});

projectSelect.addEventListener("change", (event) => {
    const projectId = event.target.value;
    const project = state.projects.find(item => item.id === projectId);
    if (!project) return;

    state.activeProjectId = projectId;
    state.selectedFolderPath = "";
    const targetFile = findNode(project, "main.sol") ? "main.sol" : listProjectFiles(project)[0]?.path || null;
    state.activeFilePath = targetFile;
    if (targetFile) openFileInEditor(targetFile);
    else {
        editor.innerText = "";
        updateEditor();
    }
    persistProjects();
    renderExplorer();
});

newProjectBtn.addEventListener("click", () => {
    const name = window.prompt("Nome do projeto:", `MeuProjeto_${state.projects.length + 1}`);
    if (!name) return;
    createProject(name.trim() || "MeuProjeto");
});

saveProjectBtn.addEventListener("click", () => {
    saveActiveFile();
    if (getActiveProject()) window.log("✓ Projeto salvo.", "#4caf50");
});

deleteProjectBtn.addEventListener("click", () => {
    const project = getActiveProject();
    if (!project) return;
    if (!window.confirm(`Excluir o projeto "${project.name}"?`)) return;

    state.projects = state.projects.filter(item => item.id !== project.id);
    state.activeProjectId = state.projects[0] ? state.projects[0].id : null;
    state.activeFilePath = state.activeProjectId ? "main.sol" : null;
    state.selectedFolderPath = "";

    if (state.activeProjectId) {
        const nextProject = getActiveProject();
        if (nextProject && findNode(nextProject, state.activeFilePath)) openFileInEditor(state.activeFilePath);
    } else {
        editor.innerText = "";
        updateEditor();
    }

    persistProjects();
    renderAll();
});

newFileBtn.addEventListener("click", createProjectFile);
newFolderBtn.addEventListener("click", createProjectFolder);
importProjectBtn.addEventListener("click", () => document.getElementById("file-input").click());
toggleExplorerBtn.addEventListener("click", toggleExplorer);

function updateEditor() {
    if (!editor) return;
    const text = editor.innerText || "";
    const lines = text.split("\n").length || 1;
    if (lineNumbers) {
        const numbers = Array.from({ length: lines }, (_, i) => {
            const num = i + 1;
            const hasBreakpoint = runtime.breakpoints.has(num);
            return `<span class="${hasBreakpoint ? "breakpoint" : ""}">${num}</span>`;
        }).join("<br>");
        lineNumbers.innerHTML = numbers;
    }
}

function switchTab(tabId) {
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".content").forEach(content => content.classList.remove("active"));

    const targetContent = document.getElementById(tabId);
    const targetBtn = document.querySelector(`[onclick="switchTab('${tabId}')"]`);
    if (targetContent) targetContent.classList.add("active");
    if (targetBtn) targetBtn.classList.add("active");

    if (tabId === "conSole" && conSoleReSolver) {
        const resolver = conSoleReSolver;
        conSoleReSolver = null;
        resolver();
    }
}

window.log = (message, color = "#4caf50") => {
    if (!logOutput) return;
    const logLine = document.createElement("div");
    logLine.style.color = color;
    logLine.className = "log-line";
    const timestamp = new Date().toLocaleTimeString();
    logLine.innerHTML = `<span style="color:#666">[${timestamp}]</span> ${message}`;
    logOutput.appendChild(logLine);
    while (logOutput.children.length > CONFIG.maxLogLines) logOutput.removeChild(logOutput.firstChild);
    logOutput.scrollTop = logOutput.scrollHeight;
};

window.wait = ms => new Promise(resolve => setTimeout(resolve, ms));
window.input = async (prompt = "Enter value:") => new Promise(resolve => {
    log(prompt, "#00bcd4");
    const previousResolver = conSoleReSolver;
    conSoleReSolver = () => {
        const value = window.prompt(prompt);
        resolve(value);
        if (previousResolver) previousResolver();
    };
    switchTab("conSole");
});
window.clear = () => { if (logOutput) logOutput.innerHTML = ""; };
window.alert = msg => log(`⚠️ ${msg}`, "#ff9800");

function terminalPrint(message, color = "#fff") {
    if (!SoltuxDisplay) return;
    const line = document.createElement("div");
    line.style.color = color;
    line.className = "terminal-line";
    line.innerText = message;
    SoltuxDisplay.appendChild(line);
    SoltuxDisplay.scrollTop = SoltuxDisplay.scrollHeight;
}

function showSyntaxHelp() {
    terminalPrint("═══════════════════════════════════════════════════════════", "#00ffff");
    terminalPrint("                    Sol SYNTAX REFERENCE                    ", "#fff");
    terminalPrint("═══════════════════════════════════════════════════════════", "#00ffff");
    terminalPrint("┌─ VARIABLES ─────────────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ create name              → Declare variable             │", "#fff");
    terminalPrint("│ create name = value      → Declare and assign           │", "#fff");
    terminalPrint("│ set name = value         → Update variable              │", "#fff");
    terminalPrint("│ delete name              → Remove variable              │", "#fff");
    terminalPrint("├─ FUNCTIONS & MODULES ───────────────────────────────────┤", "#00bcd4");
    terminalPrint("│ create function name()   → Create a function            │", "#fff");
    terminalPrint("│ return value             → Return value from function   │", "#fff");
    terminalPrint("│ require('name')          → Import an external module    │", "#fff");
    terminalPrint("├─ LOOPS ─────────────────────────────────────────────────┤", "#00bcd4");
    terminalPrint("│ loop                     → Infinite loop                │", "#fff");
    terminalPrint("│ repeat 5 times           → Repeat five times            │", "#fff");
    terminalPrint("│ foreach item in array    → Iterate an array             │", "#fff");
    terminalPrint("│ stoploop                 → Stop current loop            │", "#fff");
    terminalPrint("│ nextloop                 → Continue current loop        │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("For terminal commands, type /help", "#bbb");
}

function normalizeModuleName(name) {
    let moduleName = String(name).trim();
    if ((moduleName.startsWith("'") && moduleName.endsWith("'")) || (moduleName.startsWith('"') && moduleName.endsWith('"'))) {
        moduleName = moduleName.slice(1, -1);
    }
    moduleName = moduleName.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^\.\//, "");
    return moduleName;
}

function getProjectModuleSource(name) {
    const project = getActiveProject();
    if (!project) return null;

    const normalized = normalizeModuleName(name).replace(/^\.\//, "");
    const candidates = new Set();
    candidates.add(normalized);
    candidates.add(`${normalized}.sol`);
    candidates.add(`${normalized}.Sol`);
    if (!normalized.includes("/")) {
        candidates.add(`modules/${normalized}`);
        candidates.add(`modules/${normalized}.sol`);
        candidates.add(`modules/${normalized}.Sol`);
    }

    const files = listProjectFiles(project);
    for (const candidate of candidates) {
        const match = files.find(file => normalizeRelativePath(file.path) === normalizeRelativePath(candidate));
        if (match) return match.content;
    }
    return null;
}

function getModuleUrl(name) {
    const normalized = normalizeModuleName(name);
    if (normalized.startsWith("http://") || normalized.startsWith("https://")) return normalized;
    if (normalized.endsWith(".sol") || normalized.endsWith(".Sol")) return `${CONFIG.moduleDirectory}${normalized}`;
    return `${CONFIG.moduleDirectory}${normalized}${CONFIG.moduleExtension}`;
}

async function fetchModuleSource(name) {
    const source = getProjectModuleSource(name);
    if (source !== null) return source;

    const url = getModuleUrl(name);
    const response = await fetch(url, { method: "GET", cache: "no-cache" });
    if (!response.ok) throw new Error(`Module '${name}' could not be loaded: HTTP ${response.status}`);
    return await response.text();
}

function createModuleRecord(name) {
    return { name, exports: {}, loaded: false, loading: true };
}

function createModuleEnvironment(module, executionId) {
    const moduleExports = module.exports;
    const moduleRequire = async name => await loadSolModule(name, executionId);
    return { module, exports: moduleExports, require: moduleRequire };
}

async function loadSolModule(name, executionId) {
    const moduleName = normalizeModuleName(name);
    if (!moduleName) throw new Error("Module name cannot be empty");
    if (moduleCache.has(moduleName)) return moduleCache.get(moduleName);
    if (moduleLoading.has(moduleName)) return await moduleLoading.get(moduleName);

    const loadingPromise = (async () => {
        const module = createModuleRecord(moduleName);
        moduleCache.set(moduleName, module.exports);

        const source = await fetchModuleSource(moduleName);
        const transformed = transformSolCode(source, executionId);
        const helpers = createRuntimeHelpers(executionId);
        const environment = createModuleEnvironment(module, executionId);
        const finalCode = `\n${helpers}\n${transformed}\n`;

        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const moduleFunction = new AsyncFunction("module", "exports", "require", "loadSolModule", "moduleCache", finalCode);
        const returned = await moduleFunction(environment.module, environment.exports, environment.require, loadSolModule, moduleCache);

        if (returned !== undefined) module.exports = returned;
        module.loaded = true;
        module.loading = false;
        moduleCache.set(moduleName, module.exports);
        return module.exports;
    })();

    moduleLoading.set(moduleName, loadingPromise);
    try { return await loadingPromise; }
    finally { moduleLoading.delete(moduleName); }
}

function createRuntimeHelpers(executionId) {
    return `
        const __execId = ${executionId};
        const rng = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const range = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => start + i);
        const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
        const pick = arr => {
            if (!arr || !arr.length) return undefined;
            return arr[Math.floor(Math.random() * arr.length)];
        };
        const error = msg => log(String(msg), "#f44336");
        const warn = msg => log(String(msg), "#ff9800");
        const success = msg => log(String(msg), "#4caf50");
        const require = async name => await loadSolModule(name, __execId);
    `;
}

function transformSolCode(source, executionId) {
    let code = String(source);
    code = code.replace(/--.*$/gm, "");
    code = code.replace(/\/\/.*$/gm, "");
    code = code.replace(/\/\*[\s\S]*?\*\//g, "");
    code = code.replace(/^\s*clear\s*$/gim, "clear();");
    code = code.replace(/math\((.*?)\)/ig, (_, content) => {
        const transformed = content.replace(/\[(.*?)\]/g, "$1").replace(/÷/g, "/").replace(/×/g, "*");
        return `(${transformed})`;
    });
    code = code.replace(/\bhour\b/ig, "(new Date().getHours())");
    code = code.replace(/\bminutes\b/ig, "(new Date().getMinutes())");
    code = code.replace(/\bseconds\b/ig, "(new Date().getSeconds())");
    code = code.replace(/\bday\b/ig, "(new Date().getDate())");
    code = code.replace(/\bmonth\b/ig, "(new Date().getMonth() + 1)");
    code = code.replace(/\byear\b/ig, "(new Date().getFullYear())");
    code = code.replace(/\btimestamp\b/ig, "(Date.now())");
    code = code.replace(/\bcreate\s+function\s+(\w+)\s*\(\s*(.*?)\s*\)/ig, "var $1 = async function($2) {");
    code = code.replace(/\bcreate\s+function\s+(\w+)/ig, "var $1 = async function() {");
    code = code.replace(/\bset\s+function\s+(\w+)\s*\(\s*(.*?)\s*\)/ig, "$1 = async function($2) {");
    code = code.replace(/\bset\s+function\s+(\w+)/ig, "$1 = async function() {");
    code = code.replace(/\breturn\s+(.+)$/gim, "return $1;");
    code = code.replace(/^\s*\breturn\b\s*$/gim, "return;");
    code = code.replace(/\bcreate\s+(\w+)\s*=\s*/ig, "var $1 = ");
    code = code.replace(/\bcreate\s+(\w+)\s*$/img, "var $1");
    code = code.replace(/\bset\s+(\w+)\s*=\s*/ig, "$1 = ");
    code = code.replace(/\bdelete\s+(\w+)/ig, "$1 = undefined");

    function mapOp(op) {
        if (op.trim() === "=") return "===";
        if (op.trim() === "!=") return "!==";
        return op.trim();
    }

    function stripOuterParens(value) {
        value = value.trim();
        if (value.startsWith("(") && value.endsWith(")")) return value.slice(1, -1).trim();
        return value;
    }

    code = code.replace(/\bif\s+not\s+(.+?)\s+then\b/ig, (_, raw) => {
        const inner = stripOuterParens(raw);
        const match = inner.match(/^(\w+)\s*(===|!==|>=|<=|>|<|!=|=)\s*(.+)$/i);
        if (match) {
            if (match[2].trim() === "=" || match[2].trim() === "!=") {
                return `if (${match[1]} ${mapOp(match[2]) === "===" ? "!==" : "==="} ${match[3].trim()}) {`;
            }
            return `if (!(${match[1]} ${mapOp(match[2])} ${match[3].trim()})) {`;
        }
        return `if (!(${inner})) {`;
    });

    code = code.replace(/\bif\s+(.+?)\s+then\b/ig, (_, raw) => {
        const inner = stripOuterParens(raw);
        const match = inner.match(/^(\w+)\s*(===|!==|>=|<=|>|<|!=|=)\s*(.+)$/i);
        if (match) return `if (${match[1]} ${mapOp(match[2])} ${match[3].trim()}) {`;
        return `if (${inner}) {`;
    });

    code = code.replace(/\belse\b/ig, "} else {");
    const executionCheck = `if(__execId !== ${executionId}) break;`;
    code = code.replace(/\bloop\s*\(?\s*\)?\s*(?=\s|$)/ig, `while(true) { ${executionCheck}`);
    code = code.replace(/\brepeat\s+(\d+)\s+times\b/ig, `for(let __i=0; __i<$1; __i++) { ${executionCheck}`);
    code = code.replace(/\bforeach\s+(\w+)\s+in\s+(\w+)\b/ig, `for(let $1 of $2) { ${executionCheck}`);
    code = code.replace(/\bstoploop\b/ig, "__STOPLOOP__");
    code = code.replace(/\bnextloop\b/ig, "__NEXTLOOP__");
    code = code.replace(/\bexecute\s*\(\s*(\w+\s*\(.*?\))\s*\)/ig, "await $1");
    code = code.replace(/\bexecute\s*\(\s*(\w+)\s*\)/ig, "await $1()");
    code = code.replace(/^\s*\bbreak\b\s*$/img, "}");
    code = code.replace(/__STOPLOOP__/g, "break");
    code = code.replace(/__NEXTLOOP__/g, "continue");
    code = code.replace(/(?<!await )\bwait\s*\(/g, "await wait(");
    code = code.replace(/\bwait\s*\(\s*checkconSole\s*\)/ig, "await new Promise(r => { conSoleReSolver = r; })");
    code = code.replace(/\bcheckconSole\b/ig, "switchTab('conSole');");
    code = code.replace(/\barray\s*\[(.*?)\]/ig, "[$1]");
    code = code.replace(/\bobject\s*\{(.*?)\}/ig, "{$1}");
    code = code.replace(/\blength\s+of\s+(\w+)/ig, "$1.length");
    code = code.replace(/\bpush\s+(\w+)\s+to\s+(\w+)/ig, "$2.push($1)");
    code = code.replace(/\bremove\s+from\s+(\w+)\s+at\s+(\d+)/ig, "$1.splice($2, 1)");
    code = code.replace(/\brandom\s+(\d+)\s+to\s+(\d+)/ig, "rng($1, $2)");
    code = code.replace(/\brandom\b/ig, "Math.random()");
    code = code.replace(/\brequire\s*\(\s*(["'])(.*?)\1\s*\)/ig, "await require($1$2$1)");
    return code;
}

async function runSol() {
    if (getActiveProject() && state.activeFilePath) saveActiveFile();

    currentExecutionId++;
    const thisExecutionId = currentExecutionId;
    activeExecutionId = thisExecutionId;

    let code = editor.innerText.trim();
    if (!code) return;

    switchTab("conSole");
    logOutput.innerHTML = "";
    moduleCache.clear();
    moduleLoading.clear();

    code = transformSolCode(code, thisExecutionId);
    const helpers = createRuntimeHelpers(thisExecutionId);
    const finalCode = `${helpers}\n${code}`;

    try {
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        await new AsyncFunction("loadSolModule", "moduleCache", finalCode)(loadSolModule, moduleCache);
    } catch (err) {
        if (thisExecutionId !== activeExecutionId) return;
        const message = err && err.message ? err.message : String(err);
        log(`✗ RUNTIME ERROR: ${message}`, "#f44336");

        const stack = err && err.stack ? err.stack : "";
        const stackLines = stack.split("\n");
        let lineInfo = "";
        for (const line of stackLines) {
            const match = line.match(/<anonymous>:(\d+):/);
            if (match) {
                const sourceLine = Math.max(1, parseInt(match[1], 10) - helpers.split("\n").length);
                lineInfo = ` (near line ${sourceLine})`;
                break;
            }
        }
        log(`📍 Location${lineInfo}`, "#ff9800");
    }
}

async function exportProject() {
    if (typeof JSZip === "undefined") {
        terminalPrint("[ERR] JSZip library not loaded!", "#f44336");
        return;
    }

    const project = getActiveProject();
    const zip = new JSZip();

    if (project) {
        listProjectFiles(project).forEach(file => {
            zip.file(normalizeRelativePath(file.path), file.content || "");
        });

        const content = await zip.generateAsync({ type: "blob" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(content);
        a.download = `${project.name || "Sol_Project"}.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
        terminalPrint("✓ Projeto exportado com sucesso.", "#4caf50");
        return;
    }

    const code = editor.innerText;
    zip.file("script.Sol", code);
    zip.file("metadata.json", JSON.stringify({ version: "1.9.0", developer: "AreDev", created: new Date().toISOString(), lines: code.split("\n").length }, null, 2));
    zip.file("README.md", ["# Sol Project Export", "", `Version: 1.9.0`, `Created: ${new Date().toISOString()}`, `Lines: ${code.split("\n").length}`].join("\n"));

    const content = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = `Sol_Project_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    terminalPrint("✓ Project exported successfully.", "#4caf50");
}

function clearEditor() {
    if (confirm("Clear all code? This action cannot be undone.")) {
        editor.innerText = "";
        updateEditor();
        if (getActiveProject() && state.activeFilePath) saveActiveFile();
    }
}

function handleFile(input) {
    const file = input.files[0];
    if (!file) return;

    const project = getActiveProject();
    const reader = new FileReader();
    reader.onload = function (event) {
        const content = typeof event.target.result === "string" ? event.target.result : "";

        if (project) {
            const parentPath = getSelectedParentPath();
            const fileName = file.name.trim();
            createFileNodeAtPath(project, parentPath, fileName, content);
            persistProjects();
            renderExplorer();
            const createdPath = joinPath(parentPath, findAvailableName(project, parentPath, fileName));
            openFileInEditor(createdPath);
        } else {
            editor.innerText = content;
            updateEditor();
            persistProjects();
        }

        input.value = "";
    };

    reader.onerror = () => terminalPrint("Failed to read file.", "#f44336");
    reader.readAsText(file);
}

function saveToLocalStorage() {
    try {
        localStorage.setItem("Sol_code", editor.innerText);
        localStorage.setItem("Sol_saved_at", new Date().toISOString());
        persistProjects();
    } catch (error) {
        terminalPrint("✗ Auto-save failed.", "#f44336");
    }
}

function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem("Sol_code");
        if (saved) {
            editor.innerText = saved;
            updateEditor();
        }
    } catch (error) {
        terminalPrint("Failed to load from storage.", "#f44336");
    }
}

function startAutoSave() {
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    autoSaveTimer = setInterval(saveToLocalStorage, CONFIG.autoSaveInterval);
}

function stopAutoSave() {
    if (autoSaveTimer) {
        clearInterval(autoSaveTimer);
        autoSaveTimer = null;
    }
}

function clearModuleCache() {
    moduleCache.clear();
    moduleLoading.clear();
}

SoltuxInput.addEventListener("keydown", async event => {
    if (event.key === "Enter") {
        const value = SoltuxInput.value.trim();
        if (!value) return;

        commandHistory.push(value);
        historyIndex = commandHistory.length;

        const parts = value.split(" ");
        const command = parts[0];
        const args = parts.slice(1);

        SoltuxInput.value = "";
        terminalPrint(`E:\\> ${value}`, "#fff");

        switch (command.toLowerCase()) {
            case "/clear":
                SoltuxDisplay.innerHTML = "";
                break;
            case "/ver":
            case "/version":
                terminalPrint("Sol v1.9.0 (Project Explorer + Require)", "#00ffff");
                terminalPrint("Developer: AreDev", "#00ffff");
                terminalPrint("Features: Project Explorer, File Management, Require", "#00bcd4");
                break;
            case "/help":
                terminalPrint("═══════════════════════════════════════", "#00ffff");
                terminalPrint("        Soltux TERMINAL COMMANDS        ", "#fff");
                terminalPrint("═══════════════════════════════════════", "#00ffff");
                terminalPrint("  /clear         - Clear terminal screen", "#fff");
                terminalPrint("  /ver           - Show version info", "#fff");
                terminalPrint("  /help          - Show terminal commands", "#fff");
                terminalPrint("  /helpsyntax    - Show Sol syntax guide", "#fff");
                terminalPrint("  /save          - Save code to browser storage", "#fff");
                terminalPrint("  /load          - Load code from storage", "#fff");
                terminalPrint("  /debug on/off  - Toggle debug mode", "#fff");
                terminalPrint("  /export        - Export project as ZIP", "#fff");
                terminalPrint("  /stop          - Stop current execution", "#fff");
                break;
            case "/helpsyntax":
                showSyntaxHelp();
                break;
            case "/save":
                saveToLocalStorage();
                break;
            case "/load":
                loadFromLocalStorage();
                break;
            case "/debug":
                if (args[0] === "on") {
                    runtime.debugMode = true;
                    terminalPrint("Debug mode enabled.", "#4caf50");
                } else if (args[0] === "off") {
                    runtime.debugMode = false;
                    terminalPrint("Debug mode disabled.", "#f44336");
                } else {
                    terminalPrint(`Debug mode is ${runtime.debugMode ? "ON" : "OFF"}`, "#00bcd4");
                }
                break;
            case "/export":
                await exportProject();
                break;
            case "/stop":
                currentExecutionId++;
                activeExecutionId = null;
                clearModuleCache();
                terminalPrint("⚠️ All executions stopped.", "#f44336");
                break;
            default:
                terminalPrint(`Unknown command: ${command}. Type /help for available commands.`, "#f44336");
        }
        return;
    }

    if (event.key === "ArrowUp") {
        event.preventDefault();
        if (historyIndex > 0) {
            historyIndex--;
            SoltuxInput.value = commandHistory[historyIndex];
        }
        return;
    }

    if (event.key === "ArrowDown") {
        event.preventDefault();
        if (historyIndex < commandHistory.length - 1) {
            historyIndex++;
            SoltuxInput.value = commandHistory[historyIndex];
        } else {
            historyIndex = commandHistory.length;
            SoltuxInput.value = "";
        }
    }
});

editor.addEventListener("input", () => {
    updateEditor();
    if (autoSaveTimer) saveToLocalStorage();
});

editor.addEventListener("paste", event => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
});

window.addEventListener("beforeunload", () => {
    if (editor.innerText.trim()) saveToLocalStorage();
    stopAutoSave();
});

terminalPrint("═══════════════════════════════════════", "#00ffff");
terminalPrint("  Sol v1.9.0 (Project Explorer + Require)", "#fff");
terminalPrint("  Developer: AreDev", "#00bcd4");
terminalPrint("═══════════════════════════════════════", "#00ffff");
terminalPrint("Type /help for commands | /helpsyntax for syntax", "#bbb");
terminalPrint("", "#fff");

if (!loadProjectsFromStorage()) {
    const project = createProject("MeuProjeto");
    state.projects = [project];
    state.activeProjectId = project.id;
    state.activeFilePath = "main.sol";
    renderAll();
} else {
    const currentProject = getActiveProject();
    if (currentProject && findNode(currentProject, state.activeFilePath)) openFileInEditor(state.activeFilePath);
    else if (currentProject) {
        const firstFile = listProjectFiles(currentProject)[0];
        if (firstFile) {
            state.activeFilePath = firstFile.path;
            openFileInEditor(firstFile.path);
        }
    }
    renderAll();
}

loadFromLocalStorage();
startAutoSave();
updateEditor();
renderAll();

window.toggleExplorer = toggleExplorer;
window.handleFile = handleFile;
window.exportProject = exportProject;
window.runSol = runSol;
window.clearEditor = clearEditor;
window.switchTab = switchTab;
window.saveToLocalStorage = saveToLocalStorage;
window.loadFromLocalStorage = loadFromLocalStorage;
window.clearModuleCache = clearModuleCache;

if (window.innerWidth <= 768) setTimeout(() => toggleExplorer(), 100);

console.log("Sol Executor loaded with project explorer support.");
