const socketQuery = new URLSearchParams(window.location.search).get('socket');
if (socketQuery) {
  window.localStorage.setItem('pixelcode_socket_url', socketQuery);
}
const SOCKET_SERVER_URL = socketQuery
  || window.PIXELCODE_SOCKET_URL
  || window.localStorage.getItem('pixelcode_socket_url')
  || `${window.location.protocol}//${window.location.hostname}:3000`;

const socket = io(SOCKET_SERVER_URL, {
  transports: ['websocket', 'polling'],
});

const workspaceEl = document.getElementById('workspace');
const workspaceGridEl = document.querySelector('.workspace-grid');
const avatarLayerEl = document.getElementById('avatarLayer');
const windowLayerEl = document.getElementById('windowLayer');
const lobbyLabelEl = document.getElementById('lobbyLabel');
const sessionLabelEl = document.getElementById('sessionLabel');
const usernameInputEl = document.getElementById('usernameInput');
const memberLoginBtnEl = document.getElementById('memberLoginBtn');
const guestBtnEl = document.getElementById('guestBtn');
const categorySelectEl = document.getElementById('categorySelect');
const windowTypeSelectEl = document.getElementById('windowTypeSelect');
const spawnOrganizedBtnEl = document.getElementById('spawnOrganizedBtn');
const savedProjectSelectEl = document.getElementById('savedProjectSelect');
const reopenProjectBtnEl = document.getElementById('reopenProjectBtn');
const openControlsGuideBtnEl = document.getElementById('openControlsGuideBtn');
const controlsGuidePanelEl = document.getElementById('controlsGuidePanel');
const globalConsoleEl = document.getElementById('globalConsole');
const debugPanelEl = document.getElementById('debugPanel');
const simulatePlayerBtnEl = document.getElementById('simulatePlayerBtn');
const requestNotifyBtnEl = document.getElementById('requestNotifyBtn');
const requestNotifyBadgeEl = document.getElementById('requestNotifyBadge');
const requestNotifyPanelEl = document.getElementById('requestNotifyPanel');

const avatarMap = new Map();
const lobbyUsers = new Map();
const windows = new Map();
const windowNodes = new Map();
const youtubePlayers = new Map();
const pendingYouTubeControl = new Map();
const youtubeRecoveryAt = new Map();
const youtubeRecoveryCount = new Map();
const youtubeEmbedFallbackMode = new Map();
const youtubeEmbedLastApplied = new Map();
const drawingContexts = new Map();
const windowPointerNodes = new Map();
const dinoRuntime = new Map();
const localWindowInteractions = new Map();
const pendingEditRequests = new Map();
const miniChatRenderers = new Map();
const mainChatRenderers = new Map();
const chairStateMap = new Map();
let chairLayerEl = null;
let chairPromptEl = null;

const session = {
  username: null,
  isGuest: false,
  lobbyId: null,
  selfId: null,
  savedProjects: [],
};

const camera = { x: 0, y: 0 };
let isPanning = false;
let panStart = null;

const categoryWindowMap = {
  coding: [
    { type: 'python', label: 'Python Project' },
    { type: 'htmljs', label: 'HTML/JS Project' },
    { type: 'userscript', label: 'Userscript Project' },
  ],
  games: [
    { type: 'dino', label: 'Dino Game' },
    { type: 'drawing', label: 'Drawing App' },
  ],
  media: [
    { type: 'youtube', label: 'YouTube Sync' },
  ],
};
const CODE_WINDOW_TYPES = new Set(['python', 'htmljs', 'userscript']);

let pointerState = {
  screenX: 100,
  screenY: 100,
  worldX: 100,
  worldY: 100,
  state: 'idle',
  facing: 'right',
  gesture: 'none',
};
let lastMoveAt = 0;
let idleTimer = null;
let rafPending = false;
let localZCounter = 50;
const GRID_SIZE = 20;
let lastCursorEmitAt = 0;
let lastCursorPayloadKey = '';

const avatarControl = {
  enabled: false,
  left: false,
  right: false,
  vy: 0,
  floorY: 100,
  wTapCount: 0,
  lastWAt: 0,
  sTapCount: 0,
  lastSAt: 0,
  rafId: null,
};
let quickSayActive = false;
let quickSayTypingTimer = null;
let gestureKeys = {
  q: false,
  e: false,
};

const palette = ['#3ab97f', '#6ea8ff', '#ed8f44', '#d36be6', '#f4c542'];
const DRAW_ON_PAGE_USERSCRIPT = `// ==UserScript==
// @name         Draw on Page
// @version      1.3
// @description  Allows you to draw directly on webpages when you press Shift+Alt+D
// @author       someRandomGuy2
// @match        *://*/*
// @grant        none
// @license      Apache-2.0
// @namespace https://greasyfork.org/users/117222
// @downloadURL https://update.greasyfork.org/scripts/461397/Draw%20on%20Page.user.js
// @updateURL https://update.greasyfork.org/scripts/461397/Draw%20on%20Page.meta.js
// ==/UserScript==

(function() {
    'use strict';

    let container;
    let drawingCanvas;
    let contextMenuContainer;
    let contextMenu;
    let enabled = false;
    let color = "#ff0000";

    const prerenderCanvas = document.createElement("canvas");
    const prerenderCanvasX = prerenderCanvas.getContext("2d");

    const brushes = {
        pen: function(X, startX, startY, endX, endY, pressure) {
            const movementX = endX - startX;
            const movementY = endY - startY;
            const step = 2;
            const distance = Math.sqrt(movementX * movementX + movementY * movementY);
            const size = 4 * pressure;
            const halfSize = size / 2;
            const distanceStep = Math.max(0.2, size * 0.3);
            const softness = 0.4; // = 1 - hardness
            const prerenderCanvasSize = Math.ceil(size + 12);

            if (prerenderCanvasSize == 0) { return; }

            prerenderCanvas.width = prerenderCanvasSize;
            prerenderCanvas.height = prerenderCanvasSize;
            prerenderCanvasX.fillStyle = color;
            prerenderCanvasX.beginPath();
            prerenderCanvasX.filter = \`blur(0.5px)\`;
            prerenderCanvasX.arc(prerenderCanvasSize / 2, prerenderCanvasSize / 2, halfSize, 0, 2 * Math.PI);
            prerenderCanvasX.fill();

            for (let i = 0; i < distance; i += distanceStep) {
                const x = startX * (1 - i / distance) + endX * (i / distance);
                const y = startY * (1 - i / distance) + endY * (i / distance);
                X.drawImage(prerenderCanvas, x - prerenderCanvasSize / 2, y - prerenderCanvasSize / 2);
            }
            X.drawImage(prerenderCanvas, endX - prerenderCanvasSize / 2, endY - prerenderCanvasSize / 2);
        },

        eraser: function(X, startX, startY, endX, endY, pressure) {
            const movementX = endX - startX;
            const movementY = endY - startY;
            const step = 2;
            const distance = Math.sqrt(movementX * movementX + movementY * movementY);
            const size = 50 * pressure;
            const halfSize = size / 2;
            const distanceStep = Math.max(0.2, size * 0.2);

            for (let i = 0; i < distance; i += distanceStep) {
                const x = startX * (1 - i / distance) + endX * (i / distance);
                const y = startY * (1 - i / distance) + endY * (i / distance);
                X.clearRect(x - halfSize, y - halfSize, size, size);
            }
            X.clearRect(endX - halfSize, endY - halfSize, size, size);
        },
    };

    function toggleDrawable() {
        initIfNotAlready();
        if (enabled) {
            enabled = false;
            container.classList.add("tm-drawing-canvas-fallthrough");
        } else {
            enabled = true;
            container.classList.remove("tm-drawing-canvas-fallthrough");
        }
    }

    function initIfNotAlready() {
        if (container) { return; }
        container = document.createElement("div");
        container.classList.add("tm-drawing-canvas-container");

        drawingCanvas = document.createElement("canvas");
        drawingCanvas.classList.add("tm-drawing-canvas");
        container.appendChild(drawingCanvas);
        drawingCanvas.width = innerWidth * devicePixelRatio;
        drawingCanvas.height = innerHeight * devicePixelRatio;

        const X = drawingCanvas.getContext("2d");

        contextMenuContainer = document.createElement("div");
        contextMenuContainer.classList.add("tm-drawing-canvas-context-menu-container");

        contextMenu = document.createElement("div");
        contextMenuContainer.appendChild(contextMenu);
        contextMenu.classList.add("tm-drawing-canvas-context-menu");

        const clearCanvasOption = document.createElement("div");
        clearCanvasOption.innerText = "Clear canvas";
        contextMenu.appendChild(clearCanvasOption);

        const saveCanvasOption = document.createElement("div");
        saveCanvasOption.innerText = "Save canvas";
        contextMenu.appendChild(saveCanvasOption);

        const changeColor = document.createElement("div");
        const colorPicker = document.createElement("input");
        colorPicker.type = "color";
        colorPicker.value = color;
        changeColor.appendChild(colorPicker);
        contextMenu.appendChild(changeColor);

        const dropShadowToggle = document.createElement("div");
        dropShadowToggle.innerText = "Toggle drop shadow";
        contextMenu.appendChild(dropShadowToggle);

        let mouseDown = false;

        drawingCanvas.addEventListener("pointerdown", function() { mouseDown = true; });
        drawingCanvas.addEventListener("pointerup", function() { mouseDown = false; });

        drawingCanvas.addEventListener("pointermove", function(event) {
            if (!mouseDown) { return; }
            const brush = event.shiftKey ? brushes.eraser : brushes.pen;
            const scaleX = drawingCanvas.width / innerWidth;
            const scaleY = drawingCanvas.height / innerHeight;
            const startX = (event.x - event.movementX) * scaleX;
            const startY = (event.y - event.movementY) * scaleY;
            const endX = event.x * scaleX;
            const endY = event.y * scaleY;

            brush(X, startX, startY, endX, endY, event.pressure);
        });

        drawingCanvas.addEventListener("contextmenu", function(event) {
            contextMenu.style.top = event.clientY + "px";
            contextMenu.style.left = event.clientX + "px";
            container.appendChild(contextMenuContainer);
            event.preventDefault();
        });

        function addContextMenuItemClickListener(elm, func) {
            elm.addEventListener("click", func);
            elm.addEventListener("mouseup", ev => func(ev, true));
        }

        function closeContextMenu() {
            container.removeChild(contextMenuContainer);
        }

        addContextMenuItemClickListener(contextMenuContainer, function(event, mouseupShortcutClick) {
            if (mouseupShortcutClick) {
                if (event.target != contextMenuContainer && event.target != contextMenu) {
                    closeContextMenu();
                }
            } else {
                closeContextMenu();
            }
        });

        addContextMenuItemClickListener(clearCanvasOption, function() {
            X.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
            drawingCanvas.width = innerWidth * devicePixelRatio;
            drawingCanvas.height = innerHeight * devicePixelRatio;
        });

        addContextMenuItemClickListener(saveCanvasOption, function() {
            drawingCanvas.toBlob(blob => open(URL.createObjectURL(blob)));
        });

        addContextMenuItemClickListener(dropShadowToggle, function() {
            drawingCanvas.classList.toggle("no-drop-shadow");
        });

        addContextMenuItemClickListener(changeColor, function(event, mouseupShortcutClick) {
            if (event.target == changeColor || mouseupShortcutClick) {
                colorPicker.click();
            }
            event.stopPropagation();
        });

        colorPicker.addEventListener("change", function() {
            color = colorPicker.value;
            closeContextMenu();
        });

        drawingCanvas.addEventListener("touchmove", function(event) { });

        const style = document.createElement("style");
        style.innerHTML = \`
        .tm-drawing-canvas-container {
          z-index: 99999;
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          font-size: 14px;
          font-family: sans;
          line-height: 1.15;
          color: #000;
        }

        .tm-drawing-canvas-container.tm-drawing-canvas-fallthrough {
          pointer-events: none;
        }

        .tm-drawing-canvas {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          cursor: crosshair;
          filter: drop-shadow(0px 0px 8px background);
        }

        .tm-drawing-canvas.no-drop-shadow {
          filter: none;
        }

        .tm-drawing-canvas-context-menu-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .tm-drawing-canvas-context-menu {
          position: absolute;
          display: inline-block;
          background-color: #fff;
          padding-top: 4px;
          padding-bottom: 4px;
          margin-top: 1px;
          border: 1px solid #00000040;
          box-shadow: #00000038 0px 1px 16px, #0000002e 0px 1px 8px;
        }

        .tm-drawing-canvas-context-menu div {
          padding: 4px;
          cursor: pointer;
        }

        .tm-drawing-canvas-context-menu div:hover {
          background-color: #ccc;
        }
        \`;
        document.head.appendChild(style);
        document.body.appendChild(container);
    }

    addEventListener("keydown", function(event) {
        if (event.code == "KeyD" && event.altKey && event.shiftKey) {
            toggleDrawable();
        }
    });
})();`;
const USERSCRIPT_AI_PROMPT = `You are a senior JavaScript engineer. I will paste a userscript and you must adapt it to run in PixelCode Hub's Userscript window.

Important runtime rules:
1) The script executes inside an iframe using srcdoc (sandbox="allow-scripts").
2) It must run immediately on load (do not rely only on browser extension lifecycles).
3) Avoid extension-only APIs (GM_*, unsafeWindow, etc.) unless you polyfill/fallback.
4) If the script injects CSS, keep styles scoped and valid in iframe context.
5) Escape any closing </script> if generating inline script text.
6) If the script has @match/@include restrictions, provide a "force run" compatible fallback path.
7) Fix obvious typos and browser errors that block rendering.

Output format:
- First: "Paste your userscript now."
- After I paste it: return one final runnable adapted script only (no extra commentary), preserving behavior as much as possible.

Now ask me for my userscript.`;

let pyodideReadyPromise = null;
let pyodideInstance = null;
let pyodideLoading = false;
let youtubeApiReady = false;
const youtubeReadyResolvers = [];

window.onYouTubeIframeAPIReady = () => {
  youtubeApiReady = true;
  while (youtubeReadyResolvers.length) {
    const resolve = youtubeReadyResolvers.shift();
    resolve();
  }
};

window.addEventListener('message', (event) => {
  const data = event.data || {};
  if (!data || data.type !== 'userscript_console') return;
  appendConsole(data.windowId, `[userscript] ${data.message}`, true);
});

workspaceEl.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

function addGlobalLog(text) {
  const row = document.createElement('div');
  const stamp = new Date().toLocaleTimeString();
  row.textContent = `[${stamp}] ${text}`;
  globalConsoleEl.appendChild(row);
  globalConsoleEl.scrollTop = globalConsoleEl.scrollHeight;
}

