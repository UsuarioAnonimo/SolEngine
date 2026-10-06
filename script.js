// minha línguagem de programação - Sol v1.9.0
const CONFIG = {
    maxLogLines: 500,
    autoSaveInterval: 30000,
    theme: "dark",
    moduleDirectory: "./modules/",
    moduleExtension: ".Sol"
};

let currentExecutionId = 0;
let activeExecutionId = null;

let conSoleReSolver = null;
let commandHistory = [];
let historyIndex = -1;
let autoSaveTimer = null;

const moduleCache = new Map();
const moduleLoading = new Map();

const editor =
    document.getElementById("code-editor");

const lineNumbers =
    document.getElementById("line-numbers");

const logOutput =
    document.getElementById("log-output");

const SoltuxDisplay =
    document.getElementById("Soltux-display");

const SoltuxInput =
    document.getElementById("Soltux-input");

class SolRuntime {
    constructor() {
        this.variables = new Map();
        this.functions = new Map();
        this.breakpoints = new Set();
        this.debugMode = false;
    }

    setVar(name, value) {
        this.variables.set(name, value);

        if (this.debugMode) {
            log(
                `[DEBUG] ${name} = ${JSON.stringify(value)}`,
                "#ffeb3b"
            );
        }
    }

    getVar(name) {
        return this.variables.get(name);
    }

    hasVar(name) {
        return this.variables.has(name);
    }

    deleteVar(name) {
        this.variables.delete(name);
    }

    clear() {
        this.variables.clear();
        this.functions.clear();
    }
}

const runtime =
    new SolRuntime();

function updateEditor() {
    if (!lineNumbers || !editor) {
        return;
    }

    const text =
        editor.innerText;

    const lines =
        text.split("\n").length || 1;

    lineNumbers.innerHTML =
        Array.from(
            {
                length: lines
            },
            (_, i) => {
                const num =
                    i + 1;

                const hasBreakpoint =
                    runtime.breakpoints.has(
                        num
                    );

                return `
                    <span class="${
                        hasBreakpoint
                            ? "breakpoint"
                            : ""
                    }">${num}</span>
                `;
            }
        ).join("<br>");
}

function switchTab(tabId) {
    document
        .querySelectorAll(".tab-btn")
        .forEach(btn => {
            btn.classList.remove(
                "active"
            );
        });

    document
        .querySelectorAll(".content")
        .forEach(content => {
            content.classList.remove(
                "active"
            );
        });

    const targetContent =
        document.getElementById(
            tabId
        );

    const targetBtn =
        document.querySelector(
            `[onclick="switchTab('${tabId}')"]`
        );

    if (targetContent) {
        targetContent.classList.add(
            "active"
        );
    }

    if (targetBtn) {
        targetBtn.classList.add(
            "active"
        );
    }

    if (
        tabId === "conSole" &&
        conSoleReSolver
    ) {
        const resolver =
            conSoleReSolver;

        conSoleReSolver = null;

        resolver();
    }
}

window.log = (
    message,
    color = "#4caf50"
) => {
    if (!logOutput) {
        return;
    }

    const logLine =
        document.createElement(
            "div"
        );

    logLine.style.color =
        color;

    logLine.className =
        "log-line";

    const timestamp =
        new Date().toLocaleTimeString();

    logLine.innerHTML =
        `<span style="color:#666">[${timestamp}]</span> ${message}`;

    logOutput.appendChild(
        logLine
    );

    while (
        logOutput.children.length >
        CONFIG.maxLogLines
    ) {
        logOutput.removeChild(
            logOutput.firstChild
        );
    }

    logOutput.scrollTop =
        logOutput.scrollHeight;
};

window.wait = ms => {
    return new Promise(
        resolve => {
            setTimeout(
                resolve,
                ms
            );
        }
    );
};

