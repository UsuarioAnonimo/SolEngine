// minha línguagem de programação
const PROXY_URL = "https://aredev-security.vercel.app/vercel/path0?file=";
const CONFIG = {
    maxLogLines: 500,
    autoSaveInterval: 30000,
    theme: 'dark'
};

// ═══════════════════════════════════════════════════════════════
//  SISTEMA DE CONTROLE DE EXECUÇÃO
// ═══════════════════════════════════════════════════════════════
let currentExecutionId = 0;
let activeExecutionId = null;

let consoleResolver = null;
let lastTerminalLine = null;
let executionContext = {};
let commandHistory = [];
let historyIndex = -1;
let autoSaveTimer = null;

const editor = document.getElementById('code-editor');
const lineNumbers = document.getElementById('line-numbers');
const logOutput = document.getElementById('log-output');
const soltuxDisplay = document.getElementById('soltux-display');
const soltuxInput = document.getElementById('soltux-input');

// ═══════════════════════════════════════════════════════════════
//  SISTEMA DE RUNTIME
// ═══════════════════════════════════════════════════════════════
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
    clear() {
        this.variables.clear();
        this.functions.clear();
    }
}
const runtime = new SolRuntime();

function updateEditor() {
    if (!lineNumbers || !editor) return;
    const text = editor.innerText;
    const lines = text.split('\n').length || 1;
    lineNumbers.innerHTML = Array.from({length: lines}, (_, i) => {
        const num = i + 1;
        const hasBreakpoint = runtime.breakpoints.has(num);
        return `<span class="${hasBreakpoint ? 'breakpoint' : ''}">${num}</span>`;
    }).join('<br>');
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.content').forEach(content => content.classList.remove('active'));
    const targetContent = document.getElementById(tabId);
    const targetBtn = document.querySelector(`[onclick="switchTab('${tabId}')"]`);
    if (targetContent) targetContent.classList.add('active');
    if (targetBtn) targetBtn.classList.add('active');
    if (tabId === 'console' && consoleResolver) {
        consoleResolver();
        consoleResolver = null;
    }
}

window.log = (message, color = "#4caf50") => {
    const logLine = document.createElement('div');
    logLine.style.color = color;
    logLine.className = 'log-line';
    const timestamp = new Date().toLocaleTimeString();
    logLine.innerHTML = `<span style="color: #666">[${timestamp}]</span> ${message}`;
    logOutput.appendChild(logLine);
    if (logOutput.children.length > CONFIG.maxLogLines) logOutput.removeChild(logOutput.firstChild);
    logOutput.scrollTop = logOutput.scrollHeight;
};

window.wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

window.input = async (prompt = "Enter value:") => {
    return new Promise(resolve => {
        log(prompt, "#00bcd4");
        const originalResolver = consoleResolver;
        consoleResolver = () => {
            const value = window.prompt(prompt);
            resolve(value);
            if (originalResolver) originalResolver();
        };
        switchTab('console');
    });
};

window.clear = () => { logOutput.innerHTML = ""; };
window.alert = (msg) => { log(`⚠️ ${msg}`, "#ff9800"); };

function terminalPrint(message, color = "#fff") {
    const terminalLine = document.createElement('div');
    terminalLine.style.color = color;
    terminalLine.className = 'terminal-line';
    terminalLine.innerText = message;
    soltuxDisplay.appendChild(terminalLine);
    soltuxDisplay.scrollTop = soltuxDisplay.scrollHeight;
}