function buildControlsGuideHtml() {
  return [
    '<div class="controls-guide-actions"><button id="closeControlsGuideBtn" type="button">Hide Guide</button></div>',
    '<h3>Avatar Controls</h3>',
    '<p class="meta">Press <b>I</b> to toggle Avatar Mode on/off.</p>',
    '<ul>',
    '<li><b>A / D</b>: Walk left/right (in avatar mode)</li>',
    '<li><b>W</b>: Jump. Press 3 times quickly to go up one grid floor</li>',
    '<li><b>S</b>: Press 3 times quickly to go down one grid floor</li>',
    '<li><b>I</b>: Toggle back to cursor mode</li>',
    '<li><b>Q</b>: Point left, <b>E</b>: Point right</li>',
    '<li><b>Q + E</b>: Point up</li>',
    '<li><b>/</b>: Quick speech bubble prompt above avatar</li>',
    '</ul>',
    '<h3>Camera / Navigation</h3>',
    '<ul>',
    '<li><b>Right Mouse Drag</b>: Pan infinite world camera</li>',
    '<li><b>Go to Origin</b> button: return camera to 0,0</li>',
    '</ul>',
    '<h3>Lobby & Windows</h3>',
    '<ul>',
    '<li>Join <b>Lobby 1</b> or <b>Lobby 2</b> from sidebar</li>',
    '<li>Use <b>Category + Window Type + Spawn Window</b> to create windows</li>',
    '<li>Window owner can close with <b>Close</b> (has warning)</li>',
    '<li>Drag windows by header; resize using bottom-right handle</li>',
    '</ul>',
    '<h3>Access & Permissions</h3>',
    '<ul>',
    '<li>Non-owner can click <b>Request Edit</b> in window access panel</li>',
    '<li>Owner gets top-right <b>Edit Requests</b> notifications</li>',
    '<li>Owner can <b>Accept</b> or <b>Deny</b> each request</li>',
    '<li>Owner can <b>Kick</b> collaborators from that window</li>',
    '<li>On accept, snapshot backup is created for revert support</li>',
    '</ul>',
    '<h3>Chat & Moderation</h3>',
    '<ul>',
    '<li>Each window has chat tabs: <b>Collaborators</b> and <b>Guests</b></li>',
    '<li>Owner/collaborators can mute guests for 5/10/60 minutes</li>',
    '<li><b>History / Mod Log</b> shows actions with revert options (owner)</li>',
    '</ul>',
    '<h3>Coding Windows</h3>',
    '<ul>',
    '<li><b>Python</b>: Run executes with Pyodide and logs to console</li>',
    '<li><b>HTML/JS</b>: Run in New Tab or Run in Window (synced)</li>',
    '<li><b>Userscript</b>: Run / Force Run in target preview iframe</li>',
    '<li>Use userscript helper buttons to copy example script and AI adapter prompt</li>',
    '</ul>',
    '<h3>Utility Windows</h3>',
    '<ul>',
    '<li><b>YouTube</b>: Paste URL and load. Owner controls by default</li>',
    '<li><b>Fix Sync</b>: Use if playback drifts between players</li>',
    '<li><b>Drawing</b>: Canvas strokes are synced live</li>',
    '<li><b>Dino</b>: Spawner controls gameplay; others watch</li>',
    '</ul>',
    '<h3>Chairs</h3>',
    '<ul>',
    '<li><b>Toggle Chair</b> spawns/removes your personal chair</li>',
    '<li>Walk near your chair and press <b>E</b> to sit/stand</li>',
    '</ul>',
    '<h3>Debug</h3>',
    '<ul>',
    '<li><b>Ctrl + Shift + T</b>: Toggle Debug & Test Panel</li>',
    '</ul>',
  ].join('');
}

function setupControlsGuide() {
  if (!openControlsGuideBtnEl || !controlsGuidePanelEl) return;
  controlsGuidePanelEl.innerHTML = buildControlsGuideHtml();
  const closeBtn = controlsGuidePanelEl.querySelector('#closeControlsGuideBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      controlsGuidePanelEl.classList.add('hidden');
    });
  }
  openControlsGuideBtnEl.addEventListener('click', () => {
    controlsGuidePanelEl.classList.toggle('hidden');
  });
}

async function copyTextWithFeedback(buttonEl, text) {
  const original = buttonEl.textContent;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const tmp = document.createElement('textarea');
      tmp.value = text;
      tmp.setAttribute('readonly', 'true');
      tmp.style.position = 'fixed';
      tmp.style.opacity = '0';
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
    }
    buttonEl.textContent = 'copyed to clipboard';
  } catch (error) {
    buttonEl.textContent = 'copy failed';
  } finally {
    window.setTimeout(() => {
      buttonEl.textContent = original;
    }, 1400);
  }
}

function ensureChairLayer() {
  if (chairLayerEl && chairLayerEl.isConnected) return chairLayerEl;
  chairLayerEl = document.createElement('div');
  chairLayerEl.className = 'chair-layer';
  workspaceEl.appendChild(chairLayerEl);
  return chairLayerEl;
}

function ensureChairPrompt() {
  if (chairPromptEl && chairPromptEl.isConnected) return chairPromptEl;
  chairPromptEl = document.createElement('div');
  chairPromptEl.className = 'chair-prompt hidden';
  chairPromptEl.textContent = 'Press E to interact';
  workspaceEl.appendChild(chairPromptEl);
  return chairPromptEl;
}

function requestKey(windowId, requesterId) {
  return `${windowId}:${requesterId}`;
}

function removeWindowRequests(windowId) {
  for (const [key, req] of pendingEditRequests.entries()) {
    if (req.windowId === windowId) {
      pendingEditRequests.delete(key);
    }
  }
}

function removeRequesterRequests(userId) {
  for (const [key, req] of pendingEditRequests.entries()) {
    if (req.requesterId === userId) {
      pendingEditRequests.delete(key);
    }
  }
}

function registerMiniChatRenderer(windowId, fn) {
  if (!miniChatRenderers.has(windowId)) {
    miniChatRenderers.set(windowId, new Set());
  }
  miniChatRenderers.get(windowId).add(fn);
}

function unregisterMiniChatRenderer(windowId, fn) {
  const set = miniChatRenderers.get(windowId);
  if (!set) return;
  set.delete(fn);
  if (!set.size) miniChatRenderers.delete(windowId);
}

function renderChatViews(windowId) {
  const main = mainChatRenderers.get(windowId);
  if (typeof main === 'function') main();
  const minis = miniChatRenderers.get(windowId);
  if (!minis) return;
  for (const fn of minis) {
    if (typeof fn === 'function') fn();
  }
}

function renderRequestNotifications() {
  if (!requestNotifyPanelEl || !requestNotifyBadgeEl || !requestNotifyBtnEl) return;
  const items = Array.from(pendingEditRequests.values())
    .sort((a, b) => (a.requestedAt || 0) - (b.requestedAt || 0));

  requestNotifyBadgeEl.textContent = String(items.length);
  requestNotifyBadgeEl.classList.toggle('hidden', items.length === 0);

  requestNotifyPanelEl.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'meta';
    empty.textContent = 'No pending edit requests.';
    requestNotifyPanelEl.appendChild(empty);
    return;
  }

  for (const req of items) {
    const row = document.createElement('div');
    row.className = 'request-notify-item';

    const title = document.createElement('div');
    title.className = 'request-notify-title';
    title.textContent = `${req.requesterName} wants to edit "${req.windowTitle}"`;

    const meta = document.createElement('div');
    meta.className = 'request-notify-meta';
    meta.textContent = new Date(req.requestedAt || Date.now()).toLocaleTimeString();

    const actions = document.createElement('div');
    actions.className = 'button-row';

    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.textContent = 'Accept';

    const denyBtn = document.createElement('button');
    denyBtn.type = 'button';
    denyBtn.textContent = 'Deny';

    acceptBtn.addEventListener('click', () => {
      socket.emit('window_edit_request_response', {
        windowId: req.windowId,
        requesterId: req.requesterId,
        accept: true,
      }, (resp) => {
        if (!resp || !resp.ok) {
          alert(resp && resp.error ? resp.error : 'Failed to accept request.');
          return;
        }
        pendingEditRequests.delete(requestKey(req.windowId, req.requesterId));
        renderRequestNotifications();
      });
    });

    denyBtn.addEventListener('click', () => {
      socket.emit('window_edit_request_response', {
        windowId: req.windowId,
        requesterId: req.requesterId,
        accept: false,
      }, (resp) => {
        if (!resp || !resp.ok) {
          alert(resp && resp.error ? resp.error : 'Failed to deny request.');
          return;
        }
        pendingEditRequests.delete(requestKey(req.windowId, req.requesterId));
        renderRequestNotifications();
      });
    });

    actions.append(acceptBtn, denyBtn);
    row.append(title, meta, actions);
    requestNotifyPanelEl.appendChild(row);
  }
}

function worldToScreen(x, y) {
  return {
    x: x - camera.x,
    y: y - camera.y,
  };
}

function screenToWorld(x, y) {
  return {
    x: x + camera.x,
    y: y + camera.y,
  };
}

function updateGridOffset() {
  if (!workspaceGridEl) return;
  workspaceGridEl.style.backgroundPosition = `${-camera.x}px ${-camera.y}px`;
}

function rerenderAvatarsForCamera() {
  for (const user of lobbyUsers.values()) {
    upsertAvatar(user);
  }
}

function rerenderChairsForCamera() {
  const layer = ensureChairLayer();
  layer.innerHTML = '';
  for (const chair of chairStateMap.values()) {
    const node = document.createElement('div');
    node.className = 'chair-node';
    node.dataset.ownerId = chair.ownerId;
    if (chair.ownerId === session.selfId) node.classList.add('my-chair');
    const label = document.createElement('div');
    label.className = 'chair-label';
    label.textContent = `${chair.ownerName || 'Player'} Chair`;
    node.appendChild(label);
    const render = worldToScreen(Number(chair.x) || 0, Number(chair.y) || 0);
    node.style.left = `${render.x}px`;
    node.style.top = `${render.y}px`;
    layer.appendChild(node);
  }
}

function getMyChair() {
  return chairStateMap.get(session.selfId) || null;
}

function isNearOwnChair() {
  const chair = getMyChair();
  if (!chair) return false;
  const dx = (Number(pointerState.worldX) || 0) - (Number(chair.x) || 0);
  const dy = (Number(pointerState.worldY) || 0) - (Number(chair.y) || 0);
  return Math.hypot(dx, dy) <= 30;
}

function updateChairInteractPrompt() {
  const prompt = ensureChairPrompt();
  const me = lobbyUsers.get(session.selfId);
  const inAvatarMode = avatarControl.enabled;
  const canInteract = inAvatarMode && !!me && (me.state === 'walking' || me.state === 'sitting') && isNearOwnChair();
  prompt.classList.toggle('hidden', !canInteract);
}

function rerenderWindowsForCamera() {
  for (const [windowId, windowState] of windows.entries()) {
    const node = windowNodes.get(windowId);
    if (!node) continue;
    applyWindowBaseStyles(node, windowState);
  }
}

function updateCameraBy(dx, dy) {
  camera.x += dx;
  camera.y += dy;
  updateGridOffset();
  rerenderAvatarsForCamera();
  rerenderChairsForCamera();
  rerenderWindowsForCamera();
}

function goToOrigin() {
  camera.x = 0;
  camera.y = 0;
  updateGridOffset();
  rerenderAvatarsForCamera();
  rerenderChairsForCamera();
  rerenderWindowsForCamera();
  addGlobalLog('Camera reset to origin (0,0).');
}

function updateWindowTypeOptions() {
  const category = categorySelectEl.value;
  const options = categoryWindowMap[category] || [];

  windowTypeSelectEl.innerHTML = '';
  for (const opt of options) {
    const node = document.createElement('option');
    node.value = opt.type;
    node.textContent = opt.label;
    windowTypeSelectEl.appendChild(node);
  }
}

function updateSavedProjectsUI() {
  savedProjectSelectEl.innerHTML = '';

  if (session.isGuest) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Guest mode: no saved projects';
    savedProjectSelectEl.appendChild(opt);
    savedProjectSelectEl.disabled = true;
    reopenProjectBtnEl.disabled = true;
    return;
  }

  savedProjectSelectEl.disabled = false;
  reopenProjectBtnEl.disabled = false;

  if (!session.savedProjects.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No saved projects yet';
    savedProjectSelectEl.appendChild(opt);
    return;
  }

  for (const p of session.savedProjects) {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = `${p.name} (${p.type})`;
    savedProjectSelectEl.appendChild(opt);
  }
}

function waitForYouTubeApi() {
  if (youtubeApiReady && window.YT && window.YT.Player) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    youtubeReadyResolvers.push(resolve);
  });
}

function randomGuestName() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `Guest-${n}`;
}

function colorFromId(id) {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i);
  return palette[sum % palette.length];
}

function isOwner(windowState) {
  return windowState.ownerId === session.selfId;
}

function canEdit(windowState) {
  return isOwner(windowState) || (windowState.permissions && windowState.permissions.editors.includes(session.selfId));
}

function userNameById(id) {
  const user = lobbyUsers.get(id);
  return user ? user.username : id;
}

function appendConsole(windowId, text, broadcast = false) {
  const root = windowNodes.get(windowId);
  if (!root) return;
  const consoleView = root.querySelector('.console-view');
  if (!consoleView) return;

  const line = document.createElement('div');
  line.textContent = text;
  consoleView.appendChild(line);
  consoleView.scrollTop = consoleView.scrollHeight;

  if (broadcast) {
    socket.emit('window_console_output', {
      windowId,
      line: text,
    });
  }
}

function clearConsole(windowId) {
  const root = windowNodes.get(windowId);
  if (!root) return;
  const consoleView = root.querySelector('.console-view');
  if (!consoleView) return;
  consoleView.innerHTML = '';
}

async function getPyodide() {
  if (pyodideInstance) return pyodideInstance;
  if (pyodideReadyPromise) return pyodideReadyPromise;

  pyodideLoading = true;
  pyodideReadyPromise = window.loadPyodide({
    stdout: () => {},
    stderr: () => {},
  }).then((instance) => {
    pyodideInstance = instance;
    pyodideLoading = false;
    return instance;
  }).catch((err) => {
    pyodideLoading = false;
    throw err;
  });

  return pyodideReadyPromise;
}