window.input = async (
    prompt = "Enter value:"
) => {
    return new Promise(
        resolve => {
            log(
                prompt,
                "#00bcd4"
            );

            const previousResolver =
                conSoleReSolver;

            conSoleReSolver =
                () => {
                    const value =
                        window.prompt(
                            prompt
                        );

                    resolve(value);

                    if (
                        previousResolver
                    ) {
                        previousResolver();
                    }
                };

            switchTab(
                "conSole"
            );
        }
    );
};

window.clear = () => {
    if (logOutput) {
        logOutput.innerHTML =
            "";
    }
};

window.alert = msg => {
    log(
        `⚠️ ${msg}`,
        "#ff9800"
    );
};

function terminalPrint(
    message,
    color = "#fff"
) {
    if (!SoltuxDisplay) {
        return;
    }

    const terminalLine =
        document.createElement(
            "div"
        );

    terminalLine.style.color =
        color;

    terminalLine.className =
        "terminal-line";

    terminalLine.innerText =
        message;

    SoltuxDisplay.appendChild(
        terminalLine
    );

    SoltuxDisplay.scrollTop =
        SoltuxDisplay.scrollHeight;
}

function showSyntaxHelp() {
    terminalPrint(
        "═══════════════════════════════════════════════════════════",
        "#00ffff"
    );

    terminalPrint(
        "                    Sol SYNTAX REFERENCE                    ",
        "#fff"
    );

    terminalPrint(
        "═══════════════════════════════════════════════════════════",
        "#00ffff"
    );

    terminalPrint(
        "┌─ VARIABLES ─────────────────────────────────────────────┐",
        "#00bcd4"
    );

    terminalPrint(
        "│ create name              → Declare variable             │",
        "#fff"
    );

    terminalPrint(
        "│ create name = value      → Declare and assign           │",
        "#fff"
    );

    terminalPrint(
        "│ set name = value         → Update variable              │",
        "#fff"
    );

    terminalPrint(
        "│ delete name              → Remove variable              │",
        "#fff"
    );

    terminalPrint(
        "├─ FUNCTIONS & MODULES ───────────────────────────────────┤",
        "#00bcd4"
    );

    terminalPrint(
        "│ create function name()   → Create a function            │",
        "#fff"
    );

    terminalPrint(
        "│ return value             → Return value from function   │",
        "#fff"
    );

    terminalPrint(
        "│ require('name')          → Import an external module    │",
        "#fff"
    );

    terminalPrint(
        "├─ LOOPS ─────────────────────────────────────────────────┤",
        "#00bcd4"
    );

    terminalPrint(
        "│ loop                     → Infinite loop                │",
        "#fff"
    );

    terminalPrint(
        "│ repeat 5 times           → Repeat five times            │",
        "#fff"
    );

    terminalPrint(
        "│ foreach item in array    → Iterate an array             │",
        "#fff"
    );

    terminalPrint(
        "│ stoploop                 → Stop current loop            │",
        "#fff"
    );

    terminalPrint(
        "│ nextloop                 → Continue current loop        │",
        "#fff"
    );

    terminalPrint(
        "└─────────────────────────────────────────────────────────┘",
        "#00bcd4"
    );

    terminalPrint(
        "For terminal commands, type /help",
        "#bbb"
    );
}

function normalizeModuleName(
    name
) {
    let moduleName =
        String(name)
            .trim();

    if (
        (
            moduleName.startsWith(
                "'"
            ) &&
            moduleName.endsWith(
                "'"
            )
        ) ||
        (
            moduleName.startsWith(
                '"'
            ) &&
            moduleName.endsWith(
                '"'
            )
        )
    ) {
        moduleName =
            moduleName.slice(
                1,
                -1
            );
    }

    moduleName =
        moduleName
            .replace(
                /\\/g,
                "/"
            )
            .replace(
                /^\/+/, 
                ""
            );

    return moduleName;
}