function showSyntaxHelp() {
    terminalPrint("═══════════════════════════════════════════════════════════", "#00ffff");
    terminalPrint("                    SOL SYNTAX REFERENCE                    ", "#fff");
    terminalPrint("═══════════════════════════════════════════════════════════", "#00ffff");
    terminalPrint("┌─ VARIÁVEIS ─────────────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ create name              → Declara variável             │", "#fff");
    terminalPrint("│ create name = value      → Declara e atribui            │", "#fff");
    terminalPrint("│ set name = value         → Atualiza variável            │", "#fff");
    terminalPrint("│ delete name              → Remove variável              │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("Para comandos do terminal, digite /help", "#bbb");
}

async function importService(name) {
    if (document.getElementById(`lib-${name}`)) {
        terminalPrint(`[WARN] Service '${name}' already loaded.`, "#ff9800");
        return;
    }
    lastTerminalLine = document.createElement('div');
    lastTerminalLine.style.color = "#00ffff";
    lastTerminalLine.className = 'loading-line';
    soltuxDisplay.appendChild(lastTerminalLine);

    for (let i = 0; i <= 100; i += 20) {
        lastTerminalLine.innerText = `[${name}] ${'█'.repeat(i/5)}${'░'.repeat(20-i/5)} ${i}%`;
        await new Promise(r => setTimeout(r, 50));
    }

    try {
        const response = await fetch(`${PROXY_URL}${encodeURIComponent(name)}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const code = await response.text();
        const scriptTag = document.createElement('script');
        scriptTag.id = `lib-${name}`;
        scriptTag.text = code;
        document.head.appendChild(scriptTag);
        lastTerminalLine.remove();
        terminalPrint(`✓ Service '${name}' loaded successfully.`, "#4caf50");
    } catch (err) {
        lastTerminalLine.innerText = `✗ Failed to load ${name}: ${err.message}`;
        lastTerminalLine.style.color = "#f44336";
    }
}

// ═══════════════════════════════════════════════════════════════
//  TRANSPILADOR SOL → JAVASCRIPT (SEGURO E OTIMIZADO)
// ═══════════════════════════════════════════════════════════════
async function runSol() {
    currentExecutionId++;
    const thisExecutionId = currentExecutionId;
    activeExecutionId = thisExecutionId;
    
    log(`🆔 Execution ID: ${thisExecutionId}`, "#9c27b0");
    
    let code = editor.innerText.trim();
    if (!code) { log("No code to execute.", "#ff9800"); return; }

    switchTab('console');
    logOutput.innerHTML = "";
    log("🚀 Execution started...", "#2196f3");

    // ── 1. Remove comentários ──────────────
    code = code.replace(/--.*$/gm, "");
    code = code.replace(/\/\/.*$/gm, "");
    code = code.replace(/\/\*[\s\S]*?\*\//g, "");

    // ── 2. Imports e KIT ANTI-SOCO (Escudo Dinâmico) ───────────
    const importRegex = /importService\s*\(\s*["'](.*?)["']\s*\)/ig;
    const importMatches = [...code.matchAll(importRegex)];
    
    for (const match of importMatches) {
        const libName = match[1];
        await importService(libName); 
        
        if (window[libName] && typeof window[libName].getCommands === 'function') {
            const customCommands = window[libName].getCommands();
            customCommands.forEach(cmd => {
                code = code.replace(cmd.regex, cmd.replace);
            });
            log(`🛡️ Escudo adaptado para a biblioteca: ${libName}`, "#00bcd4");
        }
    }
    
    code = code.replace(/^\s*clear\s*$/gim, "logOutput.innerHTML = '';");    
    
    // ── 3. Math (Seguro - Sem eval) ──────────────────────────
    code = code.replace(/math\((.*?)\)/ig, (_, content) => {
        let t = content.replace(/\[(.*?)\]/g, "$1").replace(/÷/g, "/").replace(/×/g, "*");
        // Transpila para o JS nativo calcular de forma segura
        return `(${t})`; 
    });

    // ── 4. Tempo / Data ──────────────────────────────────────
    code = code.replace(/\bhour\b/ig,      "(new Date().getHours())");
    code = code.replace(/\bminutes\b/ig,   "(new Date().getMinutes())");
    code = code.replace(/\bseconds\b/ig,   "(new Date().getSeconds())");
    code = code.replace(/\bday\b/ig,       "(new Date().getDate())");
    code = code.replace(/\bmonth\b/ig,     "(new Date().getMonth() + 1)");
    code = code.replace(/\byear\b/ig,      "(new Date().getFullYear())");
    code = code.replace(/\btimestamp\b/ig, "(Date.now())");

    // ── 5. FUNÇÕES ───────────────────────────────────────────
    code = code.replace(/\bcreate\s+function\s+(\w+)\s*\(\s*(.*?)\s*\)/ig, "var $1 = async function($2) {");
    code = code.replace(/\bcreate\s+function\s+(\w+)/ig, "var $1 = async function() {");
    code = code.replace(/\bset\s+function\s+(\w+)\s*\(\s*(.*?)\s*\)/ig, "$1 = async function($2) {");
    code = code.replace(/\bset\s+function\s+(\w+)/ig, "$1 = async function() {");

    // ── 6. VARIÁVEIS ─────────────────────────────────────────
    code = code.replace(/\bcreate\s+(\w+)\s*=\s*/ig, "var $1 = ");
    code = code.replace(/\bcreate\s+(\w+)\s*$/img,   "var $1");
    code = code.replace(/\bset\s+(\w+)\s*=\s*/ig,    "$1 = ");
    code = code.replace(/\bdelete\s+(\w+)/ig,         "$1 = undefined");

    // ── 7. CONDICIONAIS ──────────────────────────────────────
    function mapOp(op) {
        if (op.trim() === "=")  return "===";
        if (op.trim() === "!=") return "!==";
        return op.trim();
    }
    function stripOuterParens(s) {
        s = s.trim();
        if (s.startsWith("(") && s.endsWith(")")) return s.slice(1, -1).trim();
        return s;
    }
    code = code.replace(/\bif\s+not\s+(.+?)\s+then\b/ig, (_, raw) => {
        const inner = stripOuterParens(raw);
        const m = inner.match(/^(\w+)\s*(===|!==|>=|<=|>|<|!=|=)\s*(.+)$/i);
        if (m) {
            if (m[2].trim() === "=" || m[2].trim() === "!=") return `if (${m[1]} ${mapOp(m[2]) === "===" ? "!==" : "==="} ${m[3].trim()}) {`;
            return `if (!(${m[1]} ${mapOp(m[2])} ${m[3].trim()})) {`;
        }
        return `if (!(${inner})) {`;
    });
    code = code.replace(/\bif\s+(.+?)\s+then\b/ig, (_, raw) => {
        const inner = stripOuterParens(raw);
        const m = inner.match(/^(\w+)\s*(===|!==|>=|<=|>|<|!=|=)\s*(.+)$/i);
        if (m) return `if (${m[1]} ${mapOp(m[2])} ${m[3].trim()}) {`;
        return `if (${inner}) {`;
    });
    code = code.replace(/\belse\b/ig, "} else {");

    // ── 8. LOOPS COM VERIFICAÇÃO DE EXECUÇÃO ────────────────
    const executionCheck = `if(__execId !== ${thisExecutionId}) break;`;
    code = code.replace(/\bloop\s*\(?\s*\)?\s*(?=\s|$)/ig, `while(true) { ${executionCheck}`);
    code = code.replace(/\brepeat\s+(\d+)\s+times\b/ig, `for(let __i=0; __i<$1; __i++) { ${executionCheck}`);
    code = code.replace(/\bforeach\s+(\w+)\s+in\s+(\w+)\b/ig, `for(let $1 of $2) { ${executionCheck}`);
    code = code.replace(/\bstoploop\b/ig, "__STOPLOOP__");
    code = code.replace(/\bnextloop\b/ig, "__NEXTLOOP__");

    // ── 9. execute() ────────────────────────────────────────
    code = code.replace(/\bexecute\s*\(\s*(\w+\s*\(.*?\))\s*\)/ig, "await $1");
    code = code.replace(/\bexecute\s*\(\s*(\w+)\s*\)/ig,            "await $1()");

    // ── 10. BREAK = FECHAMENTO UNIVERSAL ─────────────────────
    code = code.replace(/^\s*\bbreak\b\s*$/img, "}");
    code = code.replace(/__STOPLOOP__/g, "break");
    code = code.replace(/__NEXTLOOP__/g, "continue");

    // ── 11. wait() & checkconsole ────────────────────────────
    code = code.replace(/(?<!await )\bwait\s*\(/g, "await wait(");
    code = code.replace(/\bwait\s*\(\s*checkconsole\s*\)/ig, "await new Promise(r => { consoleResolver = r; })");
    code = code.replace(/\bcheckconsole\b/ig, "switchTab('console');");

    // ── 12. Arrays / Objetos / Utilitários ───────────────────
    code = code.replace(/\barray\s*\[(.*?)\]/ig,                   "[$1]");
    code = code.replace(/\bobject\s*\{(.*?)\}/ig,                  "{$1}");
    code = code.replace(/\blength\s+of\s+(\w+)/ig,                 "$1.length");
    code = code.replace(/\bpush\s+(\w+)\s+to\s+(\w+)/ig,           "$2.push($1)");
    code = code.replace(/\bremove\s+from\s+(\w+)\s+at\s+(\d+)/ig,  "$1.splice($2, 1)");

    // ── 13. Random ───────────────────────────────────────────
    code = code.replace(/\brandom\s+(\d+)\s+to\s+(\d+)/ig, "rng($1, $2)");
    code = code.replace(/\brandom\b/ig,                     "Math.random()");

    // ── 14. Helpers injetados no contexto ────────────────────
    const helpers = `
        const __execId = ${thisExecutionId};
        const rng     = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        const sleep   = ms => new Promise(r => setTimeout(r, ms));
        const range   = (start, end) => Array.from({length: end - start + 1}, (_, i) => start + i);
        const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
        const pick    = arr => arr[Math.floor(Math.random() * arr.length)];
        const print   = msg => log(msg);
        const error   = msg => log(String(msg), '#f44336');
        const warn    = msg => log(String(msg), '#ff9800');
        const success = msg => log(String(msg), '#4caf50');
    `;

    const finalCode = `${helpers}\n${code}`;

    // ── 15. Execução ─────────────────────────────────────────
    try {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const startTime = Date.now();
        await new AsyncFunction(finalCode)();
        
        if (thisExecutionId === activeExecutionId) {
            const executionTime = Date.now() - startTime;
            log(`✓ Execution completed in ${executionTime}ms`, "#4caf50");
        } else {
            log(`⚠️ Execution ${thisExecutionId} was aborted`, "#ff9800");
        }
    } catch (err) {
        if (thisExecutionId === activeExecutionId) {
            log(`✗ RUNTIME ERROR: ${err.message}`, "#f44336");
            const stackLines = err.stack.split('\n');
            let lineInfo = '';
            for (const line of stackLines) {
                const match = line.match(/<anonymous>:(\d+):/);
                if (match) {
                    lineInfo = ` (próximo à linha ${Math.max(1, parseInt(match[1]) - helpers.split('\n').length)})`;
                    break;
                }
            }
            log(`📍 Localização${lineInfo}`, "#ff9800");
        }
    }
}

async function exportProject() {
    if (typeof JSZip === "undefined") {
        terminalPrint("[ERR] JSZip library not loaded!", "#f44336");
        return;
    }
    const zip = new JSZip();
    const code = editor.innerText;
    const metadata = { version: "2.0.0", developer: "AreDev", created: new Date().toISOString(), lines: code.split('\n').length };
    zip.file("script.sol", code);
    zip.file("metadata.json", JSON.stringify(metadata, null, 2));
    zip.file("README.md", `# SOL Project Export\n\nVersion: ${metadata.version}\nCreated: ${metadata.created}\nLines: ${metadata.lines}`);

    const content = await zip.generateAsync({type:"blob"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `SOL_Project_${Date.now()}.zip`;
    a.click();
    terminalPrint("✓ Project exported successfully.", "#4caf50");
}

function clearEditor() {
    if (confirm("Clear all code? This action cannot be undone.")) {
        editor.innerText = "";
        updateEditor();
        log("Editor cleared.", "#ff9800");
    }
}

function handleFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        editor.innerText = e.target.result;
        updateEditor();
        log(`File loaded: ${file.name}`, "#4caf50");
    };
    reader.onerror = () => { log("Failed to read file.", "#f44336"); };
    reader.readAsText(file);
}

function saveToLocalStorage() {
    try {
        localStorage.setItem('sol_code', editor.innerText);
        localStorage.setItem('sol_saved_at', new Date().toISOString());
        terminalPrint("✓ Auto-saved to browser.", "#4caf50");
    } catch (e) { terminalPrint("✗ Auto-save failed.", "#f44336"); }
}

function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('sol_code');
        if (saved) {
            editor.innerText = saved;
            updateEditor();
            const savedAt = localStorage.getItem('sol_saved_at');
            log(`Loaded from storage (saved: ${new Date(savedAt).toLocaleString()})`, "#00bcd4");
        }
    } catch (e) { log("Failed to load from storage.", "#f44336"); }
}

function startAutoSave() {
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    autoSaveTimer = setInterval(saveToLocalStorage, CONFIG.autoSaveInterval);
}

soltuxInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const val = soltuxInput.value.trim();
        if (!val) return;

        commandHistory.push(val);
        historyIndex = commandHistory.length;

        const parts = val.split(' ');
        const cmd = parts[0];
        const args = parts.slice(1);

        soltuxInput.value = "";
        terminalPrint(`E:\\> ${val}`, "#fff");

        switch(cmd.toLowerCase()) {
            case "/getlib":
                if (args[0]) await importService(args[0]);
                else terminalPrint("Usage: /getlib <library-name>", "#ff9800");
                break;
            case "/clear": soltuxDisplay.innerHTML = ""; break;
            case "/ver":
            case "/version":
                terminalPrint("SOL Executor v1.8.7 (Optimized)", "#00ffff");
                terminalPrint("Developer: AreDev", "#00ffff");
                terminalPrint("Features: Execution Control + Dynamic Shield (No Lag)", "#00bcd4");
                break;
            case "/help":
                terminalPrint("═══════════════════════════════════════", "#00ffff");
                terminalPrint("        SOLTUX TERMINAL COMMANDS        ", "#fff");
                terminalPrint("═══════════════════════════════════════", "#00ffff");
                terminalPrint("  /getlib <n>    - Load external library", "#fff");
                terminalPrint("  /clear         - Clear terminal screen", "#fff");
                terminalPrint("  /ver           - Show version info", "#fff");
                terminalPrint("  /help          - Show terminal commands", "#fff");
                terminalPrint("  /helpsyntax    - Show SOL syntax guide", "#fff");
                terminalPrint("  /save          - Save code to browser storage", "#fff");
                terminalPrint("  /load          - Load code from storage", "#fff");
                terminalPrint("  /debug on/off  - Toggle debug mode", "#fff");
                terminalPrint("  /export        - Export project as ZIP", "#fff");
                terminalPrint("  /stop          - Stop current execution", "#fff");
                break;
            case "/helpsyntax": showSyntaxHelp(); break;
            case "/save": saveToLocalStorage(); break;
            case "/load": loadFromLocalStorage(); break;
            case "/debug":
                if (args[0] === "on") { runtime.debugMode = true; terminalPrint("Debug mode enabled.", "#4caf50"); } 
                else if (args[0] === "off") { runtime.debugMode = false; terminalPrint("Debug mode disabled.", "#f44336"); } 
                else { terminalPrint(`Debug mode is ${runtime.debugMode ? 'ON' : 'OFF'}`, "#00bcd4"); }
                break;
            case "/export": await exportProject(); break;
            case "/stop":
                currentExecutionId++;
                activeExecutionId = null;
                terminalPrint("⚠️ All executions stopped.", "#f44336");
                break;
            default: terminalPrint(`Unknown command: ${cmd}. Type /help for available commands.`, "#f44336");
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (historyIndex > 0) { historyIndex--; soltuxInput.value = commandHistory[historyIndex]; }
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex < commandHistory.length - 1) { historyIndex++; soltuxInput.value = commandHistory[historyIndex]; } 
        else { historyIndex = commandHistory.length; soltuxInput.value = ""; }
    }
});

editor.addEventListener('input', () => { updateEditor(); if (autoSaveTimer) saveToLocalStorage(); });
editor.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
});
lineNumbers.addEventListener('click', (e) => {
    const lineNum = parseInt(e.target.innerText);
    if (!isNaN(lineNum)) {
        if (runtime.breakpoints.has(lineNum)) runtime.breakpoints.delete(lineNum);
        else runtime.breakpoints.add(lineNum);
        updateEditor();
    }
});
window.addEventListener('beforeunload', () => { if (editor.innerText.trim()) saveToLocalStorage(); });

terminalPrint("═══════════════════════════════════════", "#00ffff");
terminalPrint("  SOL EXECUTOR v1.8.7 (Optimized)", "#fff");
terminalPrint("  Developer: AreDev", "#00bcd4");
terminalPrint("═══════════════════════════════════════", "#00ffff");
terminalPrint("Type /help for commands | /helpsyntax for syntax", "#bbb");
terminalPrint("", "#fff");

loadFromLocalStorage();
startAutoSave();
updateEditor();