function createAvatar(user) {
  const root = document.createElement('div');
  root.className = 'avatar idle';
  root.dataset.id = user.id;

  const name = document.createElement('div');
  name.className = 'avatar-name';
  name.textContent = user.username;

  const body = document.createElement('div');
  body.className = 'pixel-body';
  body.style.setProperty('--shirt-color', colorFromId(user.id));

  const legs = document.createElement('div');
  legs.className = 'legs';
  const arms = document.createElement('div');
  arms.className = 'arms';
  const status = document.createElement('div');
  status.className = 'avatar-status hidden';

  const leftLeg = document.createElement('div');
  leftLeg.className = 'leg left';
  const rightLeg = document.createElement('div');
  rightLeg.className = 'leg right';
  const leftArm = document.createElement('div');
  leftArm.className = 'arm left';
  const rightArm = document.createElement('div');
  rightArm.className = 'arm right';

  arms.append(leftArm, rightArm);
  legs.append(leftLeg, rightLeg);
  root.append(name, status, body, arms, legs);
  avatarLayerEl.appendChild(root);

  avatarMap.set(user.id, root);
  return root;
}

function upsertAvatar(user) {
  let avatar = avatarMap.get(user.id);
  if (!avatar) avatar = createAvatar(user);

  const name = avatar.querySelector('.avatar-name');
  if (name) name.textContent = user.username;
  const status = avatar.querySelector('.avatar-status');
  if (status) {
    const typingActive = Boolean(user.typingActive);
    const typingPhase = Math.max(1, Math.min(3, Number(user.typingPhase) || 1));
    const speechUntil = Number(user.speechUntil) || 0;
    const speechText = typeof user.speechText === 'string' ? user.speechText.trim() : '';

    if (speechText && speechUntil > Date.now()) {
      status.textContent = speechText;
      status.classList.remove('hidden');
      status.classList.add('speech');
    } else if (typingActive) {
      status.textContent = '.'.repeat(typingPhase);
      status.classList.remove('hidden');
      status.classList.remove('speech');
    } else {
      status.textContent = '';
      status.classList.add('hidden');
      status.classList.remove('speech');
    }
  }

  const render = worldToScreen(Number(user.x) || 0, Number(user.y) || 0);
  avatar.style.left = `${render.x}px`;
  avatar.style.top = `${render.y}px`;
  const state = user.state || 'idle';
  avatar.classList.toggle('walking', state === 'walking');
  avatar.classList.toggle('jumping', state === 'jumping');
  avatar.classList.toggle('bump', state === 'bump' || (Number(user.bumpUntil) || 0) > Date.now());
  avatar.classList.toggle('bump-left', user.bumpDir === 'left');
  avatar.classList.toggle('bump-right', user.bumpDir !== 'left');
  avatar.classList.toggle('sitting', state === 'sitting' || Boolean(user.sittingOnChair));
  avatar.classList.toggle('idle', state === 'idle');
  avatar.classList.toggle('facing-left', user.facing === 'left');
  avatar.classList.toggle('point-left', user.gesture === 'point-left');
  avatar.classList.toggle('point-right', user.gesture === 'point-right');
  avatar.classList.toggle('point-up', user.gesture === 'point-up');
}

function removeAvatar(userId) {
  const avatar = avatarMap.get(userId);
  if (!avatar) return;
  avatar.remove();
  avatarMap.delete(userId);

  for (const pointerMap of windowPointerNodes.values()) {
    const node = pointerMap.get(userId);
    if (node) {
      node.remove();
      pointerMap.delete(userId);
    }
  }
}

function clearAllAvatars() {
  for (const avatar of avatarMap.values()) avatar.remove();
  avatarMap.clear();
}

function sendCursorUpdate(state, force = false) {
  if (!session.lobbyId) return;
  const payload = {
    x: pointerState.worldX,
    y: pointerState.worldY,
    state,
    facing: pointerState.facing,
    gesture: pointerState.gesture || 'none',
    mode: avatarControl.enabled ? 'avatar' : 'cursor',
  };

  const now = Date.now();
  const minInterval = avatarControl.enabled ? 28 : 22;
  const payloadKey = `${payload.x}|${payload.y}|${payload.state}|${payload.facing}|${payload.gesture}|${payload.mode}`;

  if (!force) {
    if (payloadKey === lastCursorPayloadKey && now - lastCursorEmitAt < 240) return;
    if (now - lastCursorEmitAt < minInterval) return;
  }

  lastCursorEmitAt = now;
  lastCursorPayloadKey = payloadKey;
  socket.emit('cursor_move', payload);
}

function setWalkingThenIdle() {
  if (avatarControl.enabled) return;
      pointerState.state = 'walking';
      sendCursorUpdate('walking');

  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const elapsed = Date.now() - lastMoveAt;
    if (elapsed >= 140) {
      pointerState.state = 'idle';
      sendCursorUpdate('idle', true);
    }
  }, 160);
}

function snapToGrid(value) {
  return Math.round(Number(value || 0) / GRID_SIZE) * GRID_SIZE;
}

function updateLocalAvatarFromPointer() {
  const me = lobbyUsers.get(session.selfId);
  if (!me) return;
  me.x = pointerState.worldX;
  me.y = pointerState.worldY;
  me.state = pointerState.state;
  me.facing = pointerState.facing;
  me.gesture = pointerState.gesture || 'none';
  me.mode = avatarControl.enabled ? 'avatar' : 'cursor';
  upsertAvatar(me);
  updateChairInteractPrompt();
}

function applyGestureFromKeys() {
  if (gestureKeys.q && gestureKeys.e) {
    pointerState.gesture = 'point-up';
  } else if (gestureKeys.e) {
    pointerState.gesture = 'point-right';
  } else if (gestureKeys.q) {
    pointerState.gesture = 'point-left';
  } else {
    pointerState.gesture = 'none';
  }
}

function triggerAvatarJump() {
  if (!avatarControl.enabled) return;
  const now = Date.now();
  avatarControl.wTapCount = now - avatarControl.lastWAt < 450 ? avatarControl.wTapCount + 1 : 1;
  avatarControl.lastWAt = now;

  if (avatarControl.wTapCount >= 3) {
    avatarControl.floorY -= GRID_SIZE;
    avatarControl.wTapCount = 0;
  }

  if (Math.abs(pointerState.worldY - avatarControl.floorY) <= 1 && Math.abs(avatarControl.vy) < 0.01) {
    avatarControl.vy = -9.8;
  }
}

function triggerAvatarDropFloor() {
  if (!avatarControl.enabled) return;
  const now = Date.now();
  avatarControl.sTapCount = now - avatarControl.lastSAt < 450 ? avatarControl.sTapCount + 1 : 1;
  avatarControl.lastSAt = now;

  if (avatarControl.sTapCount >= 3) {
    avatarControl.floorY += GRID_SIZE;
    avatarControl.sTapCount = 0;
    if (pointerState.worldY <= avatarControl.floorY) {
      avatarControl.vy = Math.max(avatarControl.vy, 2.4);
    }
  }
}

function runAvatarControlLoop() {
  if (!avatarControl.enabled) {
    avatarControl.rafId = null;
    return;
  }

  const meState = lobbyUsers.get(session.selfId);
  if (meState && meState.sittingOnChair) {
    avatarControl.left = false;
    avatarControl.right = false;
    avatarControl.vy = 0;
    pointerState.worldX = Number(meState.x) || pointerState.worldX;
    pointerState.worldY = Number(meState.y) || pointerState.worldY;
    pointerState.state = 'sitting';
    pointerState.gesture = 'none';
    updateLocalAvatarFromPointer();
    avatarControl.rafId = requestAnimationFrame(runAvatarControlLoop);
    return;
  }

  const speed = 4.2;
  let moving = false;

  if (avatarControl.left && !avatarControl.right) {
    pointerState.worldX = Math.round(pointerState.worldX - speed);
    pointerState.facing = 'left';
    moving = true;
  } else if (avatarControl.right && !avatarControl.left) {
    pointerState.worldX = Math.round(pointerState.worldX + speed);
    pointerState.facing = 'right';
    moving = true;
  }

  avatarControl.vy += 0.62;
  pointerState.worldY = Math.round(pointerState.worldY + avatarControl.vy);

  if (pointerState.worldY >= avatarControl.floorY) {
    pointerState.worldY = avatarControl.floorY;
    avatarControl.vy = 0;
  }

  if (Math.abs(avatarControl.vy) > 0.15) {
    pointerState.state = 'jumping';
  } else {
    pointerState.state = moving ? 'walking' : 'idle';
  }

  updateLocalAvatarFromPointer();
  sendCursorUpdate(pointerState.state);
  avatarControl.rafId = requestAnimationFrame(runAvatarControlLoop);
}

function toggleAvatarControlMode() {
  avatarControl.enabled = !avatarControl.enabled;
  avatarControl.left = false;
  avatarControl.right = false;
  avatarControl.vy = 0;
  avatarControl.wTapCount = 0;
  avatarControl.sTapCount = 0;
  gestureKeys.q = false;
  gestureKeys.e = false;

  if (avatarControl.enabled) {
    const me = lobbyUsers.get(session.selfId);
    if (me) {
      pointerState.worldX = Number(me.x) || pointerState.worldX;
      pointerState.worldY = Number(me.y) || pointerState.worldY;
      pointerState.facing = me.facing === 'left' ? 'left' : 'right';
    }
    avatarControl.floorY = snapToGrid(pointerState.worldY);
    pointerState.worldY = avatarControl.floorY;
    addGlobalLog('Avatar control mode enabled (A/D move, W jump up floors, S drop floors, I toggle).');
    if (!avatarControl.rafId) {
      avatarControl.rafId = requestAnimationFrame(runAvatarControlLoop);
    }
  } else {
    pointerState.state = 'idle';
    pointerState.gesture = 'none';
    updateLocalAvatarFromPointer();
    sendCursorUpdate('idle');
    addGlobalLog('Cursor mode enabled.');
  }
  updateChairInteractPrompt();
}

function emitTypingState(active, phase) {
  if (!session.lobbyId) return;
  socket.emit('avatar_typing', {
    active: Boolean(active),
    phase: Math.max(0, Math.min(3, Number(phase) || 0)),
  });
}

function openQuickSayComposer(onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'quick-say-overlay';

  const card = document.createElement('div');
  card.className = 'quick-say-card';

  const title = document.createElement('div');
  title.className = 'quick-say-title';
  title.textContent = 'What would you like to say?';

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 180;
  input.placeholder = 'Type message...';

  const actions = document.createElement('div');
  actions.className = 'button-row';

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.textContent = 'Send';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';

  const close = (text) => {
    overlay.remove();
    onDone(text);
  };

  sendBtn.addEventListener('click', () => close(input.value.trim()));
  cancelBtn.addEventListener('click', () => close(''));
  input.addEventListener('keydown', (event) => {
    if (event.code === 'Enter') {
      event.preventDefault();
      close(input.value.trim());
    } else if (event.code === 'Escape') {
      event.preventDefault();
      close('');
    }
  });

  actions.append(sendBtn, cancelBtn);
  card.append(title, input, actions);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  input.focus();
}

function startQuickSayFlow() {
  if (!session.lobbyId || quickSayActive) return;
  quickSayActive = true;

  const me = lobbyUsers.get(session.selfId);
  let phase = 1;
  if (me) {
    me.typingActive = true;
    me.typingPhase = phase;
    upsertAvatar(me);
  }
  emitTypingState(true, phase);

  quickSayTypingTimer = setInterval(() => {
    phase = phase % 3 + 1;
    const user = lobbyUsers.get(session.selfId);
    if (user) {
      user.typingActive = true;
      user.typingPhase = phase;
      upsertAvatar(user);
    }
    emitTypingState(true, phase);
  }, 280);

  openQuickSayComposer((text) => {
    if (quickSayTypingTimer) {
      clearInterval(quickSayTypingTimer);
      quickSayTypingTimer = null;
    }
    quickSayActive = false;

    const user = lobbyUsers.get(session.selfId);
    if (user) {
      user.typingActive = false;
      user.typingPhase = 0;
      upsertAvatar(user);
    }
    emitTypingState(false, 0);

    if (!text) return;
    socket.emit('avatar_say', { text }, (resp) => {
      if (!resp || !resp.ok) {
        addGlobalLog(resp && resp.error ? resp.error : 'Failed to send quick message.');
      }
    });
  });
}

function joinLobby(lobbyId) {
  if (!session.username) {
    alert('Sign in first (Member or Guest).');
    return;
  }

  socket.emit('join_lobby', {
    lobbyId,
    username: session.username,
    isGuest: session.isGuest,
    x: pointerState.worldX,
    y: pointerState.worldY,
  }, (resp) => {
    if (!resp || !resp.ok) {
      alert(resp && resp.error ? resp.error : 'Join failed');
      return;
    }

    session.lobbyId = resp.lobbyId;
    session.selfId = resp.selfId;
    session.savedProjects = resp.savedProjects || [];
    lobbyLabelEl.textContent = `Joined: ${resp.lobbyId}`;
    updateSavedProjectsUI();
  });
}