function getModuleUrl(
    name
) {
    const normalized =
        normalizeModuleName(
            name
        );

    if (
        normalized.startsWith(
            "http://"
        ) ||
        normalized.startsWith(
            "https://"
        )
    ) {
        return normalized;
    }

    if (
        normalized.endsWith(
            ".Sol"
        ) ||
        normalized.endsWith(
            ".sol"
        )
    ) {
        return `${CONFIG.moduleDirectory}${normalized}`;
    }

    return `${CONFIG.moduleDirectory}${normalized}${CONFIG.moduleExtension}`;
}

function createModuleRecord(
    name
) {
    return {
        name,
        exports: {},
        loaded: false,
        loading: true
    };
}

function getCachedModule(
    name
) {
    return moduleCache.get(
        normalizeModuleName(
            name
        )
    );
}

function cacheModule(
    name,
    value
) {
    moduleCache.set(
        normalizeModuleName(
            name
        ),
        value
    );
}

async function fetchModuleSource(
    name
) {
    const url =
        getModuleUrl(
            name
        );

    const response =
        await fetch(
            url,
            {
                method: "GET",
                cache: "no-cache"
            }
        );

    if (!response.ok) {
        throw new Error(
            `Module '${name}' could not be loaded: HTTP ${response.status}`
        );
    }

    return await response.text();
}

function createModuleEnvironment(
    module,
    executionId
) {
    const moduleExports =
        module.exports;

    const moduleRequire =
        async name => {
            return await loadSolModule(
                name,
                executionId
            );
        };

    return {
        module,
        exports:
            moduleExports,
        require:
            moduleRequire
    };
}

async function loadSolModule(
    name,
    executionId
) {
    const moduleName =
        normalizeModuleName(
            name
        );

    if (!moduleName) {
        throw new Error(
            "Module name cannot be empty"
        );
    }

    if (
        moduleCache.has(
            moduleName
        )
    ) {
        return moduleCache.get(
            moduleName
        );
    }

    if (
        moduleLoading.has(
            moduleName
        )
    ) {
        return await moduleLoading.get(
            moduleName
        );
    }

    const loadingPromise =
        (async () => {
            const module =
                createModuleRecord(
                    moduleName
                );

            moduleCache.set(
                moduleName,
                module.exports
            );

            const source =
                await fetchModuleSource(
                    moduleName
                );

            const transformed =
                transformSolCode(
                    source,
                    executionId
                );

            const helpers =
                createRuntimeHelpers(
                    executionId
                );

            const environment =
                createModuleEnvironment(
                    module,
                    executionId
                );

            const finalCode =
                `
                ${helpers}
                ${transformed}
                `;

            const AsyncFunction =
                Object.getPrototypeOf(
                    async function() {}
                ).constructor;

            const moduleFunction =
                new AsyncFunction(
                    "module",
                    "exports",
                    "require",
                    "loadSolModule",
                    "moduleCache",
                    finalCode
                );

            const returned =
                await moduleFunction(
                    environment.module,
                    environment.exports,
                    environment.require,
                    loadSolModule,
                    moduleCache
                );

            if (
                returned !== undefined
            ) {
                module.exports =
                    returned;
            }

            module.loaded =
                true;

            module.loading =
                false;

            cacheModule(
                moduleName,
                module.exports
            );

            return module.exports;
        })();

    moduleLoading.set(
        moduleName,
        loadingPromise
    );

    try {
        return await loadingPromise;
    } finally {
        moduleLoading.delete(
            moduleName
        );
    }
}

