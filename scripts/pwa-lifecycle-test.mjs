import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const distDirectory = new URL("../dist/", import.meta.url);
const profileDirectory = await mkdtemp(join(tmpdir(), "boutique-pwa-test-"));
let release = "A";

const mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname === "/api/probe") {
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ live: true, release }));
      return;
    }

    let relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    relativePath = normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
    let fileUrl = new URL(relativePath.replace(/\\/g, "/"), distDirectory);
    try {
      if (!(await stat(fileUrl)).isFile()) fileUrl = new URL("index.html", distDirectory);
    } catch {
      fileUrl = new URL("index.html", distDirectory);
    }

    let body = await readFile(fileUrl);
    if (relativePath === "sw.js") {
      body = Buffer.concat([
        body,
        Buffer.from(`\nself.__PWA_TEST_RELEASE__=${JSON.stringify(release)};self.addEventListener("message",event=>{if(event.data?.type==="GET_TEST_RELEASE")event.source?.postMessage({type:"TEST_RELEASE",release:self.__PWA_TEST_RELEASE__})});\n`),
      ]);
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(fileUrl.pathname)] || "application/octet-stream",
      "Cache-Control": relativePath === "sw.js" || relativePath === "index.html"
        ? "no-cache, no-store, must-revalidate"
        : "public, max-age=0, must-revalidate",
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500);
    response.end(String(error));
  }
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const waitUntil = async (operation, label, timeout = 20_000) => {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeout) {
    try {
      const result = await operation();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`, { cause: lastError });
};

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending?.reject(new Error(message.error.message));
        else pending?.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }
}

let chrome;
try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const appUrl = `http://127.0.0.1:${port}/`;
  const debuggingPort = 9333;
  chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ], { stdio: "ignore" });

  const pageTarget = await waitUntil(async () => {
    const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/new?${encodeURIComponent(appUrl)}`, { method: "PUT" });
    return response.ok ? response.json() : null;
  }, "Chrome DevTools");
  const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const cdp = new CdpClient(socket);
  let topLevelNavigations = 0;
  cdp.on("Page.frameNavigated", ({ frame }) => {
    if (!frame.parentId) topLevelNavigations += 1;
  });
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  const evaluate = async (expression, awaitPromise = true) => {
    const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const waitForExpression = (expression, label) => waitUntil(async () => evaluate(expression), label);
  const serviceWorkerRelease = () => evaluate(`new Promise(async resolve=>{const registration=await navigator.serviceWorker.ready;const handler=event=>{if(event.data?.type==='TEST_RELEASE'){navigator.serviceWorker.removeEventListener('message',handler);resolve(event.data.release)}};navigator.serviceWorker.addEventListener('message',handler);(navigator.serviceWorker.controller||registration.active).postMessage({type:'GET_TEST_RELEASE'});setTimeout(()=>resolve(null),2000)})`);

  await waitForExpression("document.readyState === 'complete'", "initial page load");
  await evaluate("navigator.serviceWorker.ready.then(()=>true)");
  await delay(500);
  await cdp.send("Page.navigate", { url: appUrl });
  await waitForExpression("document.readyState === 'complete' && !!navigator.serviceWorker.controller", "Version A control");
  assert.equal(await serviceWorkerRelease(), "A");

  release = "B";
  await evaluate("navigator.serviceWorker.getRegistration().then(registration=>registration.update()).then(()=>true)");
  await waitForExpression("document.body.innerText.includes('Nouvelle version disponible') && document.body.innerText.includes('Mettre à jour')", "Version B update prompt");
  await evaluate("window.__PWA_NO_RELOAD_SENTINEL__ = 'still-A'");
  const beforeDismiss = topLevelNavigations;
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Plus tard')).click(); true");
  await delay(750);
  assert.equal(topLevelNavigations, beforeDismiss, "Plus tard must not reload the POS");
  assert.equal(await evaluate("window.__PWA_NO_RELOAD_SENTINEL__"), "still-A");

  // A deliberate test reload recreates the prompt while B is still waiting.
  await cdp.send("Page.reload");
  await waitForExpression("document.body.innerText.includes('Mettre à jour')", "prompt after deliberate reopen");
  const beforeActivation = topLevelNavigations;
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent.includes('Mettre à jour')).click(); true");
  await waitUntil(() => topLevelNavigations === beforeActivation + 1, "single controlled reload");
  await waitForExpression("document.readyState === 'complete' && !!navigator.serviceWorker.controller", "Version B control");
  await delay(1000);
  assert.equal(topLevelNavigations, beforeActivation + 1, "activation must reload exactly once");
  assert.equal(await serviceWorkerRelease(), "B");
  assert.equal(await evaluate("document.body.innerText.includes('Nouvelle version disponible')"), false);

  await evaluate("fetch('/api/probe').then(response=>response.json()).then(value=>value.live)");
  const cachedApiRequests = await evaluate("caches.keys().then(async keys=>(await Promise.all(keys.map(key=>caches.open(key).then(cache=>cache.keys())))).flat().filter(request=>new URL(request.url).pathname.startsWith('/api/')).length)");
  assert.equal(cachedApiRequests, 0, "operational API responses must not enter service-worker caches");
  console.log(JSON.stringify({
    versionAControlled: true,
    versionBWaited: true,
    promptShown: true,
    laterDidNotReload: true,
    controlledReloads: 1,
    versionBControlled: true,
    cachedApiRequests,
  }, null, 2));
  socket.close();
} finally {
  if (chrome && chrome.exitCode === null) {
    chrome.kill();
    await Promise.race([
      new Promise((resolve) => chrome.once("exit", resolve)),
      delay(3000),
    ]);
  }
  await new Promise((resolve) => server.close(resolve));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(profileDirectory, { recursive: true, force: true });
      break;
    } catch (error) {
      if (attempt === 4) console.warn("Temporary Chrome profile cleanup deferred:", error.message);
      else await delay(250 * (attempt + 1));
    }
  }
}