function setupAuthAndLobbyControls() {
  updateWindowTypeOptions();
  setupControlsGuide();

  if (requestNotifyBtnEl && requestNotifyPanelEl) {
    requestNotifyBtnEl.addEventListener('click', (event) => {
      event.stopPropagation();
      requestNotifyPanelEl.classList.toggle('hidden');
      requestNotifyBtnEl.setAttribute('aria-expanded', String(!requestNotifyPanelEl.classList.contains('hidden')));
    });
    requestNotifyPanelEl.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener('click', () => {
      requestNotifyPanelEl.classList.add('hidden');
      requestNotifyBtnEl.setAttribute('aria-expanded', 'false');
    });
  }

  categorySelectEl.addEventListener('change', updateWindowTypeOptions);

  memberLoginBtnEl.addEventListener('click', () => {
    const raw = usernameInputEl.value.trim();
    if (!raw) {
      alert('Enter a username for member mode.');
      return;
    }

    session.username = raw.slice(0, 24);
    session.isGuest = false;
    sessionLabelEl.textContent = `Member: ${session.username}`;
    updateSavedProjectsUI();
  });

  guestBtnEl.addEventListener('click', () => {
    session.username = randomGuestName();
    session.isGuest = true;
    sessionLabelEl.textContent = `Guest: ${session.username}`;
    session.savedProjects = [];
    updateSavedProjectsUI();
  });

  for (const btn of document.querySelectorAll('.lobby-btn')) {
    btn.addEventListener('click', () => joinLobby(btn.dataset.lobby));
  }

  spawnOrganizedBtnEl.addEventListener('click', () => {
    if (!session.lobbyId) {
      alert('Join a lobby first.');
      return;
    }

    const spawnWorld = screenToWorld(220, 140);
    socket.emit('window_create', { type: windowTypeSelectEl.value, x: spawnWorld.x, y: spawnWorld.y }, (resp) => {
      if (!resp || !resp.ok) {
        alert(resp && resp.error ? resp.error : 'Failed to create window');
      }
    });
  });

  reopenProjectBtnEl.addEventListener('click', () => {
    if (session.isGuest) {
      alert('Create an account to reopen your work.');
      return;
    }

    const name = savedProjectSelectEl.value;
    if (!name) return;

    socket.emit('project_reopen', { name }, (resp) => {
      if (!resp || !resp.ok) {
        alert(resp && resp.error ? resp.error : 'Failed to reopen project');
      }
    });
  });

  simulatePlayerBtnEl.addEventListener('click', () => {
    if (!session.lobbyId) {
      alert('Join a lobby first.');
      return;
    }

    socket.emit('debug_simulate_player', {}, (resp) => {
      if (!resp || !resp.ok) {
        alert(resp && resp.error ? resp.error : 'Bot simulation failed');
        return;
      }
      addGlobalLog('Debug simulation started.');
    });
  });

  const goOriginBtn = document.createElement('button');
  goOriginBtn.type = 'button';
  goOriginBtn.textContent = 'Go to Origin';
  goOriginBtn.addEventListener('click', goToOrigin);
  const chairBtn = document.createElement('button');
  chairBtn.type = 'button';
  chairBtn.textContent = 'Toggle Chair';
  chairBtn.addEventListener('click', () => {
    if (!session.lobbyId) {
      alert('Join a lobby first.');
      return;
    }
    const pos = {
      x: snapToGrid(pointerState.worldX),
      y: snapToGrid(pointerState.worldY),
    };
    socket.emit('chair_toggle', pos, (resp) => {
      if (!resp || !resp.ok) {
        alert(resp && resp.error ? resp.error : 'Failed to toggle chair');
        return;
      }
      addGlobalLog(resp.active ? 'Chair spawned.' : 'Chair removed.');
    });
  });
  const authPanel = document.getElementById('authPanel');
  if (authPanel) {
    authPanel.appendChild(goOriginBtn);
    authPanel.appendChild(chairBtn);
  }

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.code === 'KeyT') {
      event.preventDefault();
      debugPanelEl.classList.toggle('hidden');
      addGlobalLog('Debug panel toggled.');
    }
  });
}

function setWindowState(windowState) {
  windows.set(windowState.id, windowState);
  if (Number.isFinite(windowState.zIndex)) {
    localZCounter = Math.max(localZCounter, windowState.zIndex + 1);
  }
}

function markWindowInteraction(windowId, type, active) {
  const existing = localWindowInteractions.get(windowId) || {
    dragging: false,
    resizing: false,
    updatedAt: 0,
  };
  existing[type] = active;
  existing.updatedAt = Date.now();
  localWindowInteractions.set(windowId, existing);
}

function isWindowInteractionActive(windowId) {
  const info = localWindowInteractions.get(windowId);
  if (!info) return false;
  if (info.dragging || info.resizing) return true;
  return Date.now() - (info.updatedAt || 0) < 180;
}

function removeWindow(windowId) {
  removeWindowRequests(windowId);
  renderRequestNotifications();
  mainChatRenderers.delete(windowId);
  miniChatRenderers.delete(windowId);
  const yt = youtubePlayers.get(windowId);
  if (yt && yt.player && typeof yt.player.destroy === 'function') {
    yt.player.destroy();
  }
  const runtime = dinoRuntime.get(windowId);
  if (runtime && typeof runtime.cleanup === 'function') {
    runtime.cleanup();
  }
  windows.delete(windowId);
  const node = windowNodes.get(windowId);
  if (node) {
    node.remove();
    windowNodes.delete(windowId);
  }

  youtubePlayers.delete(windowId);
  pendingYouTubeControl.delete(windowId);
  youtubeRecoveryAt.delete(windowId);
  youtubeRecoveryCount.delete(windowId);
  youtubeEmbedFallbackMode.delete(windowId);
  youtubeEmbedLastApplied.delete(windowId);
  drawingContexts.delete(windowId);
  windowPointerNodes.delete(windowId);
  dinoRuntime.delete(windowId);
}

function renderAllWindows() {
  for (const [windowId, windowState] of windows.entries()) {
    renderWindow(windowId, windowState);
  }
}

function applyWindowBaseStyles(root, windowState) {
  const render = worldToScreen(Number(windowState.x) || 0, Number(windowState.y) || 0);
  root.style.left = `${render.x}px`;
  root.style.top = `${render.y}px`;
  root.style.width = `${windowState.width}px`;
  root.style.height = `${windowState.height}px`;
  root.style.zIndex = String(windowState.zIndex || 1);
}

function createWindowNode(windowState) {
  const root = document.createElement('div');
  root.className = 'pc-window';
  root.dataset.id = windowState.id;

  const header = document.createElement('div');
  header.className = 'window-header';

  const title = document.createElement('div');
  title.className = 'window-title';

  const owner = document.createElement('div');
  owner.className = 'window-owner';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'window-close-btn';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const state = windows.get(windowState.id);
    if (!state) return;
    const confirmed = window.confirm(`Are you sure you want to close "${state.title}"?`);
    if (!confirmed) return;
    socket.emit('window_remove', { windowId: state.id }, (resp) => {
      if (!resp || !resp.ok) {
        alert(resp && resp.error ? resp.error : 'Failed to close window');
      }
    });
  });

  header.append(title, owner, closeBtn);

  const content = document.createElement('div');
  content.className = 'window-content';

  const controls = document.createElement('div');
  controls.className = 'window-controls';

  const main = document.createElement('div');
  main.className = 'window-main';

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';

  content.append(controls, main);
  root.append(header, content, resizeHandle);
  windowLayerEl.appendChild(root);
  windowNodes.set(windowState.id, root);

  root.addEventListener('mousedown', () => {
    const z = localZCounter;
    localZCounter += 1;
    root.style.zIndex = String(z);
    socket.emit('window_update', { windowId: windowState.id, zIndex: z });
  });

  setupDrag(root, header, windowState.id);
  setupResize(root, resizeHandle, windowState.id);
  return root;
}