function createRuntimeHelpers(
    executionId
) {
    return `
        const __execId = ${executionId};

        const rng = (
            min,
            max
        ) => {
            return Math.floor(
                Math.random() *
                (
                    max - min + 1
                )
            ) + min;
        };

        const sleep = ms => {
            return new Promise(
                resolve => {
                    setTimeout(
                        resolve,
                        ms
                    );
                }
            );
        };

        const range = (
            start,
            end
        ) => {
            return Array.from(
                {
                    length:
                        end - start + 1
                },
                (_, i) =>
                    start + i
            );
        };

        const shuffle = arr => {
            return [...arr].sort(
                () =>
                    Math.random() -
                    0.5
            );
        };

        const pick = arr => {
            if (
                !arr ||
                !arr.length
            ) {
                return undefined;
            }

            return arr[
                Math.floor(
                    Math.random() *
                    arr.length
                )
            ];
        };

        const error = msg => {
            log(
                String(msg),
                "#f44336"
            );
        };

        const warn = msg => {
            log(
                String(msg),
                "#ff9800"
            );
        };

        const success = msg => {
            log(
                String(msg),
                "#4caf50"
            );
        };

        const require = async name => {
            return await loadSolModule(
                name,
                __execId
            );
        };
    `;
}

function transformSolCode(
    source,
    executionId
) {
    let code =
        String(source);

    code =
        code.replace(
            /--.*$/gm,
            ""
        );

    code =
        code.replace(
            /\/\/.*$/gm,
            ""
        );

    code =
        code.replace(
            /\/\*[\s\S]*?\*\//g,
            ""
        );

    code =
        code.replace(
            /^\s*clear\s*$/gim,
            "clear();"
        );

    code =
        code.replace(
            /math\((.*?)\)/ig,
            (_, content) => {
                const transformed =
                    content
                        .replace(
                            /\[(.*?)\]/g,
                            "$1"
                        )
                        .replace(
                            /÷/g,
                            "/"
                        )
                        .replace(
                            /×/g,
                            "*"
                        );

                return `(${transformed})`;
            }
        );

    code =
        code.replace(
            /\bhour\b/ig,
            "(new Date().getHours())"
        );

    code =
        code.replace(
            /\bminutes\b/ig,
            "(new Date().getMinutes())"
        );

    code =
        code.replace(
            /\bseconds\b/ig,
            "(new Date().getSeconds())"
        );

    code =
        code.replace(
            /\bday\b/ig,
            "(new Date().getDate())"
        );

    code =
        code.replace(
            /\bmonth\b/ig,
            "(new Date().getMonth() + 1)"
        );

    code =
        code.replace(
            /\byear\b/ig,
            "(new Date().getFullYear())"
        );

    code =
        code.replace(
            /\btimestamp\b/ig,
            "(Date.now())"
        );

    code =
        code.replace(
            /\bcreate\s+function\s+(\w+)\s*\(\s*(.*?)\s*\)/ig,
            "var $1 = async function($2) {"
        );

    code =
        code.replace(
            /\bcreate\s+function\s+(\w+)/ig,
            "var $1 = async function() {"
        );

    code =
        code.replace(
            /\bset\s+function\s+(\w+)\s*\(\s*(.*?)\s*\)/ig,
            "$1 = async function($2) {"
        );

    code =
        code.replace(
            /\bset\s+function\s+(\w+)/ig,
            "$1 = async function() {"
        );

    code =
        code.replace(
            /\breturn\s+(.+)$/gim,
            "return $1;"
        );

    code =
        code.replace(
            /^\s*\breturn\b\s*$/gim,
            "return;"
        );

    code =
        code.replace(
            /\bcreate\s+(\w+)\s*=\s*/ig,
            "var $1 = "
        );

    code =
        code.replace(
            /\bcreate\s+(\w+)\s*$/img,
            "var $1"
        );

    code =
        code.replace(
            /\bset\s+(\w+)\s*=\s*/ig,
            "$1 = "
        );

    code =
        code.replace(
            /\bdelete\s+(\w+)/ig,
            "$1 = undefined"
        );

    function mapOp(op) {
        if (
            op.trim() === "="
        ) {
            return "===";
        }

        if (
            op.trim() === "!="
        ) {
            return "!==";
        }

        return op.trim();
    }

    function stripOuterParens(
        value
    ) {
        value =
            value.trim();

        if (
            value.startsWith("(") &&
            value.endsWith(")")
        ) {
            return value.slice(
                1,
                -1
            ).trim();
        }

        return value;
    }

    code =
        code.replace(
            /\bif\s+not\s+(.+?)\s+then\b/ig,
            (_, raw) => {
                const inner =
                    stripOuterParens(
                        raw
                    );

                const match =
                    inner.match(
                        /^(\w+)\s*(===|!==|>=|<=|>|<|!=|=)\s*(.+)$/i
                    );

                if (match) {
                    if (
                        match[2].trim() === "=" ||
                        match[2].trim() === "!="
                    ) {
                        return `if (${match[1]} ${
                            mapOp(match[2]) === "==="
                                ? "!=="
                                : "==="
                        } ${match[3].trim()}) {`;
                    }

                    return `if (!(${match[1]} ${mapOp(match[2])} ${match[3].trim()})) {`;
                }

                return `if (!(${inner})) {`;
            }
        );

    code =
        code.replace(
            /\bif\s+(.+?)\s+then\b/ig,
            (_, raw) => {
                const inner =
                    stripOuterParens(
                        raw
                    );

                const match =
                    inner.match(
                        /^(\w+)\s*(===|!==|>=|<=|>|<|!=|=)\s*(.+)$/i
                    );

                if (match) {
                    return `if (${match[1]} ${mapOp(match[2])} ${match[3].trim()}) {`;
                }

                return `if (${inner}) {`;
            }
        );

    code =
        code.replace(
            /\belse\b/ig,
            "} else {"
        );

    const executionCheck =
        `if(__execId !== ${executionId}) break;`;

    code =
        code.replace(
            /\bloop\s*\(?\s*\)?\s*(?=\s|$)/ig,
            `while(true) { ${executionCheck}`
        );

    code =
        code.replace(
            /\brepeat\s+(\d+)\s+times\b/ig,
            `for(let __i=0; __i<$1; __i++) { ${executionCheck}`
        );

    code =
        code.replace(
            /\bforeach\s+(\w+)\s+in\s+(\w+)\b/ig,
            `for(let $1 of $2) { ${executionCheck}`
        );

    code =
        code.replace(
            /\bstoploop\b/ig,
            "__STOPLOOP__"
        );

    code =
        code.replace(
            /\bnextloop\b/ig,
            "__NEXTLOOP__"
        );

    code =
        code.replace(
            /\bexecute\s*\(\s*(\w+\s*\(.*?\))\s*\)/ig,
            "await $1"
        );

    code =
        code.replace(
            /\bexecute\s*\(\s*(\w+)\s*\)/ig,
            "await $1()"
        );

    code =
        code.replace(
            /^\s*\bbreak\b\s*$/img,
            "}"
        );

    code =
        code.replace(
            /__STOPLOOP__/g,
            "break"
        );

    code =
        code.replace(
            /__NEXTLOOP__/g,
            "continue"
        );

    code =
        code.replace(
            /(?<!await )\bwait\s*\(/g,
            "await wait("
        );

    code =
        code.replace(
            /\bwait\s*\(\s*checkconSole\s*\)/ig,
            "await new Promise(r => { conSoleReSolver = r; })"
        );

    code =
        code.replace(
            /\bcheckconSole\b/ig,
            "switchTab('conSole');"
        );

    code =
        code.replace(
            /\barray\s*\[(.*?)\]/ig,
            "[$1]"
        );

    code =
        code.replace(
            /\bobject\s*\{(.*?)\}/ig,
            "{$1}"
        );

    code =
        code.replace(
            /\blength\s+of\s+(\w+)/ig,
            "$1.length"
        );

    code =
        code.replace(
            /\bpush\s+(\w+)\s+to\s+(\w+)/ig,
            "$2.push($1)"
        );

    code =
        code.replace(
            /\bremove\s+from\s+(\w+)\s+at\s+(\d+)/ig,
            "$1.splice($2, 1)"
        );

    code =
        code.replace(
            /\brandom\s+(\d+)\s+to\s+(\d+)/ig,
            "rng($1, $2)"
        );

    code =
        code.replace(
            /\brandom\b/ig,
            "Math.random()"
        );

    code =
        code.replace(
            /\brequire\s*\(\s*(["'])(.*?)\1\s*\)/ig,
            "await require($1$2$1)"
        );

    return code;
}

async function runSol() {
    currentExecutionId++;

    const thisExecutionId =
        currentExecutionId;

    activeExecutionId =
        thisExecutionId;

    let code =
        editor.innerText.trim();

    if (!code) {
        return;
    }

    switchTab(
        "conSole"
    );

    logOutput.innerHTML =
        "";

    moduleCache.clear();
    moduleLoading.clear();

    code =
        transformSolCode(
            code,
            thisExecutionId
        );

    const helpers =
        createRuntimeHelpers(
            thisExecutionId
        );

    const finalCode =
        `${helpers}\n${code}`;

    try {
        const AsyncFunction =
            Object.getPrototypeOf(
                async function() {}
            ).constructor;

        await new AsyncFunction(
            "loadSolModule",
            "moduleCache",
            finalCode
        )(
            loadSolModule,
            moduleCache
        );
    } catch (err) {
        if (
            thisExecutionId !==
            activeExecutionId
        ) {
            return;
        }

        const message =
            err &&
            err.message
                ? err.message
                : String(err);

        log(
            `✗ RUNTIME ERROR: ${message}`,
            "#f44336"
        );

        const stack =
            err &&
            err.stack
                ? err.stack
                : "";

        const stackLines =
            stack.split("\n");

        let lineInfo =
            "";

        for (
            const line
            of stackLines
        ) {
            const match =
                line.match(
                    /<anonymous>:(\d+):/
                );

            if (match) {
                const sourceLine =
                    Math.max(
                        1,
                        parseInt(
                            match[1],
                            10
                        ) -
                        helpers.split(
                            "\n"
                        ).length
                    );

                lineInfo =
                    ` (near line ${sourceLine})`;

                break;
            }
        }

        log(
            `📍 Location${lineInfo}`,
            "#ff9800"
        );
    }
}

async function exportProject() {
    if (
        typeof JSZip ===
        "undefined"
    ) {
        terminalPrint(
            "[ERR] JSZip library not loaded!",
            "#f44336"
        );

        return;
    }

    const zip =
        new JSZip();

    const code =
        editor.innerText;

    const metadata = {
        version: "1.9.0",
        developer: "AreDev",
        created:
            new Date().toISOString(),
        lines:
            code.split(
                "\n"
            ).length
    };

    zip.file(
        "script.Sol",
        code
    );

    zip.file(
        "metadata.json",
        JSON.stringify(
            metadata,
            null,
            2
        )
    );

    zip.file(
        "README.md",
        [
            "# Sol Project Export",
            "",
            `Version: ${metadata.version}`,
            `Created: ${metadata.created}`,
            `Lines: ${metadata.lines}`
        ].join("\n")
    );

    const content =
        await zip.generateAsync(
            {
                type: "blob"
            }
        );

    const a =
        document.createElement(
            "a"
        );

    a.href =
        URL.createObjectURL(
            content
        );

    a.download =
        `Sol_Project_${Date.now()}.zip`;

    a.click();

    URL.revokeObjectURL(
        a.href
    );

    terminalPrint(
        "✓ Project exported successfully.",
        "#4caf50"
    );
}

function clearEditor() {
    if (
        confirm(
            "Clear all code? This action cannot be undone."
        )
    ) {
        editor.innerText =
            "";

        updateEditor();
    }
}

function handleFile(input) {
    const file =
        input.files[0];

    if (!file) {
        return;
    }

    const reader =
        new FileReader();

    reader.onload =
        event => {
            editor.innerText =
                event.target.result;

            updateEditor();
        };

    reader.onerror =
        () => {
            terminalPrint(
                "Failed to read file.",
                "#f44336"
            );
        };

    reader.readAsText(
        file
    );
}

function saveToLocalStorage() {
    try {
        localStorage.setItem(
            "Sol_code",
            editor.innerText
        );

        localStorage.setItem(
            "Sol_saved_at",
            new Date().toISOString()
        );

        terminalPrint(
            "✓ Auto-saved to browser.",
            "#4caf50"
        );
    } catch (error) {
        terminalPrint(
            "✗ Auto-save failed.",
            "#f44336"
        );
    }
}

function loadFromLocalStorage() {
    try {
        const saved =
            localStorage.getItem(
                "Sol_code"
            );

        if (saved) {
            editor.innerText =
                saved;

            updateEditor();
        }
    } catch (error) {
        terminalPrint(
            "Failed to load from storage.",
            "#f44336"
        );
    }
}

function startAutoSave() {
    if (autoSaveTimer) {
        clearInterval(
            autoSaveTimer
        );
    }

    autoSaveTimer =
        setInterval(
            saveToLocalStorage,
            CONFIG.autoSaveInterval
        );
}

function stopAutoSave() {
    if (autoSaveTimer) {
        clearInterval(
            autoSaveTimer
        );

        autoSaveTimer =
            null;
    }
}

function clearModuleCache() {
    moduleCache.clear();
    moduleLoading.clear();
}

function getModuleCacheSize() {
    return moduleCache.size;
}

function hasModule(
    name
) {
    return moduleCache.has(
        normalizeModuleName(
            name
        )
    );
}

function removeModule(
    name
) {
    moduleCache.delete(
        normalizeModuleName(
            name
        )
    );
}

function reloadModule(
    name
) {
    removeModule(
        name
    );

    return loadSolModule(
        name,
        activeExecutionId ||
            currentExecutionId
    );
}

SoltuxInput.addEventListener(
    "keydown",
    async event => {
        if (
            event.key ===
            "Enter"
        ) {
            const value =
                SoltuxInput.value.trim();

            if (!value) {
                return;
            }

            commandHistory.push(
                value
            );

            historyIndex =
                commandHistory.length;

            const parts =
                value.split(" ");

            const command =
                parts[0];

            const args =
                parts.slice(1);

            SoltuxInput.value =
                "";

            terminalPrint(
                `E:\\> ${value}`,
                "#fff"
            );

            switch (
                command.toLowerCase()
            ) {
                case "/clear":
                    SoltuxDisplay.innerHTML =
                        "";

                    break;

                case "/ver":
                case "/version":
                    terminalPrint(
                        "Sol v1.9.0 (Return & Require Update)",
                        "#00ffff"
                    );

                    terminalPrint(
                        "Developer: AreDev",
                        "#00ffff"
                    );

                    terminalPrint(
                        "Features: Execution Control, Modular Require, Returns",
                        "#00bcd4"
                    );

                    break;

                case "/help":
                    terminalPrint(
                        "═══════════════════════════════════════",
                        "#00ffff"
                    );

                    terminalPrint(
                        "        Soltux TERMINAL COMMANDS        ",
                        "#fff"
                    );

                    terminalPrint(
                        "═══════════════════════════════════════",
                        "#00ffff"
                    );

                    terminalPrint(
                        "  /clear         - Clear terminal screen",
                        "#fff"
                    );

                    terminalPrint(
                        "  /ver           - Show version info",
                        "#fff"
                    );

                    terminalPrint(
                        "  /help          - Show terminal commands",
                        "#fff"
                    );

                    terminalPrint(
                        "  /helpsyntax    - Show Sol syntax guide",
                        "#fff"
                    );

                    terminalPrint(
                        "  /save          - Save code to browser storage",
                        "#fff"
                    );

                    terminalPrint(
                        "  /load          - Load code from storage",
                        "#fff"
                    );

                    terminalPrint(
                        "  /debug on/off  - Toggle debug mode",
                        "#fff"
                    );

                    terminalPrint(
                        "  /export        - Export project as ZIP",
                        "#fff"
                    );

                    terminalPrint(
                        "  /stop          - Stop current execution",
                        "#fff"
                    );

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
                    if (
                        args[0] ===
                        "on"
                    ) {
                        runtime.debugMode =
                            true;

                        terminalPrint(
                            "Debug mode enabled.",
                            "#4caf50"
                        );
                    } else if (
                        args[0] ===
                        "off"
                    ) {
                        runtime.debugMode =
                            false;

                        terminalPrint(
                            "Debug mode disabled.",
                            "#f44336"
                        );
                    } else {
                        terminalPrint(
                            `Debug mode is ${
                                runtime.debugMode
                                    ? "ON"
                                    : "OFF"
                            }`,
                            "#00bcd4"
                        );
                    }

                    break;

                case "/export":
                    await exportProject();
                    break;

                case "/stop":
                    currentExecutionId++;

                    activeExecutionId =
                        null;

                    clearModuleCache();

                    terminalPrint(
                        "⚠️ All executions stopped.",
                        "#f44336"
                    );

                    break;

                default:
                    terminalPrint(
                        `Unknown command: ${command}. Type /help for available commands.`,
                        "#f44336"
                    );
            }

            return;
        }

        if (
            event.key ===
            "ArrowUp"
        ) {
            event.preventDefault();

            if (
                historyIndex >
                0
            ) {
                historyIndex--;

                SoltuxInput.value =
                    commandHistory[
                        historyIndex
                    ];
            }

            return;
        }

        if (
            event.key ===
            "ArrowDown"
        ) {
            event.preventDefault();

            if (
                historyIndex <
                commandHistory.length - 1
            ) {
                historyIndex++;

                SoltuxInput.value =
                    commandHistory[
                        historyIndex
                    ];
            } else {
                historyIndex =
                    commandHistory.length;

                SoltuxInput.value =
                    "";
            }
        }
    }
);

editor.addEventListener(
    "input",
    () => {
        updateEditor();

        if (autoSaveTimer) {
            saveToLocalStorage();
        }
    }
);

editor.addEventListener(
    "paste",
    event => {
        event.preventDefault();

        const text =
            event.clipboardData.getData(
                "text/plain"
            );

        document.execCommand(
            "insertText",
            false,
            text
        );
    }
);

lineNumbers.addEventListener(
    "click",
    event => {
        const lineNumber =
            parseInt(
                event.target.innerText,
                10
            );

        if (
            !isNaN(
                lineNumber
            )
        ) {
            if (
                runtime.breakpoints.has(
                    lineNumber
                )
            ) {
                runtime.breakpoints.delete(
                    lineNumber
                );
            } else {
                runtime.breakpoints.add(
                    lineNumber
                );
            }

            updateEditor();
        }
    }
);

window.addEventListener(
    "beforeunload",
    () => {
        if (
            editor.innerText.trim()
        ) {
            saveToLocalStorage();
        }

        stopAutoSave();
    }
);

terminalPrint(
    "═══════════════════════════════════════",
    "#00ffff"
);

terminalPrint(
    "  Sol v1.9.0 (Return & Require Update)",
    "#fff"
);

terminalPrint(
    "  Developer: AreDev",
    "#00bcd4"
);

terminalPrint(
    "═══════════════════════════════════════",
    "#00ffff"
);

terminalPrint(
    "Type /help for commands | /helpsyntax for syntax",
    "#bbb"
);

terminalPrint(
    "",
    "#fff"
);

loadFromLocalStorage();
startAutoSave();
updateEditor();
