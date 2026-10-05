// minha línguagem de programação - Sol v1.9.0
const PROXY_URL = "https://aredev-security.vercel.app/vercel/path0?file=";
const CONFIG = {
    maxLogLines: 500,
    autoSaveInterval: 30000,
    theme: 'dark'
};

let currentExecutionId = 0;
let activeExecutionId = null;

let conSoleReSolver = null;
let lastTerminalLine = null;
let executionContext = {};
let commandHistory = [];
let historyIndex = -1;
let autoSaveTimer = null;

const editor = document.getElementById('code-editor');
const lineNumbers = document.getElementById('line-numbers');
const logOutput = document.getElementById('log-output');
const SoltuxDisplay = document.getElementById('Soltux-display');
const SoltuxInput = document.getElementById('Soltux-input');

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
    if (tabId === 'conSole' && conSoleReSolver) {
        conSoleReSolver();
        conSoleReSolver = null;
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

window.wait = (ms) => new Promise(reSolve => setTimeout(reSolve, ms));

window.input = async (prompt = "Enter value:") => {
    return new Promise(reSolve => {
        log(prompt, "#00bcd4");
        const originalReSolver = conSoleReSolver;
        conSoleReSolver = () => {
            const value = window.prompt(prompt);
            reSolve(value);
            if (originalReSolver) originalReSolver();
        };
        switchTab('conSole');
    });
};

window.clear = () => { logOutput.innerHTML = ""; };
window.alert = (msg) => { log(`⚠ ${msg}`, "#ff9800"); };

function terminalPrint(message, color = "#fff") {
    const terminalLine = document.createElement('div');
    terminalLine.style.color = color;
    terminalLine.className = 'terminal-line';
    terminalLine.innerText = message;
    SoltuxDisplay.appendChild(terminalLine);
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
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("For terminal commands, type /help", "#bbb");
}

async function importService(name) {
    if (document.getElementById(`lib-${name}`)) {
        terminalPrint(`[WARN] Service '${name}' already loaded.`, "#ff9800");
        return;
    }
    lastTerminalLine = document.createElement('div');
    lastTerminalLine.style.color = "#00ffff";
    lastTerminalLine.className = 'loading-line';
    SoltuxDisplay.appendChild(lastTerminalLine);

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

window.SolRequire = async function(name) {
    if (!window[name]) {
        await importService(name);
    }
    return window[name] || {};
};

async function runSol() {
    currentExecutionId++;
    const thisExecutionId = currentExecutionId;
    activeExecutionId = thisExecutionId;
    
    let code = editor.innerText.trim();
    if (!code) { return; }

    switchTab('conSole');
    logOutput.innerHTML = "";

    code = code.replace(/--.*$/gm, "");
    code = code.replace(/\/\/.*$/gm, "");
    code = code.replace(/\/\*[\s\S]*?\*\//g, "");

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
        }
    }
    
    code = code.replace(/^\s*clear\s*$/gim, "logOutput.innerHTML = '';");    
    
    code = code.replace(/math\((.*?)\)/ig, (_, content) => {
        let t = content.replace(/\[(.*?)\]/g, "$1").replace(/÷/g, "/").replace(/×/g, "*");
        return `(${t})`; 
    });

    code = code.replace(/\bhour\b/ig,      "(new Date().getHours())");
    code = code.replace(/\bminutes\b/ig,   "(new Date().getMinutes())");
    code = code.replace(/\bseconds\b/ig,   "(new Date().getSeconds())");
    code = code.replace(/\bday\b/ig,       "(new Date().getDate())");
    code = code.replace(/\bmonth\b/ig,     "(new Date().getMonth() + 1)");
    code = code.replace(/\byear\b/ig,      "(new Date().getFullYear())");
    code = code.replace(/\btimestamp\b/ig, "(Date.now())");

    code = code.replace(/\bcreate\s+function\s+(\w+)\s*\(\s*(.*?)\s*\)/ig, "var $1 = async function($2) {");
    code = code.replace(/\bcreate\s+function\s+(\w+)/ig, "var $1 = async function() {");
    code = code.replace(/\bset\s+function\s+(\w+)\s*\(\s*(.*?)\s*\)/ig, "$1 = async function($2) {");
    code = code.replace(/\bset\s+function\s+(\w+)/ig, "$1 = async function() {");

    code = code.replace(/\breturn\s+(.+)$/gim, "return $1;");
    code = code.replace(/^\s*\breturn\b\s*$/gim, "return;");

    code = code.replace(/\bcreate\s+(\w+)\s*=\s*/ig, "var $1 = ");
    code = code.replace(/\bcreate\s+(\w+)\s*$/img,   "var $1");
    code = code.replace(/\bset\s+(\w+)\s*=\s*/ig,    "$1 = ");
    code = code.replace(/\bdelete\s+(\w+)/ig,         "$1 = undefined");

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

    const executionCheck = `if(__execId !== ${thisExecutionId}) break;`;
    code = code.replace(/\bloop\s*\(?\s*\)?\s*(?=\s|$)/ig, `while(true) { ${executionCheck}`);
    code = code.replace(/\brepeat\s+(\d+)\s+times\b/ig, `for(let __i=0; __i<$1; __i++) { ${executionCheck}`);
    code = code.replace(/\bforeach\s+(\w+)\s+in\s+(\w+)\b/ig, `for(let $1 of $2) { ${executionCheck}`);
    code = code.replace(/\bstoploop\b/ig, "__STOPLOOP__");
    code = code.replace(/\bnextloop\b/ig, "__NEXTLOOP__");

    code = code.replace(/\bexecute\s*\(\s*(\w+\s*\(.*?\))\s*\)/ig, "await $1");
    code = code.replace(/\bexecute\s*\(\s*(\w+)\s*\)/ig,            "await $1()");

    code = code.replace(/^\s*\bbreak\b\s*$/img, "}");
    code = code.replace(/__STOPLOOP__/g, "break");
    code = code.replace(/__NEXTLOOP__/g, "continue");

    code = code.replace(/(?<!await )\bwait\s*\(/g, "await wait(");
    code = code.replace(/\bwait\s*\(\s*checkconSole\s*\)/ig, "await new Promise(r => { conSoleReSolver = r; })");
    code = code.replace(/\bcheckconSole\b/ig, "switchTab('conSole');");

    code = code.replace(/\barray\s*\[(.*?)\]/ig,                   "[$1]");
    code = code.replace(/\bobject\s*\{(.*?)\}/ig,                  "{$1}");
    code = code.replace(/\blength\s+of\s+(\w+)/ig,                 "$1.length");
    code = code.replace(/\bpush\s+(\w+)\s+to\s+(\w+)/ig,           "$2.push($1)");
    code = code.replace(/\bremove\s+from\s+(\w+)\s+at\s+(\d+)/ig,  "$1.splice($2, 1)");
    
    code = code.replace(/\brequire\s*\(\s*(["'].*?["'])\s*\)/ig, "await window.SolRequire($1)");

    code = code.replace(/\brandom\s+(\d+)\s+to\s+(\d+)/ig, "rng($1, $2)");
    code = code.replace(/\brandom\b/ig,                     "Math.random()");

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

    try {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        await new AsyncFunction(finalCode)();
    } catch (err) {
        if (thisExecutionId === activeExecutionId) {
            log(`✗ RUNTIME ERROR: ${err.message}`, "#f44336");
            const stackLines = err.stack.split('\n');
            let lineInfo = '';
            for (const line of stackLines) {
                const match = line.match(/<anonymous>:(\d+):/);
                if (match) {
                    lineInfo = ` (near line ${Math.max(1, parseInt(match[1]) - helpers.split('\n').length)})`;
                    break;
                }
            }
            log(`📍 Location${lineInfo}`, "#ff9800");
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
    zip.file("script.Sol", code);
    zip.file("metadata.json", JSON.stringify(metadata, null, 2));
    zip.file("README.md", `# Sol Project Export\n\nVersion: ${metadata.version}\nCreated: ${metadata.created}\nLines: ${metadata.lines}`);

    const content = await zip.generateAsync({type:"blob"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `Sol_Project_${Date.now()}.zip`;
    a.click();
    terminalPrint("✓ Project exported successfully.", "#4caf50");
}

function clearEditor() {
    if (confirm("Clear all code? This action cannot be undone.")) {
        editor.innerText = "";
        updateEditor();
    }
}

function handleFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        editor.innerText = e.target.result;
        updateEditor();
    };
    reader.readAsText(file);
}

function saveToLocalStorage() {
    try {
        localStorage.setItem('Sol_code', editor.innerText);
        localStorage.setItem('Sol_saved_at', new Date().toISOString());
    } catch (e) {}
}

function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('Sol_code');
        if (saved) {
            editor.innerText = saved;
            updateEditor();
        }
    } catch (e) {}
}

function startAutoSave() {
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    autoSaveTimer = setInterval(saveToLocalStorage, CONFIG.autoSaveInterval);
}

SoltuxInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const val = SoltuxInput.value.trim();
        if (!val) return;

        commandHistory.push(val);
        historyIndex = commandHistory.length;

        const parts = val.split(' ');
        const cmd = parts[0];
        const args = parts.slice(1);

        SoltuxInput.value = "";
        terminalPrint(`E:\\> ${val}`, "#fff");

        switch(cmd.toLowerCase()) {
            case "/getlib":
                if (args[0]) await importService(args[0]);
                else terminalPrint("Usage: /getlib <library-name>", "#ff9800");
                break;
            case "/clear": SoltuxDisplay.innerHTML = ""; break;
            case "/ver":
            case "/version":
                terminalPrint("Sol v1.9.0 (Return & Require Update)", "#00ffff");
                terminalPrint("Developer: AreDev", "#00ffff");
                terminalPrint("Features: Execution Control, Modular Require, Returns", "#00bcd4");
                break;
            case "/help":
                terminalPrint("═══════════════════════════════════════", "#00ffff");
                terminalPrint("        Soltux TERMINAL COMMANDS        ", "#fff");
                terminalPrint("═══════════════════════════════════════", "#00ffff");
                terminalPrint("  /getlib <n>    - Load external library", "#fff");
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
            case "/helpsyntax": showSyntaxHelp(); break;
            case "/save": 
                saveToLocalStorage(); 
                terminalPrint("✓ Code manually saved to browser.", "#4caf50");
                break;
            case "/load": 
                loadFromLocalStorage(); 
                terminalPrint("✓ Code manually loaded from storage.", "#00bcd4");
                break;
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
        if (historyIndex > 0) { historyIndex--; SoltuxInput.value = commandHistory[historyIndex]; }
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex < commandHistory.length - 1) { historyIndex++; SoltuxInput.value = commandHistory[historyIndex]; } 
        else { historyIndex = commandHistory.length; SoltuxInput.value = ""; }
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
terminalPrint("  Sol v1.9.0 (Return & Require Update)", "#fff");
terminalPrint("  Developer: AreDev", "#00bcd4");
terminalPrint("═══════════════════════════════════════", "#00ffff");
terminalPrint("Type /help for commands | /helpsyntax for syntax", "#bbb");
terminalPrint("", "#fff");

loadFromLocalStorage();
startAutoSave();
updateEditor();