function setupDrag(root, handle, windowId) {
  handle.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    markWindowInteraction(windowId, 'dragging', true);

    const rect = root.getBoundingClientRect();
    const dragState = {
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
    };
    let lastEmitAt = 0;
    let pendingWorld = null;

    const onMove = (moveEvent) => {
      const wsRect = workspaceEl.getBoundingClientRect();
      const screenX = moveEvent.clientX - wsRect.left - dragState.dx;
      const screenY = moveEvent.clientY - wsRect.top - dragState.dy;
      const world = screenToWorld(screenX, screenY);

      root.style.left = `${Math.round(screenX)}px`;
      root.style.top = `${Math.round(screenY)}px`;
      const state = windows.get(windowId);
      if (state) {
        state.x = Math.round(world.x);
        state.y = Math.round(world.y);
      }

      pendingWorld = { x: Math.round(world.x), y: Math.round(world.y) };
      const now = Date.now();
      if (now - lastEmitAt >= 34) {
        lastEmitAt = now;
        socket.emit('window_update', { windowId, x: pendingWorld.x, y: pendingWorld.y });
      }
    };

    const onUp = () => {
      markWindowInteraction(windowId, 'dragging', false);
      if (pendingWorld) {
        socket.emit('window_update', { windowId, x: pendingWorld.x, y: pendingWorld.y });
      }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function setupResize(root, handle, windowId) {
  handle.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    markWindowInteraction(windowId, 'resizing', true);

    const rect = root.getBoundingClientRect();
    const resizeState = {
      startX: event.clientX,
      startY: event.clientY,
      startW: rect.width,
      startH: rect.height,
    };
    let lastEmitAt = 0;
    let pendingSize = null;

    const onMove = (moveEvent) => {
      const width = Math.max(280, resizeState.startW + (moveEvent.clientX - resizeState.startX));
      const height = Math.max(200, resizeState.startH + (moveEvent.clientY - resizeState.startY));
      root.style.width = `${Math.round(width)}px`;
      root.style.height = `${Math.round(height)}px`;
      const state = windows.get(windowId);
      if (state) {
        state.width = Math.round(width);
        state.height = Math.round(height);
      }

      pendingSize = { width: Math.round(width), height: Math.round(height) };
      const now = Date.now();
      if (now - lastEmitAt >= 34) {
        lastEmitAt = now;
        socket.emit('window_update', { windowId, width: pendingSize.width, height: pendingSize.height });
      }
    };

    const onUp = () => {
      markWindowInteraction(windowId, 'resizing', false);
      if (pendingSize) {
        socket.emit('window_update', { windowId, width: pendingSize.width, height: pendingSize.height });
      }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function setupLocalDrag(root, handle) {
  handle.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();

    const rect = root.getBoundingClientRect();
    const dragState = {
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
    };

    const onMove = (moveEvent) => {
      const wsRect = workspaceEl.getBoundingClientRect();
      const screenX = moveEvent.clientX - wsRect.left - dragState.dx;
      const screenY = moveEvent.clientY - wsRect.top - dragState.dy;
      root.style.left = `${Math.round(screenX)}px`;
      root.style.top = `${Math.round(screenY)}px`;
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function setupLocalResize(root, handle) {
  handle.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();

    const rect = root.getBoundingClientRect();
    const resizeState = {
      startX: event.clientX,
      startY: event.clientY,
      startW: rect.width,
      startH: rect.height,
    };

    const onMove = (moveEvent) => {
      const width = Math.max(280, resizeState.startW + (moveEvent.clientX - resizeState.startX));
      const height = Math.max(200, resizeState.startH + (moveEvent.clientY - resizeState.startY));
      root.style.width = `${Math.round(width)}px`;
      root.style.height = `${Math.round(height)}px`;
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function buildCodeEditor(windowState, mainEl) {
  const codeArea = document.createElement('textarea');
  codeArea.className = 'code-area';
  codeArea.value = typeof windowState.content.code === 'string' ? windowState.content.code : '';
  codeArea.disabled = !canEdit(windowState);

  const consoleView = document.createElement('div');
  consoleView.className = 'console-view';

  codeArea.addEventListener('input', () => {
    socket.emit('window_code_update', {
      windowId: windowState.id,
      code: codeArea.value,
    });
  });

  mainEl.append(codeArea, consoleView);
  return { codeArea, consoleView };
}

function ensureWindowPointerOverlay(windowRoot) {
  let overlay = windowRoot.querySelector('.window-pointer-layer');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'window-pointer-layer';
    windowRoot.appendChild(overlay);
  }
  return overlay;
}

function makeWindowPointerNode(userId, username) {
  const node = document.createElement('div');
  node.className = 'window-pointer window-pointer-hidden';
  node.dataset.userId = userId;
  node.style.setProperty('--cursor-color', colorFromId(userId || 'self'));
  node.innerHTML = `
    <div class="window-pointer-name"></div>
    <div class="window-pointer-tip"></div>
    <div class="window-pointer-pixel"></div>
  `;
  const label = node.querySelector('.window-pointer-name');
  if (label) {
    label.textContent = username || userId;
  }
  return node;
}

function getOrCreateWindowPointer(windowId, windowRoot, userId, username) {
  if (!windowPointerNodes.has(windowId)) {
    windowPointerNodes.set(windowId, new Map());
  }
  const pointerMap = windowPointerNodes.get(windowId);
  if (pointerMap.has(userId)) return pointerMap.get(userId);

  const overlay = ensureWindowPointerOverlay(windowRoot);
  const node = makeWindowPointerNode(userId, username);
  overlay.appendChild(node);
  pointerMap.set(userId, node);
  return node;
}

function setWindowPointer(node, relX, relY, visible) {
  node.style.left = `${relX}px`;
  node.style.top = `${relY}px`;
  node.classList.toggle('window-pointer-hidden', !visible);
}

function emitWindowPointer(windowId, relX, relY, visible) {
  if (!session.lobbyId) return;
  socket.emit('window_pointer_move', {
    windowId,
    relX,
    relY,
    visible,
  });
}

function attachWindowPointer(windowState, windowRoot) {
  if (!windowRoot) return;
  if (windowRoot.__windowPointerCleanup) {
    windowRoot.__windowPointerCleanup();
  }

  windowRoot.classList.add('has-window-pointer');

  const selfId = session.selfId || 'self';
  const selfNode = getOrCreateWindowPointer(
    windowState.id,
    windowRoot,
    selfId,
    session.username || 'You'
  );
  selfNode.classList.add('window-pointer-self');

  const onMove = (event) => {
    const rect = windowRoot.getBoundingClientRect();
    const relX = event.clientX - rect.left;
    const relY = event.clientY - rect.top;
    const inside = relX >= 0 && relY >= 0 && relX <= rect.width && relY <= rect.height;

    if (!inside) {
      setWindowPointer(selfNode, relX, relY, false);
      emitWindowPointer(windowState.id, 0, 0, false);
      return;
    }

    const rx = Math.round(relX);
    const ry = Math.round(relY);
    setWindowPointer(selfNode, rx, ry, true);
    emitWindowPointer(windowState.id, rx, ry, true);
  };

  const onLeave = (event) => {
    const hoverEl = document.elementFromPoint(event.clientX, event.clientY);
    if (hoverEl && windowRoot.contains(hoverEl)) return;
    setWindowPointer(selfNode, 0, 0, false);
    emitWindowPointer(windowState.id, 0, 0, false);
  };

  windowRoot.addEventListener('mousemove', onMove, true);
  windowRoot.addEventListener('mouseenter', onMove, true);
  windowRoot.addEventListener('mouseleave', onLeave, true);

  windowRoot.__windowPointerCleanup = () => {
    windowRoot.removeEventListener('mousemove', onMove, true);
    windowRoot.removeEventListener('mouseenter', onMove, true);
    windowRoot.removeEventListener('mouseleave', onLeave, true);
    windowRoot.classList.remove('has-window-pointer');
  };
}

function openMiniInfoWindow(parentWindowState, title, lines) {
  const parentNode = windowNodes.get(parentWindowState.id);
  if (!parentNode) return;

  const mini = document.createElement('div');
  mini.className = 'pc-window mini-info-window';

  const header = document.createElement('div');
  header.className = 'window-header';

  const t = document.createElement('div');
  t.className = 'window-title';
  t.textContent = title;

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  const removeMini = () => {
    unregisterMiniChatRenderer(parentWindowState.id, render);
    mini.remove();
  };
  close.addEventListener('click', removeMini);
  header.append(t, close);

  const content = document.createElement('div');
  content.className = 'window-content';
  const list = document.createElement('div');
  list.className = 'chat-log';
  for (const line of lines.slice(-40)) {
    const row = document.createElement('div');
    row.className = 'chat-item';
    row.textContent = line;
    list.appendChild(row);
  }
  content.appendChild(list);
  mini.append(header, content);
  windowLayerEl.appendChild(mini);

  const left = Number(parentNode.style.left.replace('px', '')) || 0;
  const top = Number(parentNode.style.top.replace('px', '')) || 0;
  mini.style.left = `${left + 24}px`;
  mini.style.top = `${top + 24}px`;
  mini.style.width = '320px';
  mini.style.height = '230px';
  mini.style.zIndex = String(++localZCounter);

  setupDrag(mini, header, parentWindowState.id);
  attachLocalMiniPointer(mini);
}

function openMiniChatWindow(parentWindowState) {
  const parentNode = windowNodes.get(parentWindowState.id);
  if (!parentNode) return;

  const mini = document.createElement('div');
  mini.className = 'pc-window mini-info-window';

  const header = document.createElement('div');
  header.className = 'window-header';

  const t = document.createElement('div');
  t.className = 'window-title';
  t.textContent = `${parentWindowState.title} - Chat`;

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.addEventListener('click', () => mini.remove());
  header.append(t, close);

  const content = document.createElement('div');
  content.className = 'window-content mini-chat-content';

  const tabRow = document.createElement('div');
  tabRow.className = 'button-row';
  const collabBtn = document.createElement('button');
  collabBtn.type = 'button';
  collabBtn.textContent = 'Collaborators';
  const guestsBtn = document.createElement('button');
  guestsBtn.type = 'button';
  guestsBtn.textContent = 'Guests';
  tabRow.append(collabBtn, guestsBtn);

  const list = document.createElement('div');
  list.className = 'chat-log';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Type a message';

  const send = document.createElement('button');
  send.type = 'button';
  send.textContent = 'Send';

  let tab = 'collaborators';

  const render = () => {
    const state = windows.get(parentWindowState.id);
    const items = (state && state.chatLog) ? state.chatLog : [];
    list.innerHTML = '';
    for (const m of items) {
      if (m.tab !== tab) continue;
      const row = document.createElement('div');
      row.className = 'chat-item';
      row.textContent = `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.username}: ${m.text}`;
      list.appendChild(row);
    }
  };

  collabBtn.addEventListener('click', () => {
    tab = 'collaborators';
    render();
  });
  guestsBtn.addEventListener('click', () => {
    tab = 'guests';
    render();
  });

  const sendMessage = () => {
    const message = input.value.trim();
    if (!message) return;
    socket.emit('window_chat_send', {
      windowId: parentWindowState.id,
      tab,
      message,
    }, (resp) => {
      if (!resp || !resp.ok) {
        alert(resp && resp.error ? resp.error : 'Failed to send message');
        return;
      }
      input.value = '';
      render();
    });
  };

  send.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  });

  content.append(tabRow, list, input, send);
  mini.append(header, content);
  windowLayerEl.appendChild(mini);

  const left = Number(parentNode.style.left.replace('px', '')) || 0;
  const top = Number(parentNode.style.top.replace('px', '')) || 0;
  mini.style.left = `${left + 24}px`;
  mini.style.top = `${top + 24}px`;
  mini.style.width = '340px';
  mini.style.height = '280px';
  mini.style.zIndex = String(++localZCounter);

  setupDrag(mini, header, parentWindowState.id);
  attachLocalMiniPointer(mini);
  registerMiniChatRenderer(parentWindowState.id, render);
  mini.addEventListener('DOMNodeRemovedFromDocument', () => {
    unregisterMiniChatRenderer(parentWindowState.id, render);
  }, { once: true });
  render();
}

function attachLocalMiniPointer(miniWindowRoot) {
  const overlay = document.createElement('div');
  overlay.className = 'window-pointer-layer';
  const node = makeWindowPointerNode(session.selfId || 'self', session.username || 'You');
  overlay.appendChild(node);
  miniWindowRoot.appendChild(overlay);

  miniWindowRoot.addEventListener('mousemove', (event) => {
    const rect = miniWindowRoot.getBoundingClientRect();
    const relX = event.clientX - rect.left;
    const relY = event.clientY - rect.top;
    const inside = relX >= 0 && relY >= 0 && relX <= rect.width && relY <= rect.height;
    if (!inside) {
      node.classList.add('window-pointer-hidden');
      return;
    }
    setWindowPointer(node, Math.round(relX), Math.round(relY), true);
  }, true);

  miniWindowRoot.addEventListener('mouseleave', () => {
    node.classList.add('window-pointer-hidden');
  }, true);
}

function addSaveButton(windowState, controlsEl) {
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save';

  if (session.isGuest) {
    saveBtn.disabled = true;
    saveBtn.title = 'Create an account to save your work.';
    saveBtn.addEventListener('click', () => {
      alert('Create an account to save your work.');
    });
  } else {
    saveBtn.addEventListener('click', () => {
      const root = windowNodes.get(windowState.id);
      const codeArea = root ? root.querySelector('.code-area') : null;
      const code = codeArea ? codeArea.value : (windowState.content.code || '');
      const defaultName = `${windowState.type}-${new Date().toISOString().slice(0, 19)}`;
      const projectName = window.prompt('Project name:', defaultName);
      if (!projectName) return;

      socket.emit('project_save', {
        type: windowState.type,
        name: projectName,
        code,
      }, (resp) => {
        if (!resp || !resp.ok) {
          alert(resp && resp.error ? resp.error : 'Failed to save project');
          return;
        }

        session.savedProjects = resp.projects || [];
        updateSavedProjectsUI();
        addGlobalLog(`Saved project '${projectName}'.`);
      });
    });
  }

  controlsEl.appendChild(saveBtn);
}

async function runPythonWindow(windowState) {
  clearConsole(windowState.id);
  appendConsole(windowState.id, pyodideLoading ? 'Loading Pyodide...' : 'Running Python...', true);

  try {
    const py = await getPyodide();
    py.setStdout({ batched: (msg) => appendConsole(windowState.id, msg, true) });
    py.setStderr({ batched: (msg) => appendConsole(windowState.id, msg, true) });

    const root = windowNodes.get(windowState.id);
    const codeArea = root ? root.querySelector('.code-area') : null;
    const code = codeArea ? codeArea.value : windowState.content.code || '';
    await py.runPythonAsync(code);
    appendConsole(windowState.id, 'Python finished.', true);
  } catch (err) {
    appendConsole(windowState.id, `Error: ${String(err)}`, true);
  }
}

function openHtmlResultWindow(windowId, code) {
  const resultWin = window.open('', `pixelcode-html-${windowId}`);
  if (!resultWin) {
    alert('Popup blocked. Allow popups to view HTML run output.');
    return;
  }

  const escaped = JSON.stringify(code).replace(/<\/script/gi, '<\\/script');
  resultWin.document.write(`<!doctype html><html><head><title>HTML/JS Result</title><style>html,body,iframe{margin:0;width:100%;height:100%;background:#111;color:#fff;font-family:sans-serif}</style></head><body><iframe sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe><script>const iframe=document.querySelector('iframe');iframe.srcdoc=${escaped};</script></body></html>`);
  resultWin.document.close();
}

function openHtmlResultWorkspaceWindow(sourceWindowState, code) {
  const node = document.createElement('div');
  node.className = 'pc-window html-result-window';

  const header = document.createElement('div');
  header.className = 'window-header';

  const title = document.createElement('div');
  title.className = 'window-title';
  title.textContent = `HTML Result (${sourceWindowState.id})`;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => node.remove());
  header.append(title, closeBtn);

  const content = document.createElement('div');
  content.className = 'window-content';

  const iframe = document.createElement('iframe');
  iframe.className = 'html-result-frame';
  iframe.sandbox = 'allow-scripts';
  iframe.referrerPolicy = 'no-referrer';
  iframe.srcdoc = code;
  content.appendChild(iframe);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';

  node.append(header, content, resizeHandle);
  windowLayerEl.appendChild(node);

  const sourceNode = windowNodes.get(sourceWindowState.id);
  const baseLeft = sourceNode ? (Number(sourceNode.style.left.replace('px', '')) || 60) : 60;
  const baseTop = sourceNode ? (Number(sourceNode.style.top.replace('px', '')) || 60) : 60;
  node.style.left = `${baseLeft + 26}px`;
  node.style.top = `${baseTop + 26}px`;
  node.style.width = '520px';
  node.style.height = '360px';
  node.style.zIndex = String(++localZCounter);

  setupLocalDrag(node, header);
  setupLocalResize(node, resizeHandle);
}

function shouldUserscriptRun(scriptCode, targetUrl) {
  const lines = String(scriptCode || '').split('\n');
  const matches = [];
  const includes = [];

  for (const line of lines) {
    const match = line.match(/@match\s+(.+)/);
    const include = line.match(/@include\s+(.+)/);
    if (match) matches.push(match[1].trim());
    if (include) includes.push(include[1].trim());
  }

  if (!matches.length && !includes.length) return true;

  const wildcardToRegex = (pattern) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

  for (const p of matches) {
    if (wildcardToRegex(p).test(targetUrl)) return true;
  }
  for (const p of includes) {
    if (wildcardToRegex(p).test(targetUrl)) return true;
  }
  return false;
}

function runUserscript(windowState, forceRun) {
  clearConsole(windowState.id);
  const root = windowNodes.get(windowState.id);
  if (!root) return;

  const codeArea = root.querySelector('.code-area');
  const code = codeArea ? codeArea.value : windowState.content.code || '';
  const targetUrl = 'https://pixelcode-hub.local/target';

  try {
    if (!forceRun && !shouldUserscriptRun(code, targetUrl)) {
      appendConsole(windowState.id, 'Userscript headers do not match target URL. Press Force Run to override.', true);
      return;
    }

    const preview = root.querySelector('.userscript-preview');
    if (!preview) {
      appendConsole(windowState.id, 'Missing target preview frame.', true);
      return;
    }

    const targetHtml = windowState.content.targetHtml || '<div id="target-root"></div>';
    const normalizedCode = String(code || '').replace(/aboslute/g, 'absolute');
    const payloadScript = normalizedCode.replace(/<\/(script)/gi, '<\\/$1');
    const isDrawOnPageScript = /Draw on Page/i.test(normalizedCode)
      || /Shift\+Alt\+D/i.test(normalizedCode)
      || /tm-drawing-canvas/i.test(normalizedCode);
    const autoActivateSnippet = isDrawOnPageScript
      ? "setTimeout(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD',key:'D',altKey:true,shiftKey:true,bubbles:true}));send('Auto-activated Shift+Alt+D for Draw on Page script.');},40);"
      : '';
    const wrapped = `<!doctype html><html><head><style>html,body{margin:0;min-height:100%;background:#fff;color:#111;font-family:sans-serif;}#target-root{padding:8px;}</style></head><body>${targetHtml}<script>const send=(m)=>parent.postMessage({type:'userscript_console',windowId:'${windowState.id}',message:m},'*');console.log=(...a)=>send(a.join(' '));window.onerror=(m)=>send('Error: '+m);try{${payloadScript};${autoActivateSnippet}}catch(e){send('Runtime error: '+e.message)}</script></body></html>`;

    preview.srcdoc = wrapped;
    preview.focus();
    appendConsole(windowState.id, forceRun ? 'Userscript force executed.' : 'Userscript executed.', true);
  } catch (err) {
    appendConsole(windowState.id, `Userscript error: ${String(err)}`, true);
  }
}

function buildYouTubeMain(windowState, mainEl) {
  const wrap = document.createElement('div');
  wrap.className = 'youtube-view';
  const canControl = canEdit(windowState);

  const inputRow = document.createElement('div');
  inputRow.className = 'button-row';

  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.placeholder = 'Paste YouTube video or playlist URL';
  urlInput.value = windowState.content.youtubeInputUrl || '';
  urlInput.disabled = !canControl;

  const loadBtn = document.createElement('button');
  loadBtn.type = 'button';
  loadBtn.textContent = 'Load URL';
  loadBtn.disabled = !canControl;

  const fixSyncBtn = document.createElement('button');
  fixSyncBtn.type = 'button';
  fixSyncBtn.textContent = 'Fix Sync';
  fixSyncBtn.disabled = !canControl;

  const fallbackBtn = document.createElement('button');
  fallbackBtn.type = 'button';
  fallbackBtn.textContent = youtubeEmbedFallbackMode.get(windowState.id) ? 'Disable Embed Fallback' : 'Enable Embed Fallback';
  fallbackBtn.disabled = !canControl;

  const help = document.createElement('div');
  help.className = 'meta';
  help.textContent = 'Supports links like youtu.be/... , youtube.com/watch?v=... , and /playlist?list=...';

  const playerEl = document.createElement('div');
  playerEl.id = `yt-player-${windowState.id}`;
  playerEl.className = 'youtube-player-host';
  playerEl.style.pointerEvents = canControl ? 'auto' : 'none';

  if (!canControl) {
    const lockText = document.createElement('div');
    lockText.className = 'meta';
    lockText.textContent = 'View-only mode. Request Edit to control this YouTube window.';
    wrap.appendChild(lockText);
  }

  loadBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) {
      appendConsole(windowState.id, 'Paste a YouTube video or playlist URL first.', true);
      return;
    }
    socket.emit('window_youtube_select', {
      windowId: windowState.id,
      url,
    }, (resp) => {
      if (!resp || !resp.ok) {
        appendConsole(windowState.id, resp && resp.error ? resp.error : 'Failed to load YouTube URL.', true);
      }
    });
  });

  fixSyncBtn.addEventListener('click', () => {
    const holder = youtubePlayers.get(windowState.id);
    if (holder && holder.player && typeof holder.player.getCurrentTime === 'function' && typeof holder.player.getPlayerState === 'function') {
      const ytState = holder.player.getPlayerState();
      const mapped = ytState === window.YT.PlayerState.PLAYING ? 'playing' : 'paused';
      socket.emit('window_youtube_control', {
        windowId: windowState.id,
        state: mapped,
        time: holder.player.getCurrentTime() || 0,
      }, () => {
        socket.emit('window_youtube_resync', { windowId: windowState.id });
      });
      return;
    }
    socket.emit('window_youtube_resync', { windowId: windowState.id });
  });

  fallbackBtn.addEventListener('click', () => {
    const enabled = !youtubeEmbedFallbackMode.get(windowState.id);
    youtubeEmbedFallbackMode.set(windowState.id, enabled);
    fallbackBtn.textContent = enabled ? 'Disable Embed Fallback' : 'Enable Embed Fallback';
    youtubeEmbedLastApplied.delete(windowState.id);

    if (enabled) {
      const current = windows.get(windowState.id);
      const payload = {
        windowId: windowState.id,
        videoId: current && current.content ? current.content.youtubeVideoId : '',
        playlistId: current && current.content ? current.content.youtubePlaylistId : '',
        state: current && current.content ? current.content.youtubeState : 'paused',
        time: current && current.content ? current.content.youtubeCurrentTime : 0,
      };
      applyYouTubeControl(payload);
    } else {
      const holder = youtubePlayers.get(windowState.id);
      if (holder && holder.player && typeof holder.player.destroy === 'function') {
        holder.player.destroy();
      }
      youtubePlayers.delete(windowState.id);
      setupYouTubePlayer(windowState.id);
    }
  });

  inputRow.append(urlInput, loadBtn, fixSyncBtn, fallbackBtn);
  wrap.append(inputRow, help, playerEl);
  mainEl.appendChild(wrap);

  setupYouTubePlayer(windowState.id);
}

async function setupYouTubePlayer(windowId) {
  if (youtubeEmbedFallbackMode.get(windowId)) return;
  await waitForYouTubeApi();
  const state = windows.get(windowId);
  if (!state) return;

  const hostId = `yt-player-${windowId}`;
  const hostEl = document.getElementById(hostId);
  if (!hostEl) return;

  const existing = youtubePlayers.get(windowId);
  if (existing) {
    const sameHost = existing.hostEl === hostEl;
    if (sameHost) return;
    if (existing.player && typeof existing.player.destroy === 'function') {
      existing.player.destroy();
    }
    youtubePlayers.delete(windowId);
  }

  let suppressEvents = false;
  const player = new window.YT.Player(hostId, {
    height: '220',
    width: '100%',
    videoId: state.content.youtubeVideoId || '',
    events: {
      onReady: () => {
        const queued = pendingYouTubeControl.get(windowId);
        if (queued) {
          pendingYouTubeControl.delete(windowId);
          applyYouTubeControl(queued);
          return;
        }

        const latest = windows.get(windowId);
        if (latest && latest.content) {
          applyYouTubeControl({
            windowId,
            videoId: latest.content.youtubeVideoId || '',
            playlistId: latest.content.youtubePlaylistId || '',
            state: latest.content.youtubeState || 'paused',
            time: Number(latest.content.youtubeCurrentTime) || 0,
          });
        }
      },
      onStateChange: () => {
        if (suppressEvents) return;
        const currentWindow = windows.get(windowId);
        if (!currentWindow || !canEdit(currentWindow)) {
          // Viewers should not emit control events; server sync drives playback.
          return;
        }

        const ytState = player.getPlayerState();
        if (ytState !== window.YT.PlayerState.PLAYING && ytState !== window.YT.PlayerState.PAUSED) return;

        const mapped = ytState === window.YT.PlayerState.PLAYING ? 'playing' : 'paused';
        socket.emit('window_youtube_control', {
          windowId,
          state: mapped,
          time: player.getCurrentTime() || 0,
        });
      },
    },
  });

  youtubePlayers.set(windowId, {
    hostId,
    hostEl,
    player,
    setSuppress: (value) => {
      suppressEvents = value;
    },
  });
}

function applyYouTubeControl(payload) {
  if (youtubeEmbedFallbackMode.get(payload.windowId)) {
    applyYouTubeEmbedFallback(payload);
    return;
  }

  const holder = youtubePlayers.get(payload.windowId);
  if (!holder) {
    pendingYouTubeControl.set(payload.windowId, payload);
    setupYouTubePlayer(payload.windowId);
    return;
  }

  const player = holder.player;
  holder.setSuppress(true);

  const run = () => {
    const shouldPlay = payload.state === 'playing';
    const currentState = typeof player.getPlayerState === 'function' ? player.getPlayerState() : null;
    const currentData = typeof player.getVideoData === 'function' ? player.getVideoData() : null;
    const currentVideoId = currentData && currentData.video_id ? currentData.video_id : '';
    const targetTime = Number(payload.time) || 0;

    if (payload.playlistId && !payload.videoId) {
      const playlistArgs = {
        listType: 'playlist',
        list: payload.playlistId,
        index: 0,
        startSeconds: targetTime,
      };
      if (shouldPlay && typeof player.loadPlaylist === 'function' && currentState === window.YT.PlayerState.UNSTARTED) {
        player.loadPlaylist(playlistArgs);
      } else if (!shouldPlay && typeof player.cuePlaylist === 'function') {
        player.cuePlaylist(playlistArgs);
      }
    } else if (payload.videoId) {
      const videoArgs = { videoId: payload.videoId, startSeconds: targetTime };
      const changedVideo = currentVideoId !== payload.videoId;
      if (changedVideo) {
        if (shouldPlay && typeof player.loadVideoById === 'function') {
          player.loadVideoById(videoArgs);
        } else if (!shouldPlay && typeof player.cueVideoById === 'function') {
          player.cueVideoById(videoArgs);
        }
      } else if (currentState === window.YT.PlayerState.UNSTARTED) {
        if (shouldPlay && typeof player.loadVideoById === 'function') {
          player.loadVideoById(videoArgs);
        } else if (!shouldPlay && typeof player.cueVideoById === 'function') {
          player.cueVideoById(videoArgs);
        }
      } else if (Number.isFinite(targetTime) && typeof player.getCurrentTime === 'function') {
        const drift = Math.abs((player.getCurrentTime() || 0) - targetTime);
        if (drift > 1.5) {
          player.seekTo(targetTime, true);
        }
      }
    } else if (Number.isFinite(payload.time)) {
      player.seekTo(targetTime, true);
    }

    if (shouldPlay && currentState !== window.YT.PlayerState.PLAYING) {
      player.playVideo();
    } else if (!shouldPlay && currentState === window.YT.PlayerState.PLAYING) {
      player.pauseVideo();
    }

    setTimeout(() => holder.setSuppress(false), 200);

    if (payload.videoId) {
      setTimeout(() => {
        const latest = youtubePlayers.get(payload.windowId);
        if (!latest || latest.player !== player) return;

        const st = typeof player.getPlayerState === 'function' ? player.getPlayerState() : null;
        const vd = typeof player.getVideoData === 'function' ? player.getVideoData() : null;
        const loadedId = vd && vd.video_id ? vd.video_id : '';
        if (loadedId === payload.videoId && st !== window.YT.PlayerState.UNSTARTED) return;

        const lastRecover = youtubeRecoveryAt.get(payload.windowId) || 0;
        if (Date.now() - lastRecover < 2500) return;
        youtubeRecoveryAt.set(payload.windowId, Date.now());
        const recoverCount = (youtubeRecoveryCount.get(payload.windowId) || 0) + 1;
        youtubeRecoveryCount.set(payload.windowId, recoverCount);

        if (recoverCount >= 2) {
          youtubeEmbedFallbackMode.set(payload.windowId, true);
          youtubeEmbedLastApplied.delete(payload.windowId);
          applyYouTubeEmbedFallback(payload);
          return;
        }

        pendingYouTubeControl.set(payload.windowId, payload);
        if (latest.player && typeof latest.player.destroy === 'function') {
          latest.player.destroy();
        }
        youtubePlayers.delete(payload.windowId);
        setupYouTubePlayer(payload.windowId);
      }, 1200);
    }
  };

  if (typeof player.getPlayerState === 'function') run();
  else setTimeout(run, 200);
}

function applyYouTubeEmbedFallback(payload) {
  const root = windowNodes.get(payload.windowId);
  if (!root) return;
  const host = root.querySelector(`#yt-player-${payload.windowId}`);
  if (!host) return;

  const params = new URLSearchParams();
  params.set('autoplay', payload.state === 'playing' ? '1' : '0');
  params.set('playsinline', '1');
  params.set('rel', '0');
  params.set('modestbranding', '1');
  params.set('enablejsapi', '0');

  let src = '';
  if (payload.videoId) {
    if (Number(payload.time) > 0) {
      params.set('start', String(Math.max(0, Math.floor(Number(payload.time)))));
    }
    src = `https://www.youtube.com/embed/${encodeURIComponent(payload.videoId)}?${params.toString()}`;
  } else if (payload.playlistId) {
    params.set('listType', 'playlist');
    params.set('list', payload.playlistId);
    if (Number(payload.time) > 0) {
      params.set('start', String(Math.max(0, Math.floor(Number(payload.time)))));
    }
    src = `https://www.youtube.com/embed?${params.toString()}`;
  } else {
    return;
  }

  const key = `${payload.videoId || ''}|${payload.playlistId || ''}|${payload.state || 'paused'}|${Math.floor(Number(payload.time) || 0)}`;
  if (youtubeEmbedLastApplied.get(payload.windowId) === key) return;
  youtubeEmbedLastApplied.set(payload.windowId, key);

  host.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = '0';
  host.appendChild(iframe);
}

function drawStrokeOnCanvas(ctx, stroke) {
  ctx.strokeStyle = stroke.color || '#ffffff';
  ctx.lineWidth = stroke.size || 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(stroke.fromX, stroke.fromY);
  ctx.lineTo(stroke.toX, stroke.toY);
  ctx.stroke();
}

function buildDrawingMain(windowState, mainEl) {
  const wrap = document.createElement('div');
  wrap.className = 'drawing-wrap';

  const controls = document.createElement('div');
  controls.className = 'button-row';

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = '#ffffff';
  colorInput.style.width = '56px';

  const sizeInput = document.createElement('input');
  sizeInput.type = 'range';
  sizeInput.min = '1';
  sizeInput.max = '12';
  sizeInput.value = '2';
  sizeInput.style.width = '120px';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.textContent = 'Clear Canvas';
  clearBtn.disabled = !canEdit(windowState);

  const canvas = document.createElement('canvas');
  canvas.className = 'draw-canvas';
  canvas.width = Math.max(320, windowState.width - 40);
  canvas.height = Math.max(180, windowState.height - 200);

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0c1820';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawingContexts.set(windowState.id, { canvas, ctx });

  const strokes = windowState.content.drawingStrokes || [];
  for (const stroke of strokes) drawStrokeOnCanvas(ctx, stroke);

  let drawing = false;
  let last = null;

  const emitStroke = (from, to) => {
    const stroke = {
      fromX: from.x,
      fromY: from.y,
      toX: to.x,
      toY: to.y,
      color: colorInput.value,
      size: Number(sizeInput.value),
    };

    drawStrokeOnCanvas(ctx, stroke);
    socket.emit('window_drawing_stroke', {
      windowId: windowState.id,
      ...stroke,
    });
  };

  const pointFromEvent = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  canvas.addEventListener('mousedown', (event) => {
    if (!canEdit(windowState)) return;
    drawing = true;
    last = pointFromEvent(event);
  });

  canvas.addEventListener('mousemove', (event) => {
    if (!drawing || !last) return;
    const curr = pointFromEvent(event);
    emitStroke(last, curr);
    last = curr;
  });

  window.addEventListener('mouseup', () => {
    drawing = false;
    last = null;
  });

  clearBtn.addEventListener('click', () => {
    socket.emit('window_drawing_clear', { windowId: windowState.id });
  });

  controls.append(colorInput, sizeInput, clearBtn);
  wrap.append(controls, canvas);
  mainEl.appendChild(wrap);
}

function buildDinoMain(windowState, mainEl) {
  const oldRuntime = dinoRuntime.get(windowState.id);
  if (oldRuntime && typeof oldRuntime.cleanup === 'function') {
    oldRuntime.cleanup();
  }

  const wrap = document.createElement('div');
  wrap.className = 'dino-wrap';

  const canvas = document.createElement('canvas');
  canvas.width = 420;
  canvas.height = 160;
  canvas.className = 'dino-canvas';

  const hint = document.createElement('div');
  hint.className = 'meta';
  const isController = windowState.ownerId === session.selfId;
  hint.textContent = isController ? 'Press Space to jump. Others are watching.' : `Watching ${windowState.ownerName} play.`;

  wrap.append(canvas, hint);
  mainEl.appendChild(wrap);

  const ctx = canvas.getContext('2d');
  const initState = (windowState.content && windowState.content.dinoState) || {
    y: 120,
    vy: 0,
    obstacleX: canvas.width,
    score: 0,
  };

  const runtime = {
    isController,
    jumpRequested: false,
    lastSentAt: 0,
    state: {
      y: Number(initState.y) || 120,
      vy: Number(initState.vy) || 0,
      obstacleX: Number(initState.obstacleX) || canvas.width,
      score: Number(initState.score) || 0,
    },
    cleanup: null,
  };
  dinoRuntime.set(windowState.id, runtime);

  const loop = () => {
    if (!document.body.contains(canvas)) return;

    ctx.fillStyle = '#0c1820';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (runtime.isController) {
      if (runtime.jumpRequested && runtime.state.y >= 120) {
        runtime.state.vy = -9.5;
      }
      runtime.jumpRequested = false;

      runtime.state.vy += 0.55;
      runtime.state.y += runtime.state.vy;
      if (runtime.state.y > 120) {
        runtime.state.y = 120;
        runtime.state.vy = 0;
      }

      runtime.state.obstacleX -= 5;
      if (runtime.state.obstacleX < -20) {
        runtime.state.obstacleX = canvas.width + 40;
        runtime.state.score += 1;
      }

      if (runtime.state.obstacleX < 44 && runtime.state.obstacleX > 16 && runtime.state.y >= 108) {
        runtime.state.score = 0;
        runtime.state.obstacleX = canvas.width + 40;
      }

      if (Date.now() - runtime.lastSentAt > 80) {
        runtime.lastSentAt = Date.now();
        socket.emit('window_dino_state', {
          windowId: windowState.id,
          state: runtime.state,
        });
      }
    } else {
      const ws = windows.get(windowState.id);
      const remote = ws && ws.content ? ws.content.dinoState : null;
      if (remote) {
        runtime.state = {
          y: Number(remote.y) || 120,
          vy: Number(remote.vy) || 0,
          obstacleX: Number(remote.obstacleX) || canvas.width,
          score: Number(remote.score) || 0,
        };
      }
    }

    ctx.fillStyle = '#87d2ff';
    ctx.fillRect(20, runtime.state.y, 24, 24);
    ctx.fillStyle = '#f29d49';
    ctx.fillRect(runtime.state.obstacleX, 112, 18, 32);

    ctx.fillStyle = '#b2cadb';
    ctx.font = '14px monospace';
    ctx.fillText(`Score: ${Math.floor(runtime.state.score)}`, 10, 18);

    requestAnimationFrame(loop);
  };

  const onKeyDown = (event) => {
    if (!runtime.isController) return;
    if (event.code === 'Space') runtime.jumpRequested = true;
  };

  window.addEventListener('keydown', onKeyDown);
  runtime.cleanup = () => {
    window.removeEventListener('keydown', onKeyDown);
  };
  requestAnimationFrame(loop);
}

function buildUserscriptPreview(mainEl) {
  const preview = document.createElement('iframe');
  preview.className = 'userscript-preview';
  preview.sandbox = 'allow-scripts';
  preview.referrerPolicy = 'no-referrer';
  mainEl.appendChild(preview);
}

function buildChatPanel(windowState) {
  const panel = document.createElement('div');
  panel.className = 'chat-panel hidden';

  const tabs = document.createElement('div');
  tabs.className = 'chat-tabs';

  const collabTabBtn = document.createElement('button');
  collabTabBtn.type = 'button';
  collabTabBtn.textContent = 'Collaborators';

  const guestTabBtn = document.createElement('button');
  guestTabBtn.type = 'button';
  guestTabBtn.textContent = 'Guests';

  const log = document.createElement('div');
  log.className = 'chat-log';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Chat message';

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.textContent = 'Send';

  let activeTab = 'collaborators';

  function renderChat() {
    const state = windows.get(windowState.id);
    if (!state) return;

    log.innerHTML = '';
    const items = state.chatLog || [];
    for (const item of items) {
      if (item.tab !== activeTab) continue;
      const row = document.createElement('div');
      row.className = 'chat-item';
      row.textContent = `[${new Date(item.timestamp).toLocaleTimeString()}] ${item.username}: ${item.text}`;
      log.appendChild(row);
    }
  }

  collabTabBtn.addEventListener('click', () => {
    activeTab = 'collaborators';
    renderChat();
  });

  guestTabBtn.addEventListener('click', () => {
    activeTab = 'guests';
    renderChat();
  });

  sendBtn.addEventListener('click', () => {
    const message = input.value.trim();
    if (!message) return;

    socket.emit('window_chat_send', {
      windowId: windowState.id,
      tab: activeTab,
      message,
    }, (resp) => {
      if (!resp || !resp.ok) {
        alert(resp && resp.error ? resp.error : 'Failed to send message');
        return;
      }
      input.value = '';
    });
  });

  tabs.append(collabTabBtn, guestTabBtn);
  panel.append(tabs, log, input, sendBtn);
  panel.__renderChat = renderChat;
  mainChatRenderers.set(windowState.id, renderChat);
  renderChat();
  return panel;
}

function buildModLogPanel(windowState) {
  const panel = document.createElement('div');
  panel.className = 'modlog-panel hidden';

  const list = document.createElement('div');
  list.className = 'modlog-list';

  function renderLogs() {
    const state = windows.get(windowState.id);
    if (!state) return;

    list.innerHTML = '';
    for (const action of state.modLog || []) {
      const row = document.createElement('div');
      row.className = 'modlog-item';

      const text = document.createElement('span');
      text.textContent = `${new Date(action.timestamp).toLocaleTimeString()} - ${action.details}`;
      row.appendChild(text);

      if (isOwner(state) && action.revertable) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Revert';
        btn.addEventListener('click', () => {
          socket.emit('window_revert_mod_action', {
            windowId: state.id,
            actionId: action.id,
          });
        });
        row.appendChild(btn);
      }

      list.appendChild(row);
    }
  }

  panel.appendChild(list);
  panel.__renderLogs = renderLogs;
  renderLogs();
  return panel;
}

function buildAccessPanel(windowState, chatPanel, modLogPanel) {
  const panel = document.createElement('div');
  panel.className = 'access-panel';
  const pending = Boolean(
    windowState.permissions
    && Array.isArray(windowState.permissions.pendingRequests)
    && windowState.permissions.pendingRequests.includes(session.selfId)
  );
  const opensEditor = ['python', 'htmljs', 'userscript'].includes(windowState.type);

  const requestBtn = document.createElement('button');
  requestBtn.type = 'button';
  const isYouTubeWindow = windowState.type === 'youtube';
  requestBtn.textContent = canEdit(windowState)
    ? (opensEditor ? 'Edit Access Granted (Open Editor)' : (isYouTubeWindow ? 'Video Control Granted' : 'Access Granted'))
    : (pending ? 'Request Pending' : (isYouTubeWindow ? 'Request Video Control' : 'Request Edit'));
  requestBtn.disabled = pending;

  const chatBtn = document.createElement('button');
  chatBtn.type = 'button';
  chatBtn.textContent = 'Chat';

  const logBtn = document.createElement('button');
  logBtn.type = 'button';
  logBtn.textContent = 'History / Mod Log';
  logBtn.classList.toggle('hidden', !isOwner(windowState));

  requestBtn.addEventListener('click', () => {
    if (canEdit(windowState)) {
      const root = windowNodes.get(windowState.id);
      const editor = root ? root.querySelector('.code-area') : null;
      if (editor) editor.focus();
      else alert('Edit access is active for this window.');
      return;
    }

    socket.emit('window_request_edit', { windowId: windowState.id }, (resp) => {
      if (!resp || !resp.ok) {
        alert(resp && resp.error ? resp.error : 'Edit request failed');
        return;
      }
      requestBtn.textContent = 'Request Pending';
      requestBtn.disabled = true;
      alert('Edit request sent to owner.');
    });
  });

  chatBtn.addEventListener('click', () => {
    openMiniChatWindow(windowState);
  });

  logBtn.addEventListener('click', () => {
    const state = windows.get(windowState.id);
    const lines = (state && state.modLog ? state.modLog : []).map(
      (m) => `${new Date(m.timestamp).toLocaleTimeString()} - ${m.details}`
    );
    openMiniInfoWindow(windowState, `${windowState.title} - History`, lines.length ? lines : ['No history yet.']);
  });

  panel.append(requestBtn, chatBtn, logBtn);

  if (isOwner(windowState)) {
    const editorSelect = document.createElement('select');
    const muteSelect = document.createElement('select');
    const kickBtn = document.createElement('button');
    const muteBtn = document.createElement('button');

    kickBtn.type = 'button';
    kickBtn.textContent = 'Kick Editor';
    muteBtn.type = 'button';
    muteBtn.textContent = 'Mute User';

    for (const minutes of [5, 10, 60]) {
      const opt = document.createElement('option');
      opt.value = String(minutes);
      opt.textContent = `${minutes} mins`;
      muteSelect.appendChild(opt);
    }

    function refreshOptions() {
      const state = windows.get(windowState.id);
      editorSelect.innerHTML = '';
      if (!state) return;

      const everyone = state.permissions.editors.filter((id) => id !== state.ownerId);
      for (const userId of everyone) {
        const opt = document.createElement('option');
        opt.value = userId;
        opt.textContent = userNameById(userId);
        editorSelect.appendChild(opt);
      }
    }

    kickBtn.addEventListener('click', () => {
      const targetId = editorSelect.value;
      if (!targetId) return;
      socket.emit('window_kick_user', {
        windowId: windowState.id,
        targetId,
      });
    });

    muteBtn.addEventListener('click', () => {
      const targetId = editorSelect.value;
      if (!targetId) return;
      socket.emit('window_chat_mute', {
        windowId: windowState.id,
        targetId,
        durationMinutes: Number(muteSelect.value),
      });
    });

    panel.append(editorSelect, muteSelect, kickBtn, muteBtn);
    panel.__refreshOwnerOptions = refreshOptions;
    refreshOptions();
  }

  return panel;
}

function renderEngineControls(windowState, controlsEl, mainEl) {
  if (windowState.type === 'python') {
    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.textContent = 'Run';
    runBtn.disabled = !canEdit(windowState);
    runBtn.addEventListener('click', () => runPythonWindow(windowState));
    controlsEl.appendChild(runBtn);
    addSaveButton(windowState, controlsEl);
    buildCodeEditor(windowState, mainEl);
    return;
  }

  if (windowState.type === 'htmljs') {
    const runTabBtn = document.createElement('button');
    runTabBtn.type = 'button';
    runTabBtn.textContent = 'Run in New Tab';
    runTabBtn.disabled = !canEdit(windowState);

    const runWindowBtn = document.createElement('button');
    runWindowBtn.type = 'button';
    runWindowBtn.textContent = 'Run in Window';
    runWindowBtn.disabled = !canEdit(windowState);

    const getCode = () => {
      const root = windowNodes.get(windowState.id);
      const codeArea = root ? root.querySelector('.code-area') : null;
      return codeArea ? codeArea.value : windowState.content.code || '';
    };

    runTabBtn.addEventListener('click', () => {
      const code = getCode();
      openHtmlResultWindow(windowState.id, code);
      appendConsole(windowState.id, 'HTML/JS rendered in new browser tab.', true);
    });

    runWindowBtn.addEventListener('click', () => {
      const code = getCode();
      const spawnWorld = screenToWorld(260, 170);
      socket.emit('window_spawn_html_result', {
        sourceWindowId: windowState.id,
        code,
        x: spawnWorld.x,
        y: spawnWorld.y,
        width: 520,
        height: 360,
      }, (resp) => {
        if (!resp || !resp.ok) {
          alert(resp && resp.error ? resp.error : 'Failed to spawn result window');
          return;
        }
        appendConsole(windowState.id, 'HTML/JS rendered in synced workspace window.', true);
      });
    });
    controlsEl.append(runTabBtn, runWindowBtn);
    addSaveButton(windowState, controlsEl);
    buildCodeEditor(windowState, mainEl);
    return;
  }

  if (windowState.type === 'userscript') {
    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.textContent = 'Run';
    runBtn.disabled = !canEdit(windowState);

    const forceRunBtn = document.createElement('button');
    forceRunBtn.type = 'button';
    forceRunBtn.textContent = 'Force Run';
    forceRunBtn.disabled = !canEdit(windowState);

    const helpBtn = document.createElement('button');
    helpBtn.type = 'button';
    helpBtn.textContent = 'How to make a userscript work for this window';

    runBtn.addEventListener('click', () => runUserscript(windowState, false));
    forceRunBtn.addEventListener('click', () => runUserscript(windowState, true));

    controlsEl.append(runBtn, forceRunBtn, helpBtn);
    addSaveButton(windowState, controlsEl);
    buildCodeEditor(windowState, mainEl);

    const helperPanel = document.createElement('div');
    helperPanel.className = 'userscript-help-panel hidden';

    const helperText = document.createElement('div');
    helperText.className = 'meta';
    helperText.textContent = 'Use these quick-copy buttons to get a known script and an AI prompt that rewrites any userscript for this PixelCode Hub userscript runner.';

    const helperActions = document.createElement('div');
    helperActions.className = 'button-row';

    const copyScriptBtn = document.createElement('button');
    copyScriptBtn.type = 'button';
    copyScriptBtn.textContent = 'Copy Draw-on-Page script';
    copyScriptBtn.addEventListener('click', () => {
      copyTextWithFeedback(copyScriptBtn, DRAW_ON_PAGE_USERSCRIPT);
    });

    const copyPromptBtn = document.createElement('button');
    copyPromptBtn.type = 'button';
    copyPromptBtn.textContent = 'Copy AI adapter prompt';
    copyPromptBtn.addEventListener('click', () => {
      copyTextWithFeedback(copyPromptBtn, USERSCRIPT_AI_PROMPT);
    });

    helperActions.append(copyScriptBtn, copyPromptBtn);
    helperPanel.append(helperText, helperActions);
    mainEl.appendChild(helperPanel);

    helpBtn.addEventListener('click', () => {
      helperPanel.classList.toggle('hidden');
    });

    buildUserscriptPreview(mainEl);
    return;
  }

  if (windowState.type === 'youtube') {
    buildYouTubeMain(windowState, mainEl);
    return;
  }

  if (windowState.type === 'drawing') {
    buildDrawingMain(windowState, mainEl);
    return;
  }

  if (windowState.type === 'dino') {
    buildDinoMain(windowState, mainEl);
    return;
  }

  if (windowState.type === 'html-result') {
    const iframe = document.createElement('iframe');
    iframe.className = 'html-result-frame';
    iframe.sandbox = 'allow-scripts';
    iframe.referrerPolicy = 'no-referrer';
    iframe.srcdoc = windowState.content && typeof windowState.content.htmlResult === 'string'
      ? windowState.content.htmlResult
      : '<!doctype html><html><body></body></html>';
    mainEl.appendChild(iframe);
    return;
  }
}

function renderWindow(windowId, windowState) {
  let root = windowNodes.get(windowId);
  if (!root) root = createWindowNode(windowState);

  applyWindowBaseStyles(root, windowState);

  const header = root.querySelector('.window-header');
  const titleEl = root.querySelector('.window-title');
  const ownerEl = root.querySelector('.window-owner');
  const closeBtn = root.querySelector('.window-close-btn');
  const controlsEl = root.querySelector('.window-controls');
  const mainEl = root.querySelector('.window-main');

  titleEl.textContent = `${windowState.title} (${windowState.id})`;
  ownerEl.textContent = `Owner: ${windowState.ownerName}`;
  if (closeBtn) closeBtn.classList.toggle('hidden', !isOwner(windowState));

  controlsEl.innerHTML = '';
  mainEl.innerHTML = '';

  renderEngineControls(windowState, controlsEl, mainEl);
  attachWindowPointer(windowState, root);

  const chatPanel = buildChatPanel(windowState);
  const modLogPanel = buildModLogPanel(windowState);
  const accessPanel = buildAccessPanel(windowState, chatPanel, modLogPanel);
  mainEl.append(accessPanel, chatPanel, modLogPanel);

  if (accessPanel.__refreshOwnerOptions) accessPanel.__refreshOwnerOptions();
  if (chatPanel.__renderChat) chatPanel.__renderChat();
  if (modLogPanel.__renderLogs) modLogPanel.__renderLogs();

  header.addEventListener('dblclick', () => {
    if (!isOwner(windowState) && !canEdit(windowState)) {
      alert('You only have view access. Use Request Edit.');
    }
  });
}

function setupSocketHandlers() {
  socket.on('lobby_snapshot', ({ selfId, users, windows: windowList, chairs, savedProjects }) => {
    session.selfId = selfId;
    session.savedProjects = savedProjects || [];
    updateSavedProjectsUI();

    clearAllAvatars();
    lobbyUsers.clear();
    for (const user of users) {
      lobbyUsers.set(user.id, user);
      upsertAvatar(user);
    }

    for (const node of windowNodes.values()) node.remove();
    windowNodes.clear();
    windows.clear();
    for (const holder of youtubePlayers.values()) {
      if (holder && holder.player && typeof holder.player.destroy === 'function') {
        holder.player.destroy();
      }
    }
    youtubePlayers.clear();
    pendingYouTubeControl.clear();
    youtubeRecoveryAt.clear();
    youtubeRecoveryCount.clear();
    youtubeEmbedLastApplied.clear();
    drawingContexts.clear();
    mainChatRenderers.clear();
    miniChatRenderers.clear();
    pendingEditRequests.clear();
    renderRequestNotifications();
    chairStateMap.clear();
    for (const chair of chairs || []) {
      if (chair && chair.active) chairStateMap.set(chair.ownerId, chair);
    }
    rerenderChairsForCamera();
    updateChairInteractPrompt();

    for (const win of windowList || []) setWindowState(win);
    renderAllWindows();
  });

  socket.on('global_event', ({ text }) => {
    addGlobalLog(text);
  });

  socket.on('user_joined', (user) => {
    lobbyUsers.set(user.id, user);
    upsertAvatar(user);
    addGlobalLog(`${user.username} joined ${session.lobbyId || 'lobby'}.`);
  });

  socket.on('chairs_updated', ({ chairs }) => {
    chairStateMap.clear();
    for (const chair of chairs || []) {
      if (chair && chair.active) chairStateMap.set(chair.ownerId, chair);
    }
    rerenderChairsForCamera();
    updateChairInteractPrompt();
  });

  socket.on('cursor_update', (user) => {
    const existing = lobbyUsers.get(user.id) || {};
    const merged = { ...existing, ...user };
    lobbyUsers.set(user.id, merged);
    if (merged.id === session.selfId) {
      const incomingX = Number(merged.x);
      const incomingY = Number(merged.y);
      const safeIncomingX = Number.isFinite(incomingX) ? incomingX : pointerState.worldX;
      const safeIncomingY = Number.isFinite(incomingY) ? incomingY : pointerState.worldY;
      const dx = safeIncomingX - pointerState.worldX;
      const dy = safeIncomingY - pointerState.worldY;
      const delta = Math.hypot(dx, dy);
      const authoritativeSync = merged.state === 'bump'
        || merged.state === 'sitting'
        || merged.state === 'jumping'
        || Boolean(merged.onHeadOf)
        || delta > 26;

      if (authoritativeSync) {
        pointerState.worldX = safeIncomingX;
        pointerState.worldY = safeIncomingY;
      }
      pointerState.state = merged.state || pointerState.state;
      pointerState.facing = merged.facing === 'left' ? 'left' : 'right';
      pointerState.gesture = merged.gesture === 'point-left' || merged.gesture === 'point-right' || merged.gesture === 'point-up'
        ? merged.gesture
        : 'none';
      merged.x = pointerState.worldX;
      merged.y = pointerState.worldY;
      if (merged.onHeadOf) {
        avatarControl.floorY = pointerState.worldY;
        avatarControl.vy = 0;
      }
      if (merged.sittingOnChair) {
        pointerState.state = 'sitting';
        avatarControl.left = false;
        avatarControl.right = false;
        avatarControl.vy = 0;
      }
      if (merged.state === 'bump') {
        avatarControl.vy = 0;
        avatarControl.floorY = Math.max(avatarControl.floorY, pointerState.worldY);
      }
    }
    upsertAvatar(merged);
    updateChairInteractPrompt();

    const speechUntil = Number(merged.speechUntil) || 0;
    if (speechUntil > Date.now()) {
      const userId = merged.id;
      setTimeout(() => {
        const current = lobbyUsers.get(userId);
        if (!current) return;
        if ((Number(current.speechUntil) || 0) > Date.now()) return;
        if (!current.speechText) return;
        current.speechText = '';
        current.speechUntil = 0;
        upsertAvatar(current);
      }, Math.max(50, speechUntil - Date.now() + 30));
    }
  });

  socket.on('user_left', ({ id }) => {
    const user = lobbyUsers.get(id);
    if (user) {
      addGlobalLog(`${user.username} left ${session.lobbyId || 'lobby'}.`);
    }
    lobbyUsers.delete(id);
    removeAvatar(id);
    chairStateMap.delete(id);
    rerenderChairsForCamera();
    removeRequesterRequests(id);
    renderRequestNotifications();
    updateChairInteractPrompt();
  });

  socket.on('window_created', ({ window }) => {
    setWindowState(window);
    renderWindow(window.id, window);
  });

  socket.on('window_updated', ({ window }) => {
    const existingNode = windowNodes.get(window.id);
    const current = windows.get(window.id);
    const ignoreGeometry = Boolean(
      current
      && current.ownerId === session.selfId
      && isWindowInteractionActive(window.id)
    );

    const nextWindow = ignoreGeometry && current
      ? {
          ...window,
          x: current.x,
          y: current.y,
          width: current.width,
          height: current.height,
        }
      : window;

    setWindowState(nextWindow);
    if (existingNode) applyWindowBaseStyles(existingNode, nextWindow);
    else renderWindow(window.id, nextWindow);
  });

  socket.on('window_removed', ({ windowId }) => {
    removeWindow(windowId);
  });

  socket.on('window_pointer_update', (payload) => {
    if (payload.userId === session.selfId) return;
    const windowRoot = windowNodes.get(payload.windowId);
    if (!windowRoot) return;
    const node = getOrCreateWindowPointer(
      payload.windowId,
      windowRoot,
      payload.userId,
      payload.username
    );
    setWindowPointer(node, payload.relX, payload.relY, payload.visible);
  });

  socket.on('window_permissions_updated', ({ windowId, permissions }) => {
    const state = windows.get(windowId);
    if (!state) return;
    state.permissions = permissions;
    renderWindow(windowId, state);

    if (isOwner(state)) {
      const pending = new Set(
        Array.isArray(permissions && permissions.pendingRequests) ? permissions.pendingRequests : []
      );
      for (const [key, req] of pendingEditRequests.entries()) {
        if (req.windowId === windowId && !pending.has(req.requesterId)) {
          pendingEditRequests.delete(key);
        }
      }
      renderRequestNotifications();
    }
  });

  socket.on('window_content_updated', ({ windowId, content, modLog, snapshots }) => {
    const state = windows.get(windowId);
    if (!state) return;

    state.content = content;
    state.modLog = modLog || state.modLog;
    state.snapshots = snapshots || state.snapshots;

    if (CODE_WINDOW_TYPES.has(state.type)) {
      const root = windowNodes.get(windowId);
      const codeArea = root ? root.querySelector('.code-area') : null;
      const incomingCode = typeof content.code === 'string' ? content.code : '';
      if (codeArea && document.activeElement !== codeArea && codeArea.value !== incomingCode) {
        codeArea.value = incomingCode;
      }
      return;
    }

    if (state.type === 'youtube') {
      const root = windowNodes.get(windowId);
      if (root) {
        const urlInput = root.querySelector('.youtube-view input[type="text"]');
        if (urlInput && document.activeElement !== urlInput) {
          urlInput.value = content.youtubeInputUrl || '';
        }
      }
      return;
    }

    renderWindow(windowId, state);
  });

  socket.on('window_drawing_stroke_sync', ({ windowId, stroke }) => {
    const state = windows.get(windowId);
    if (!state) return;

    if (!Array.isArray(state.content.drawingStrokes)) state.content.drawingStrokes = [];
    state.content.drawingStrokes.push(stroke);

    const ctxState = drawingContexts.get(windowId);
    if (ctxState && ctxState.ctx) drawStrokeOnCanvas(ctxState.ctx, stroke);
  });

  socket.on('window_youtube_control_sync', (payload) => {
    const state = windows.get(payload.windowId);
    if (state) {
      state.content.youtubeVideoId = payload.videoId || state.content.youtubeVideoId;
      state.content.youtubePlaylistId = payload.playlistId || state.content.youtubePlaylistId || '';
      state.content.youtubeState = payload.state;
      state.content.youtubeCurrentTime = payload.time;
    }
    applyYouTubeControl(payload);
  });

  socket.on('window_dino_state_sync', ({ windowId, state }) => {
    const ws = windows.get(windowId);
    if (!ws || ws.type !== 'dino') return;
    ws.content = ws.content || {};
    ws.content.dinoState = state;
  });

  socket.on('window_chat_message', (message) => {
    const state = windows.get(message.windowId);
    if (!state) return;

    state.chatLog = state.chatLog || [];
    state.chatLog.push(message);
    renderChatViews(message.windowId);
  });

  socket.on('window_console_output_sync', ({ windowId, line }) => {
    if (!windowId || typeof line !== 'string') return;
    appendConsole(windowId, line, false);
  });

  socket.on('window_edit_request', (request) => {
    const state = windows.get(request.windowId);
    if (!state || state.ownerId !== session.selfId) return;
    addGlobalLog(`${request.requesterName} requested edit access for ${request.windowTitle}.`);
    pendingEditRequests.set(requestKey(request.windowId, request.requesterId), request);
    renderRequestNotifications();
  });

  socket.on('window_request_resolved', ({ windowId, accepted }) => {
    const state = windows.get(windowId);
    if (state && state.permissions) {
      const pending = Array.isArray(state.permissions.pendingRequests) ? state.permissions.pendingRequests : [];
      state.permissions.pendingRequests = pending.filter((id) => id !== session.selfId);
      if (accepted) {
        const editors = Array.isArray(state.permissions.editors) ? state.permissions.editors : [];
        if (!editors.includes(session.selfId)) editors.push(session.selfId);
        state.permissions.editors = editors;
      }
      renderWindow(windowId, state);
    }
    alert(accepted ? `Edit access granted for ${windowId}.` : `Edit access request denied for ${windowId}.`);
  });

  socket.on('window_access_revoked', ({ windowId }) => {
    alert(`Your edit access was removed for ${windowId}.`);
  });

  socket.on('window_user_muted', ({ windowId, mutedUntil }) => {
    alert(`You are muted in ${windowId} until ${new Date(mutedUntil).toLocaleTimeString()}.`);
  });

  socket.on('window_snapshot_created', ({ windowId, snapshot }) => {
    const state = windows.get(windowId);
    if (!state) return;
    state.snapshots = state.snapshots || [];
    state.snapshots.push(snapshot);
  });
}

function updatePointerFromEvent(event) {
  if (avatarControl.enabled) return;
  const rect = workspaceEl.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
  const world = screenToWorld(x, y);

  pointerState.screenX = Math.round(x);
  pointerState.screenY = Math.round(y);
  pointerState.worldX = Math.round(world.x);
  pointerState.worldY = Math.round(world.y);

  updateLocalAvatarFromPointer();
  updateChairInteractPrompt();
}

workspaceEl.addEventListener('mousedown', (event) => {
  if (event.button === 2) {
    event.preventDefault();
    isPanning = true;
    panStart = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
  }
});

window.addEventListener('mouseup', (event) => {
  if (event.button === 2) {
    isPanning = false;
    panStart = null;
  }
});

workspaceEl.addEventListener('mousemove', (event) => {
  if (!session.lobbyId) return;

  if (isPanning && panStart) {
    const dx = event.clientX - panStart.clientX;
    const dy = event.clientY - panStart.clientY;
    panStart.clientX = event.clientX;
    panStart.clientY = event.clientY;

    // Drag world in drag direction by moving camera opposite.
    updateCameraBy(-dx, -dy);
  }

  updatePointerFromEvent(event);

  lastMoveAt = Date.now();
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    setWalkingThenIdle();
  });
});

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName ? target.tagName.toLowerCase() : '';
  return tag === 'input' || tag === 'textarea' || Boolean(target.isContentEditable);
}

window.addEventListener('keydown', (event) => {
  const typing = isTypingTarget(event.target);
  const me = lobbyUsers.get(session.selfId);
  const sitting = Boolean(me && me.sittingOnChair);

  if (event.code === 'Space' && !typing) {
    event.preventDefault();
  }

  if (!typing && event.code === 'KeyI') {
    event.preventDefault();
    toggleAvatarControlMode();
    return;
  }

  if (!typing && (event.code === 'Slash' || event.key === '/')) {
    event.preventDefault();
    startQuickSayFlow();
    return;
  }

  if (!avatarControl.enabled) return;
  if (typing) return;

  if (event.code === 'KeyE') {
    gestureKeys.e = true;
    if (gestureKeys.q) {
      event.preventDefault();
      applyGestureFromKeys();
      updateLocalAvatarFromPointer();
      sendCursorUpdate(pointerState.state);
      return;
    }
    if (isNearOwnChair()) {
      event.preventDefault();
      gestureKeys.e = false;
      pointerState.gesture = 'none';
      updateLocalAvatarFromPointer();
      sendCursorUpdate(pointerState.state);
      socket.emit('chair_interact', {
        mode: avatarControl.enabled ? 'avatar' : 'cursor',
        state: pointerState.state,
      }, (resp) => {
        if (!resp || !resp.ok) {
          addGlobalLog(resp && resp.error ? resp.error : 'Could not interact with chair.');
        }
      });
    } else {
      event.preventDefault();
      applyGestureFromKeys();
      updateLocalAvatarFromPointer();
      sendCursorUpdate(pointerState.state);
    }
    return;
  }

  if (event.code === 'KeyQ') {
    gestureKeys.q = true;
    event.preventDefault();
    applyGestureFromKeys();
    updateLocalAvatarFromPointer();
    sendCursorUpdate(pointerState.state);
    return;
  }

  if (sitting) return;

  if (event.code === 'KeyA') {
    event.preventDefault();
    avatarControl.left = true;
  } else if (event.code === 'KeyD') {
    event.preventDefault();
    avatarControl.right = true;
  } else if (event.code === 'KeyW') {
    event.preventDefault();
    triggerAvatarJump();
  } else if (event.code === 'KeyS') {
    event.preventDefault();
    triggerAvatarDropFloor();
  }
});

window.addEventListener('keyup', (event) => {
  if (!avatarControl.enabled) return;
  const me = lobbyUsers.get(session.selfId);
  if (me && me.sittingOnChair) return;
  if (event.code === 'KeyQ') {
    gestureKeys.q = false;
    applyGestureFromKeys();
    updateLocalAvatarFromPointer();
    sendCursorUpdate(pointerState.state);
  } else if (event.code === 'KeyE') {
    gestureKeys.e = false;
    applyGestureFromKeys();
    updateLocalAvatarFromPointer();
    sendCursorUpdate(pointerState.state);
  }
  if (event.code === 'KeyA') {
    avatarControl.left = false;
  } else if (event.code === 'KeyD') {
    avatarControl.right = false;
  }
});

setupAuthAndLobbyControls();
setupSocketHandlers();
updateSavedProjectsUI();
renderRequestNotifications();
updateGridOffset();
ensureChairLayer();
ensureChairPrompt();
addGlobalLog('Client ready. Press Ctrl+Shift+T to toggle debug panel.');
addGlobalLog('Right-click + drag to pan.');

if (!shouldUserscriptRun('// no headers', 'https://pixelcode-hub.local/target')) {
  addGlobalLog('Userscript self-check failed for missing @match tags.');
} else {
  addGlobalLog('Userscript self-check passed for missing @match tags.');
}
