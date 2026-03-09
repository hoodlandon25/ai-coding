const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const corsOriginEnv = String(process.env.CORS_ORIGIN || '*').trim();
const corsOrigin = corsOriginEnv === '*'
  ? '*'
  : corsOriginEnv.split(',').map((item) => item.trim()).filter(Boolean);
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;
const VALID_LOBBIES = ['lobby-1', 'lobby-2'];
const WINDOW_TYPES = ['python', 'htmljs', 'userscript', 'drawing', 'dino', 'youtube', 'html-result'];
const PROJECT_TYPES = new Set(['python', 'htmljs', 'userscript']);

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'db.json');

const lobbies = new Map(
  VALID_LOBBIES.map((lobbyId) => [lobbyId, createLobbyState()])
);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

let dbCache = {
  users: {},
  projects: {},
};
let dbSaveScheduled = false;

function ensureDbLoaded() {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(dbCache, null, 2), 'utf8');
      return;
    }

    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    dbCache = {
      users: parsed && parsed.users ? parsed.users : {},
      projects: parsed && parsed.projects ? parsed.projects : {},
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load DB file, continuing with empty cache', err);
  }
}

function scheduleDbSave() {
  if (dbSaveScheduled) return;
  dbSaveScheduled = true;

  setTimeout(() => {
    dbSaveScheduled = false;
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(dbCache, null, 2), 'utf8');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to save DB file', err);
    }
  }, 20);
}

function createLobbyState() {
  return {
    users: new Map(),
    windows: new Map(),
    chairs: new Map(),
    bots: new Map(),
    nextWindowSeq: 1,
  };
}

function sanitizeUsername(input, fallback) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, 24);
}

function randomGuestName() {
  return `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
}

function titleForWindowType(type) {
  switch (type) {
    case 'python':
      return 'Python Project';
    case 'htmljs':
      return 'HTML/JS Project';
    case 'userscript':
      return 'Userscript Project';
    case 'drawing':
      return 'Drawing App';
    case 'dino':
      return 'Dino Game';
    case 'youtube':
      return 'YouTube Sync';
    case 'html-result':
      return 'HTML Result';
    default:
      return 'Window';
  }
}

function parseYouTubeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (err) {
    try {
      parsed = new URL(`https://${raw}`);
    } catch (err2) {
      return null;
    }
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  let videoId = '';
  let playlistId = '';

  if (host === 'youtu.be') {
    videoId = parsed.pathname.replace(/^\/+/, '').split('/')[0] || '';
    playlistId = parsed.searchParams.get('list') || '';
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (parsed.pathname === '/watch') {
      videoId = parsed.searchParams.get('v') || '';
      playlistId = parsed.searchParams.get('list') || '';
    } else if (parsed.pathname === '/playlist') {
      playlistId = parsed.searchParams.get('list') || '';
    } else if (parsed.pathname.startsWith('/shorts/')) {
      videoId = parsed.pathname.split('/')[2] || '';
    }
  }

  if (!videoId && !playlistId) return null;
  return { videoId, playlistId };
}

function createWindowContent(type) {
  if (type === 'python') {
    return {
      code: '# Python Project\nprint("Hello PixelCode Hub")',
      console: '',
    };
  }

  if (type === 'htmljs') {
    return {
      code: '<!doctype html>\n<html><body><h2>Hello PixelCode Hub</h2><script>console.log("Hello from iframe")<\/script></body></html>',
      console: '',
    };
  }

  if (type === 'userscript') {
    return {
      code: '// ==UserScript==\n// @name Example Script\n// @match https://pixelcode-hub.local/*\n// ==/UserScript==\n\nconst p = document.createElement("p");\np.textContent = "Userscript executed";\np.style.color = "#22bb66";\ndocument.body.appendChild(p);',
      console: '',
      targetHtml: '<div id="target-root"><h3>Target DOM</h3><p>Userscript runs here.</p></div>',
    };
  }

  if (type === 'youtube') {
    return {
      youtubeInputUrl: '',
      youtubeVideoId: '',
      youtubePlaylistId: '',
      youtubeVideoTitle: '',
      youtubeState: 'paused',
      youtubeCurrentTime: 0,
    };
  }

  if (type === 'drawing') {
    return {
      drawingStrokes: [],
    };
  }

  if (type === 'dino') {
    return {
      dinoState: {
        y: 120,
        vy: 0,
        obstacleX: 420,
        score: 0,
      },
    };
  }

  if (type === 'html-result') {
    return {
      htmlResult: '<!doctype html><html><body><h3>Result Window</h3></body></html>',
      sourceWindowId: '',
    };
  }

  return {
    note: `${titleForWindowType(type)} ready`,
  };
}

function createWindowState({ lobbyState, ownerId, ownerName, type, x, y, width, height, content }) {
  const windowId = `win-${Date.now()}-${lobbyState.nextWindowSeq}`;
  lobbyState.nextWindowSeq += 1;

  const baseX = Number.isFinite(x) ? x : 80 + (lobbyState.nextWindowSeq % 5) * 32;
  const baseY = Number.isFinite(y) ? y : 70 + (lobbyState.nextWindowSeq % 5) * 24;

  return {
    id: windowId,
    type,
    title: titleForWindowType(type),
    ownerId,
    ownerName,
    x: Math.round(baseX),
    y: Math.round(baseY),
    width: Math.max(300, Math.round(Number(width) || 520)),
    height: Math.max(220, Math.round(Number(height) || 360)),
    zIndex: 10 + lobbyState.windows.size,
    content: content || createWindowContent(type),
    permissions: {
      editors: new Set([ownerId]),
      pendingRequests: new Set(),
      mutedUsers: new Map(),
    },
    chatLog: [],
    modLog: [],
    snapshots: [],
    updatedAt: Date.now(),
  };
}

function serializeWindow(windowState) {
  return {
    id: windowState.id,
    type: windowState.type,
    title: windowState.title,
    ownerId: windowState.ownerId,
    ownerName: windowState.ownerName,
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    zIndex: windowState.zIndex,
    content: windowState.content,
    permissions: {
      editors: Array.from(windowState.permissions.editors),
      pendingRequests: Array.from(windowState.permissions.pendingRequests),
      mutedUsers: Array.from(windowState.permissions.mutedUsers.entries()).map(([userId, mutedUntil]) => ({
        userId,
        mutedUntil,
      })),
    },
    chatLog: windowState.chatLog,
    modLog: windowState.modLog,
    snapshots: windowState.snapshots,
    updatedAt: windowState.updatedAt || 0,
  };
}

function pushModLog(windowState, entry) {
  const action = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    timestamp: Date.now(),
    ...entry,
  };
  windowState.modLog.push(action);
  if (windowState.modLog.length > 160) {
    windowState.modLog.shift();
  }
  return action;
}

function snapshotCode(windowState, reason, actorId) {
  const code = typeof windowState.content.code === 'string' ? windowState.content.code : '';
  const snapshot = {
    id: `snap-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    createdAt: Date.now(),
    reason,
    actorId,
    code,
  };
  windowState.snapshots.push(snapshot);
  if (windowState.snapshots.length > 50) {
    windowState.snapshots.shift();
  }
  return snapshot;
}

function canEditWindow(windowState, userId) {
  return windowState.ownerId === userId || windowState.permissions.editors.has(userId);
}

function getLobbyFromSocket(socket) {
  const lobbyId = socket.data.lobbyId;
  if (!lobbyId || !lobbies.has(lobbyId)) {
    return null;
  }

  return {
    lobbyId,
    lobbyState: lobbies.get(lobbyId),
  };
}

function broadcastWindowState(lobbyId, windowState, eventName = 'window_updated') {
  io.to(lobbyId).emit(eventName, {
    window: serializeWindow(windowState),
  });
}

function serializeChairs(lobbyState) {
  return Array.from(lobbyState.chairs.values()).map((chair) => ({
    ownerId: chair.ownerId,
    ownerName: chair.ownerName,
    x: chair.x,
    y: chair.y,
    active: chair.active,
  }));
}

function broadcastChairs(lobbyId, lobbyState) {
  io.to(lobbyId).emit('chairs_updated', {
    chairs: serializeChairs(lobbyState),
  });
}

function getProjectsForUser(username) {
  if (!username) return [];
  return dbCache.projects[username] || [];
}

function saveProjectForUser(username, project) {
  if (!dbCache.projects[username]) {
    dbCache.projects[username] = [];
  }

  const projects = dbCache.projects[username];
  const existing = projects.find((p) => p.name === project.name);

  if (existing) {
    existing.type = project.type;
    existing.code = project.code;
    existing.updatedAt = Date.now();
  } else {
    projects.push({
      name: project.name,
      type: project.type,
      code: project.code,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  scheduleDbSave();
}

async function searchYouTubeFeed(query) {
  const safeQ = String(query || '').trim();
  if (!safeQ) return [];

  const url = `https://www.youtube.com/feeds/videos.xml?search_query=${encodeURIComponent(safeQ)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`YouTube feed request failed: ${response.status}`);

  const xml = await response.text();
  const results = [];
  const entryPattern = /<entry>([\s\S]*?)<\/entry>/g;
  let entryMatch;
  while ((entryMatch = entryPattern.exec(xml)) && results.length < 8) {
    const chunk = entryMatch[1];
    const idMatch = chunk.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    const titleMatch = chunk.match(/<title>([^<]+)<\/title>/);
    if (!idMatch) continue;

    results.push({
      videoId: idMatch[1],
      title: titleMatch ? titleMatch[1] : idMatch[1],
    });
  }

  return results;
}

function clearBot(lobbyId, botId) {
  if (!lobbies.has(lobbyId)) return;
  const lobbyState = lobbies.get(lobbyId);
  const botState = lobbyState.bots.get(botId);
  if (!botState) return;

  if (botState.intervalId) {
    clearInterval(botState.intervalId);
  }

  lobbyState.bots.delete(botId);
  lobbyState.users.delete(botId);

  io.to(lobbyId).emit('user_left', { id: botId });
  io.to(lobbyId).emit('global_event', {
    level: 'info',
    text: `Debug Bot ${botState.username} disconnected`,
    timestamp: Date.now(),
  });
}

function simulateBotFlow(lobbyId, ownerSocketId) {
  if (!lobbies.has(lobbyId)) return;
  const lobbyState = lobbies.get(lobbyId);
  const owner = lobbyState.users.get(ownerSocketId);
  if (!owner) return;

  const botId = `bot-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const botUser = {
    id: botId,
    username: `TestBot-${Math.floor(Math.random() * 100)}`,
    isGuest: true,
    x: 120,
    y: 120,
    state: 'idle',
    gesture: 'none',
    facing: 'right',
    mode: 'cursor',
    bumpUntil: 0,
    bumpDir: 'right',
    typingActive: false,
    typingPhase: 0,
    speechText: '',
    speechUntil: 0,
    onHeadOf: null,
    sittingOnChair: false,
    updatedAt: Date.now(),
    isBot: true,
  };

  lobbyState.users.set(botId, botUser);
  io.to(lobbyId).emit('user_joined', botUser);
  io.to(lobbyId).emit('global_event', {
    level: 'info',
    text: `${botUser.username} joined for simulation`,
    timestamp: Date.now(),
  });

  const square = [
    { x: 120, y: 120 },
    { x: 280, y: 120 },
    { x: 280, y: 280 },
    { x: 120, y: 280 },
  ];

  let step = 0;
  const intervalId = setInterval(() => {
    const target = square[step % square.length];
    botUser.x = target.x;
    botUser.y = target.y;
    botUser.state = 'walking';
    botUser.updatedAt = Date.now();

    io.to(lobbyId).emit('cursor_update', {
      id: botId,
      x: botUser.x,
      y: botUser.y,
      state: 'walking',
      gesture: botUser.gesture,
      facing: botUser.facing,
      mode: botUser.mode,
      bumpUntil: botUser.bumpUntil,
      bumpDir: botUser.bumpDir,
      onHeadOf: botUser.onHeadOf,
      sittingOnChair: botUser.sittingOnChair,
      updatedAt: botUser.updatedAt,
    });

    setTimeout(() => {
      botUser.state = 'idle';
      botUser.updatedAt = Date.now();
      io.to(lobbyId).emit('cursor_update', {
        id: botId,
        x: botUser.x,
        y: botUser.y,
        state: 'idle',
        gesture: botUser.gesture,
        facing: botUser.facing,
        mode: botUser.mode,
        bumpUntil: botUser.bumpUntil,
        bumpDir: botUser.bumpDir,
        onHeadOf: botUser.onHeadOf,
        sittingOnChair: botUser.sittingOnChair,
        updatedAt: botUser.updatedAt,
      });
    }, 360);

    step += 1;
    if (step >= 8) {
      clearInterval(intervalId);

      const targetWindow = Array.from(lobbyState.windows.values()).find((w) => PROJECT_TYPES.has(w.type) && w.ownerId === ownerSocketId);
      if (targetWindow) {
        targetWindow.permissions.pendingRequests.add(botId);
        io.to(ownerSocketId).emit('window_edit_request', {
          windowId: targetWindow.id,
          windowTitle: targetWindow.title,
          requesterId: botId,
          requesterName: botUser.username,
          requesterIsGuest: true,
          requestedAt: Date.now(),
        });
      }

      setTimeout(() => clearBot(lobbyId, botId), 20000);
    }
  }, 520);

  lobbyState.bots.set(botId, { username: botUser.username, intervalId });
}

function removeUserFromLobbyState(lobbyId, userId) {
  if (!lobbies.has(lobbyId)) return;
  const lobbyState = lobbies.get(lobbyId);

  lobbyState.users.delete(userId);
  if (lobbyState.chairs.has(userId)) {
    lobbyState.chairs.delete(userId);
    broadcastChairs(lobbyId, lobbyState);
  }

  for (const other of lobbyState.users.values()) {
    if (!other) continue;
    if (other.onHeadOf !== userId) continue;
    other.onHeadOf = null;
    if (other.sittingOnChair) {
      other.sittingOnChair = false;
      other.state = 'idle';
    }
    other.updatedAt = Date.now();
    io.to(lobbyId).emit('cursor_update', {
      id: other.id,
      x: other.x,
      y: other.y,
      state: other.state,
      gesture: other.gesture,
      facing: other.facing,
      mode: other.mode,
      bumpUntil: other.bumpUntil,
      bumpDir: other.bumpDir,
      onHeadOf: other.onHeadOf,
      typingActive: other.typingActive,
      typingPhase: other.typingPhase,
      speechText: other.speechText,
      speechUntil: other.speechUntil,
      sittingOnChair: other.sittingOnChair,
      updatedAt: other.updatedAt,
    });
  }

  for (const [windowId, windowState] of lobbyState.windows.entries()) {
    if (windowState.ownerId === userId) {
      lobbyState.windows.delete(windowId);
      io.to(lobbyId).emit('window_removed', {
        windowId,
        reason: 'owner_left',
      });
      continue;
    }

    const editorRemoved = windowState.permissions.editors.delete(userId);
    const pendingRemoved = windowState.permissions.pendingRequests.delete(userId);
    const muteRemoved = windowState.permissions.mutedUsers.delete(userId);
    const changed = editorRemoved || pendingRemoved || muteRemoved;

    if (changed) {
      io.to(lobbyId).emit('window_permissions_updated', {
        windowId,
        permissions: serializeWindow(windowState).permissions,
      });
    }
  }
}

function leaveLobby(socket) {
  const currentLobby = socket.data.lobbyId;
  if (!currentLobby || !lobbies.has(currentLobby)) {
    return;
  }

  removeUserFromLobbyState(currentLobby, socket.id);

  socket.leave(currentLobby);

  io.to(currentLobby).emit('user_left', {
    id: socket.id,
  });

  io.to(currentLobby).emit('global_event', {
    level: 'info',
    text: `${socket.data.username || 'User'} left ${currentLobby}`,
    timestamp: Date.now(),
  });

  socket.data.lobbyId = null;
}

ensureDbLoaded();

io.on('connection', (socket) => {
  socket.data.lobbyId = null;
  socket.data.username = null;
  socket.data.isGuest = true;

  socket.on('join_lobby', (payload = {}, ack) => {
    const lobbyId = payload.lobbyId;
    if (!VALID_LOBBIES.includes(lobbyId)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Invalid lobby id.' });
      return;
    }

    leaveLobby(socket);

    const isGuest = Boolean(payload.isGuest);
    const username = sanitizeUsername(payload.username, isGuest ? randomGuestName() : 'Member');

    if (!isGuest && !dbCache.users[username]) {
      dbCache.users[username] = {
        username,
        createdAt: Date.now(),
      };
      scheduleDbSave();
    }

    const user = {
      id: socket.id,
      username,
      isGuest,
      x: Number(payload.x) || 120,
      y: Number(payload.y) || 120,
      state: 'idle',
      gesture: 'none',
      facing: 'right',
      mode: 'cursor',
      bumpUntil: 0,
      bumpDir: 'right',
      typingActive: false,
      typingPhase: 0,
      speechText: '',
      speechUntil: 0,
      onHeadOf: null,
      sittingOnChair: false,
      updatedAt: Date.now(),
    };

    const lobbyState = lobbies.get(lobbyId);
    lobbyState.users.set(socket.id, user);
    socket.join(lobbyId);
    socket.data.lobbyId = lobbyId;
    socket.data.username = username;
    socket.data.isGuest = isGuest;

    const savedProjects = isGuest ? [] : getProjectsForUser(username);

    socket.emit('lobby_snapshot', {
      lobbyId,
      selfId: socket.id,
      users: Array.from(lobbyState.users.values()),
      windows: Array.from(lobbyState.windows.values()).map((windowState) => serializeWindow(windowState)),
      chairs: serializeChairs(lobbyState),
      savedProjects,
    });

    socket.to(lobbyId).emit('user_joined', user);
    io.to(lobbyId).emit('global_event', {
      level: 'info',
      text: `${username} joined ${lobbyId}`,
      timestamp: Date.now(),
    });

    if (typeof ack === 'function') {
      ack({ ok: true, lobbyId, selfId: socket.id, savedProjects });
    }
  });

  socket.on('project_save', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Join lobby first.' });
      return;
    }

    if (socket.data.isGuest) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Guests cannot save projects.' });
      return;
    }

    const type = String(payload.type || '');
    const name = sanitizeUsername(payload.name, `${type}-project`);
    const code = String(payload.code || '');

    if (!PROJECT_TYPES.has(type)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Unsupported project type.' });
      return;
    }

    saveProjectForUser(socket.data.username, { type, name, code });

    if (typeof ack === 'function') {
      ack({ ok: true, projects: getProjectsForUser(socket.data.username) });
    }
  });

  socket.on('project_reopen', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Join lobby first.' });
      return;
    }

    if (socket.data.isGuest) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Guests cannot reopen saved projects.' });
      return;
    }

    const { lobbyId, lobbyState } = lobbyInfo;
    const owner = lobbyState.users.get(socket.id);
    const projectName = String(payload.name || '');
    const projects = getProjectsForUser(socket.data.username);
    const project = projects.find((p) => p.name === projectName);

    if (!project) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Saved project not found.' });
      return;
    }

    const windowState = createWindowState({
      lobbyState,
      ownerId: socket.id,
      ownerName: owner ? owner.username : socket.data.username,
      type: project.type,
      content: {
        ...createWindowContent(project.type),
        code: project.code,
      },
    });

    pushModLog(windowState, {
      action: 'reopen_project',
      by: socket.id,
      byName: owner ? owner.username : socket.data.username,
      details: `Reopened saved project ${project.name}`,
      revertable: false,
    });

    lobbyState.windows.set(windowState.id, windowState);
    io.to(lobbyId).emit('window_created', {
      window: serializeWindow(windowState),
    });

    if (typeof ack === 'function') ack({ ok: true, windowId: windowState.id });
  });

  socket.on('debug_simulate_player', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Join lobby first.' });
      return;
    }

    simulateBotFlow(lobbyInfo.lobbyId, socket.id);
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('cursor_move', (payload = {}) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const user = lobbyState.users.get(socket.id);
    if (!user) return;

    const x = Number(payload.x);
    const y = Number(payload.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    if (user.sittingOnChair) {
      user.gesture = 'none';
      user.updatedAt = Date.now();
      const cursorPayload = {
        id: socket.id,
        x: user.x,
        y: user.y,
        state: 'sitting',
        gesture: user.gesture,
        facing: user.facing,
        mode: user.mode,
        bumpUntil: user.bumpUntil,
        bumpDir: user.bumpDir,
        onHeadOf: user.onHeadOf,
        typingActive: user.typingActive,
        typingPhase: user.typingPhase,
        speechText: user.speechText,
        speechUntil: user.speechUntil,
        sittingOnChair: user.sittingOnChair,
        updatedAt: user.updatedAt,
      };
      socket.to(lobbyId).emit('cursor_update', cursorPayload);
      socket.emit('cursor_update', cursorPayload);
      return;
    }

    const prevX = Number(user.x || 0);
    const prevY = Number(user.y || 0);
    let nextX = x;
    let nextY = y;
    let collided = false;
    let bumpDir = user.facing === 'left' ? 'left' : 'right';
    let landedOnHead = false;

    const SIDE_GAP = 18;
    const SAME_LEVEL_Y = 14;
    const HEAD_X_RANGE = 12;
    const HEAD_TOLERANCE_Y = 9;
    const STACK_OFFSET = 20;
    const avatarMode = payload.mode === 'avatar';

    if (payload.state === 'jumping') {
      user.onHeadOf = null;
    }
    if (user.onHeadOf && !lobbyState.users.has(user.onHeadOf)) {
      user.onHeadOf = null;
    }

    for (const other of lobbyState.users.values()) {
      if (!other || other.id === socket.id) continue;
      const otherX = Number(other.x || 0);
      const otherY = Number(other.y || 0);
      const landingY = otherY - STACK_OFFSET;

      if (avatarMode) {
        const closeEnoughX = Math.abs(nextX - otherX) <= (HEAD_X_RANGE + 4);
        const nearHeadY = Math.abs(nextY - landingY) <= HEAD_TOLERANCE_Y;
        const falling = nextY >= prevY;
        const crossedHeadPlane = prevY <= (landingY + HEAD_TOLERANCE_Y) && nextY >= (landingY - HEAD_TOLERANCE_Y);
        const fromAbove = prevY <= landingY + 12 || user.onHeadOf === other.id;
        if (closeEnoughX && fromAbove && (nearHeadY || (falling && crossedHeadPlane))) {
          landedOnHead = true;
          user.onHeadOf = other.id;
          nextY = landingY;
          nextX = otherX;
          continue;
        }
      }

      if (Math.abs(nextY - otherY) <= SAME_LEVEL_Y && Math.abs(nextX - otherX) < SIDE_GAP) {
        collided = true;
        const side = prevX <= otherX ? -1 : 1;
        nextX = otherX + side * SIDE_GAP;
        bumpDir = side > 0 ? 'right' : 'left';
      }
    }

    if (!landedOnHead && user.onHeadOf) {
      const base = lobbyState.users.get(user.onHeadOf);
      if (base) {
        const baseX = Number(base.x || 0);
        const baseY = Number(base.y || 0);
        const landingY = baseY - STACK_OFFSET;
        if (Math.abs(nextX - baseX) <= HEAD_X_RANGE + 2 && nextY <= landingY + HEAD_TOLERANCE_Y) {
          nextY = landingY;
          landedOnHead = true;
        } else {
          user.onHeadOf = null;
        }
      } else {
        user.onHeadOf = null;
      }
    }

    if (!landedOnHead && payload.state === 'jumping') {
      user.onHeadOf = null;
    }

    user.x = Math.round(nextX);
    user.y = Math.round(nextY);
    user.gesture = payload.gesture === 'point-left' || payload.gesture === 'point-right' || payload.gesture === 'point-up'
      ? payload.gesture
      : 'none';
    user.facing = payload.facing === 'left' ? 'left' : 'right';
    user.mode = payload.mode === 'avatar' ? 'avatar' : 'cursor';
    user.bumpDir = bumpDir;
    if (collided) {
      user.state = 'bump';
      user.bumpUntil = Date.now() + 220;
    } else if (payload.state === 'walking' || payload.state === 'jumping') {
      user.state = payload.state;
      user.bumpUntil = 0;
    } else {
      user.state = 'idle';
      user.bumpUntil = 0;
    }
    user.updatedAt = Date.now();

    const cursorPayload = {
      id: socket.id,
      x: user.x,
      y: user.y,
      state: user.state,
      gesture: user.gesture,
      facing: user.facing,
      mode: user.mode,
      bumpUntil: user.bumpUntil,
      bumpDir: user.bumpDir,
      onHeadOf: user.onHeadOf,
      typingActive: user.typingActive,
      typingPhase: user.typingPhase,
      speechText: user.speechText,
      speechUntil: user.speechUntil,
      sittingOnChair: user.sittingOnChair,
      updatedAt: user.updatedAt,
    };
    socket.to(lobbyId).emit('cursor_update', cursorPayload);

    const requestedX = Math.round(x);
    const requestedY = Math.round(y);
    const correctedForSelf = user.x !== requestedX
      || user.y !== requestedY
      || collided
      || Boolean(user.onHeadOf)
      || user.state === 'bump'
      || user.state === 'sitting';
    if (correctedForSelf) {
      socket.emit('cursor_update', cursorPayload);
    }

    const deltaX = user.x - prevX;
    const deltaY = user.y - prevY;
    if (deltaX !== 0 || deltaY !== 0) {
      for (const passenger of lobbyState.users.values()) {
        if (!passenger || passenger.id === user.id) continue;
        if (passenger.onHeadOf !== user.id) continue;
        if (passenger.state === 'jumping') {
          passenger.onHeadOf = null;
          continue;
        }

        passenger.x = Math.round(Number(passenger.x || 0) + deltaX);
        passenger.y = Math.round(user.y - STACK_OFFSET);
        passenger.updatedAt = Date.now();

        io.to(lobbyId).emit('cursor_update', {
          id: passenger.id,
          x: passenger.x,
          y: passenger.y,
          state: passenger.state,
          gesture: passenger.gesture,
          facing: passenger.facing,
          mode: passenger.mode,
          bumpUntil: passenger.bumpUntil,
          bumpDir: passenger.bumpDir,
          onHeadOf: passenger.onHeadOf,
          typingActive: passenger.typingActive,
          typingPhase: passenger.typingPhase,
          speechText: passenger.speechText,
          speechUntil: passenger.speechUntil,
          sittingOnChair: passenger.sittingOnChair,
          updatedAt: passenger.updatedAt,
        });
      }
    }
  });

  socket.on('avatar_typing', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const user = lobbyState.users.get(socket.id);
    if (!user) return;

    const active = Boolean(payload.active);
    const phase = Math.max(0, Math.min(3, Math.round(Number(payload.phase) || 0)));
    user.typingActive = active;
    user.typingPhase = active ? Math.max(1, phase || 1) : 0;
    user.updatedAt = Date.now();

    io.to(lobbyId).emit('cursor_update', {
      id: socket.id,
      x: user.x,
      y: user.y,
      state: user.state,
      gesture: user.gesture,
      facing: user.facing,
      mode: user.mode,
      bumpUntil: user.bumpUntil,
      bumpDir: user.bumpDir,
      onHeadOf: user.onHeadOf,
      typingActive: user.typingActive,
      typingPhase: user.typingPhase,
      speechText: user.speechText,
      speechUntil: user.speechUntil,
      sittingOnChair: user.sittingOnChair,
      updatedAt: user.updatedAt,
    });

    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('avatar_say', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const user = lobbyState.users.get(socket.id);
    if (!user) return;

    const text = String(payload.text || '').trim().slice(0, 180);
    if (!text) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Message cannot be empty.' });
      return;
    }

    user.typingActive = false;
    user.typingPhase = 0;
    user.speechText = text;
    user.speechUntil = Date.now() + 6500;
    user.updatedAt = Date.now();

    io.to(lobbyId).emit('cursor_update', {
      id: socket.id,
      x: user.x,
      y: user.y,
      state: user.state,
      gesture: user.gesture,
      facing: user.facing,
      mode: user.mode,
      bumpUntil: user.bumpUntil,
      bumpDir: user.bumpDir,
      onHeadOf: user.onHeadOf,
      typingActive: user.typingActive,
      typingPhase: user.typingPhase,
      speechText: user.speechText,
      speechUntil: user.speechUntil,
      sittingOnChair: user.sittingOnChair,
      updatedAt: user.updatedAt,
    });

    setTimeout(() => {
      const stillInLobby = lobbies.get(lobbyId);
      if (!stillInLobby) return;
      const sameUser = stillInLobby.users.get(socket.id);
      if (!sameUser) return;
      if (sameUser.speechUntil > Date.now()) return;
      if (!sameUser.speechText) return;

      sameUser.speechText = '';
      sameUser.speechUntil = 0;
      sameUser.updatedAt = Date.now();

      io.to(lobbyId).emit('cursor_update', {
        id: socket.id,
        x: sameUser.x,
        y: sameUser.y,
        state: sameUser.state,
        gesture: sameUser.gesture,
        facing: sameUser.facing,
        mode: sameUser.mode,
        bumpUntil: sameUser.bumpUntil,
        bumpDir: sameUser.bumpDir,
        onHeadOf: sameUser.onHeadOf,
        typingActive: sameUser.typingActive,
        typingPhase: sameUser.typingPhase,
        speechText: sameUser.speechText,
        speechUntil: sameUser.speechUntil,
        sittingOnChair: sameUser.sittingOnChair,
        updatedAt: sameUser.updatedAt,
      });
    }, 6800);

    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('chair_toggle', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const user = lobbyState.users.get(socket.id);
    if (!user) return;

    if (lobbyState.chairs.has(socket.id)) {
      lobbyState.chairs.delete(socket.id);
      if (user.sittingOnChair) {
        user.sittingOnChair = false;
        user.state = 'idle';
      }
      user.gesture = 'none';
      broadcastChairs(lobbyId, lobbyState);
      io.to(lobbyId).emit('cursor_update', {
        id: socket.id,
        x: user.x,
        y: user.y,
        state: user.state,
        gesture: user.gesture,
        facing: user.facing,
        mode: user.mode,
        bumpUntil: user.bumpUntil,
        bumpDir: user.bumpDir,
        onHeadOf: user.onHeadOf,
        typingActive: user.typingActive,
        typingPhase: user.typingPhase,
        speechText: user.speechText,
        speechUntil: user.speechUntil,
        sittingOnChair: user.sittingOnChair,
        updatedAt: Date.now(),
      });
      if (typeof ack === 'function') ack({ ok: true, active: false });
      return;
    }

    const x = Number(payload.x);
    const y = Number(payload.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Invalid chair position.' });
      return;
    }

    lobbyState.chairs.set(socket.id, {
      ownerId: socket.id,
      ownerName: user.username,
      x: Math.round(x),
      y: Math.round(y),
      active: true,
    });

    broadcastChairs(lobbyId, lobbyState);
    if (typeof ack === 'function') ack({ ok: true, active: true });
  });

  socket.on('chair_interact', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const user = lobbyState.users.get(socket.id);
    const chair = lobbyState.chairs.get(socket.id);
    if (!user || !chair) {
      if (typeof ack === 'function') ack({ ok: false, error: 'No personal chair active.' });
      return;
    }

    if (user.sittingOnChair) {
      user.sittingOnChair = false;
      user.state = 'idle';
      user.gesture = 'none';
      user.updatedAt = Date.now();
      io.to(lobbyId).emit('cursor_update', {
        id: socket.id,
        x: user.x,
        y: user.y,
        state: user.state,
        gesture: user.gesture,
        facing: user.facing,
        mode: user.mode,
        bumpUntil: user.bumpUntil,
        bumpDir: user.bumpDir,
        onHeadOf: user.onHeadOf,
        typingActive: user.typingActive,
        typingPhase: user.typingPhase,
        speechText: user.speechText,
        speechUntil: user.speechUntil,
        sittingOnChair: user.sittingOnChair,
        updatedAt: user.updatedAt,
      });
      if (typeof ack === 'function') ack({ ok: true, sitting: false });
      return;
    }

    const mode = payload.mode === 'avatar' ? 'avatar' : 'cursor';
    if (mode !== 'avatar') {
      if (typeof ack === 'function') ack({ ok: false, error: 'Switch to avatar walking mode to sit.' });
      return;
    }

    const dx = Number(user.x || 0) - Number(chair.x || 0);
    const dy = Number(user.y || 0) - Number(chair.y || 0);
    const dist = Math.hypot(dx, dy);
    if (dist > 28) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Move closer to your chair.' });
      return;
    }

    user.x = chair.x;
    user.y = chair.y - CHAIR_SEAT_OFFSET;
    user.sittingOnChair = true;
    user.state = 'sitting';
    user.gesture = 'none';
    user.updatedAt = Date.now();

    io.to(lobbyId).emit('cursor_update', {
      id: socket.id,
      x: user.x,
      y: user.y,
      state: user.state,
      gesture: user.gesture,
      facing: user.facing,
      mode: user.mode,
      bumpUntil: user.bumpUntil,
      bumpDir: user.bumpDir,
      onHeadOf: user.onHeadOf,
      typingActive: user.typingActive,
      typingPhase: user.typingPhase,
      speechText: user.speechText,
      speechUntil: user.speechUntil,
      sittingOnChair: user.sittingOnChair,
      updatedAt: user.updatedAt,
    });

    if (typeof ack === 'function') ack({ ok: true, sitting: true });
  });

  socket.on('window_create', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Join a lobby first.' });
      return;
    }

    const { lobbyId, lobbyState } = lobbyInfo;
    const owner = lobbyState.users.get(socket.id);
    if (!owner) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Unknown owner user.' });
      return;
    }

    const type = payload.type;
    if (!WINDOW_TYPES.includes(type)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Invalid window type.' });
      return;
    }

    const windowState = createWindowState({
      lobbyState,
      ownerId: socket.id,
      ownerName: owner.username,
      type,
      x: Number(payload.x),
      y: Number(payload.y),
      width: Number(payload.width),
      height: Number(payload.height),
    });

    pushModLog(windowState, {
      action: 'create_window',
      by: socket.id,
      byName: owner.username,
      details: `${owner.username} created ${windowState.title}`,
      revertable: false,
    });

    lobbyState.windows.set(windowState.id, windowState);
    io.to(lobbyId).emit('window_created', {
      window: serializeWindow(windowState),
    });

    if (typeof ack === 'function') ack({ ok: true, windowId: windowState.id });
  });

  socket.on('window_spawn_html_result', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Join a lobby first.' });
      return;
    }

    const { lobbyId, lobbyState } = lobbyInfo;
    const owner = lobbyState.users.get(socket.id);
    if (!owner) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Unknown owner user.' });
      return;
    }

    const sourceWindowId = String(payload.sourceWindowId || '');
    const sourceWindow = lobbyState.windows.get(sourceWindowId);
    if (!sourceWindow) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Source window not found.' });
      return;
    }

    if (!canEditWindow(sourceWindow, socket.id) || sourceWindow.type !== 'htmljs') {
      if (typeof ack === 'function') ack({ ok: false, error: 'No permission to run this HTML window.' });
      return;
    }

    const htmlResult = String(payload.code || '').slice(0, 200000);
    const windowState = createWindowState({
      lobbyState,
      ownerId: socket.id,
      ownerName: owner.username,
      type: 'html-result',
      x: Number(payload.x),
      y: Number(payload.y),
      width: Number(payload.width) || 520,
      height: Number(payload.height) || 360,
      content: {
        htmlResult,
        sourceWindowId,
      },
    });

    pushModLog(windowState, {
      action: 'spawn_html_result',
      by: socket.id,
      byName: owner.username,
      details: `${owner.username} ran HTML window ${sourceWindowId}`,
      revertable: false,
    });

    lobbyState.windows.set(windowState.id, windowState);
    io.to(lobbyId).emit('window_created', {
      window: serializeWindow(windowState),
    });

    if (typeof ack === 'function') ack({ ok: true, windowId: windowState.id });
  });

  socket.on('window_update', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const windowState = lobbyState.windows.get(payload.windowId);
    if (!windowState) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Window not found.' });
      return;
    }

    if (!canEditWindow(windowState, socket.id)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'No permission to move or resize this window.' });
      return;
    }

    if (Number.isFinite(payload.x)) windowState.x = Math.round(payload.x);
    if (Number.isFinite(payload.y)) windowState.y = Math.round(payload.y);
    if (Number.isFinite(payload.width)) windowState.width = Math.max(280, Math.round(payload.width));
    if (Number.isFinite(payload.height)) windowState.height = Math.max(200, Math.round(payload.height));
    if (Number.isFinite(payload.zIndex)) windowState.zIndex = Math.max(1, Math.round(payload.zIndex));
    windowState.updatedAt = Date.now();

    broadcastWindowState(lobbyId, windowState, 'window_updated');
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('window_remove', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const windowState = lobbyState.windows.get(payload.windowId);
    if (!windowState) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Window not found.' });
      return;
    }

    if (windowState.ownerId !== socket.id) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Only owner can close this window.' });
      return;
    }

    lobbyState.windows.delete(windowState.id);
    if (lobbyState.chairs.size) {
      lobbyState.chairs.clear();
      for (const u of lobbyState.users.values()) {
        if (!u) continue;
        if (!u.sittingOnChair) continue;
        u.sittingOnChair = false;
        if (u.state === 'sitting') u.state = 'idle';
        u.updatedAt = Date.now();
        io.to(lobbyId).emit('cursor_update', {
          id: u.id,
          x: u.x,
          y: u.y,
          state: u.state,
          gesture: u.gesture,
          facing: u.facing,
          mode: u.mode,
          bumpUntil: u.bumpUntil,
          bumpDir: u.bumpDir,
          onHeadOf: u.onHeadOf,
          typingActive: u.typingActive,
          typingPhase: u.typingPhase,
          speechText: u.speechText,
          speechUntil: u.speechUntil,
          sittingOnChair: u.sittingOnChair,
          updatedAt: u.updatedAt,
        });
      }
      broadcastChairs(lobbyId, lobbyState);
    }
    io.to(lobbyId).emit('window_removed', {
      windowId: windowState.id,
      reason: 'closed_by_owner',
    });

    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('window_pointer_move', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const windowState = lobbyState.windows.get(payload.windowId);
    const user = lobbyState.users.get(socket.id);
    if (!windowState || !user) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Window or user not found.' });
      return;
    }

    const relX = Number(payload.relX);
    const relY = Number(payload.relY);
    const visible = Boolean(payload.visible);

    if (visible && (!Number.isFinite(relX) || !Number.isFinite(relY))) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Invalid pointer coordinates.' });
      return;
    }

    socket.to(lobbyId).emit('window_pointer_update', {
      windowId: windowState.id,
      userId: user.id,
      username: user.username,
      relX: visible ? relX : 0,
      relY: visible ? relY : 0,
      visible,
      updatedAt: Date.now(),
    });

    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('window_request_edit', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyState } = lobbyInfo;
    const windowState = lobbyState.windows.get(payload.windowId);
    if (!windowState) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Window not found.' });
      return;
    }

    if (windowState.ownerId === socket.id || windowState.permissions.editors.has(socket.id)) {
      if (typeof ack === 'function') ack({ ok: true, message: 'Already has editor access.' });
      return;
    }

    const requester = lobbyState.users.get(socket.id);
    if (!requester) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Requester not found.' });
      return;
    }

    if (windowState.permissions.pendingRequests.has(socket.id)) {
      if (typeof ack === 'function') ack({ ok: true, message: 'Request already pending.' });
      return;
    }

    windowState.permissions.pendingRequests.add(socket.id);

    io.to(windowState.ownerId).emit('window_edit_request', {
      windowId: windowState.id,
      windowTitle: windowState.title,
      requesterId: requester.id,
      requesterName: requester.username,
      requesterIsGuest: requester.isGuest,
      requestedAt: Date.now(),
    });

    io.to(windowState.ownerId).emit('window_permissions_updated', {
      windowId: windowState.id,
      permissions: serializeWindow(windowState).permissions,
    });

    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('window_edit_request_response', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const windowState = lobbyState.windows.get(payload.windowId);
    if (!windowState) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Window not found.' });
      return;
    }

    if (windowState.ownerId !== socket.id) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Only owner can respond.' });
      return;
    }

    const requesterId = payload.requesterId;
    if (!windowState.permissions.pendingRequests.has(requesterId)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'No pending request for this user.' });
      return;
    }

    const accepted = Boolean(payload.accept);
    windowState.permissions.pendingRequests.delete(requesterId);

    if (accepted) {
      const snapshot = snapshotCode(windowState, `Auto-backup before granting edit access to ${requesterId}`, socket.id);

      const ownerUser = lobbyState.users.get(socket.id);
      const requesterUser = lobbyState.users.get(requesterId);
      windowState.permissions.editors.add(requesterId);

      pushModLog(windowState, {
        action: 'grant_edit_access',
        by: socket.id,
        byName: ownerUser ? ownerUser.username : 'Owner',
        details: `${requesterUser ? requesterUser.username : requesterId} granted edit access`,
        revertable: false,
      });

      io.to(windowState.ownerId).emit('window_snapshot_created', {
        windowId: windowState.id,
        snapshot,
      });
    }

    io.to(requesterId).emit('window_request_resolved', {
      windowId: windowState.id,
      accepted,
    });

    io.to(lobbyId).emit('window_permissions_updated', {
      windowId: windowState.id,
      permissions: serializeWindow(windowState).permissions,
    });

    if (typeof ack === 'function') ack({ ok: true, accepted });
  });

  socket.on('window_code_update', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const windowState = lobbyState.windows.get(payload.windowId);
    const actor = lobbyState.users.get(socket.id);
    if (!windowState || !actor) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Window or actor not found.' });
      return;
    }

    if (!PROJECT_TYPES.has(windowState.type) || !canEditWindow(windowState, socket.id)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'No code edit permission.' });
      return;
    }

    const newCode = String(payload.code || '');
    windowState.content.code = newCode;

    pushModLog(windowState, {
      action: 'code_change',
      by: socket.id,
      byName: actor.username,
      details: `${actor.username} edited code`,
      revertable: true,
    });

    io.to(lobbyId).emit('window_content_updated', {
      windowId: windowState.id,
      content: windowState.content,
      modLog: windowState.modLog,
      snapshots: windowState.snapshots,
    });

    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('window_console_output', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const windowState = lobbyState.windows.get(payload.windowId);
    if (!windowState) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Window not found.' });
      return;
    }

    if (!canEditWindow(windowState, socket.id)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'No permission to write console output.' });
      return;
    }

    const line = String(payload.line || '').slice(0, 2000);
    if (!line.trim()) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Console line cannot be empty.' });
      return;
    }

    socket.to(lobbyId).emit('window_console_output_sync', {
      windowId: windowState.id,
      line,
      from: socket.id,
      timestamp: Date.now(),
    });

    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('window_revert_mod_action', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const windowState = lobbyState.windows.get(payload.windowId);
    const actor = lobbyState.users.get(socket.id);
    if (!windowState || !actor) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Window or actor not found.' });
      return;
    }

    if (windowState.ownerId !== socket.id) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Only owner can revert.' });
      return;
    }

    const targetAction = windowState.modLog.find((entry) => entry.id === payload.actionId);
    if (!targetAction || !targetAction.revertable) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Action is not revertable.' });
      return;
    }

    const snapshot = windowState.snapshots[windowState.snapshots.length - 1];
    if (!snapshot || typeof snapshot.code !== 'string') {
      if (typeof ack === 'function') ack({ ok: false, error: 'No snapshot available for revert.' });
      return;
    }

    windowState.content.code = snapshot.code;

    pushModLog(windowState, {
      action: 'revert_to_snapshot',
      by: socket.id,
      byName: actor.username,
      details: `${actor.username} reverted to snapshot ${snapshot.id}`,
      revertable: false,
    });

    io.to(lobbyId).emit('window_content_updated', {
      windowId: windowState.id,
      content: windowState.content,
      modLog: windowState.modLog,
      snapshots: windowState.snapshots,
    });

    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('window_kick_user', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const windowState = lobbyState.windows.get(payload.windowId);
    if (!windowState) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Window not found.' });
      return;
    }

    if (windowState.ownerId !== socket.id) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Only owner can kick.' });
      return;
    }

    const targetId = payload.targetId;
    if (!targetId || targetId === windowState.ownerId) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Invalid kick target.' });
      return;
    }

    windowState.permissions.editors.delete(targetId);
    windowState.permissions.pendingRequests.delete(targetId);

    io.to(targetId).emit('window_access_revoked', {
      windowId: windowState.id,
    });

    io.to(lobbyId).emit('window_permissions_updated', {
      windowId: windowState.id,
      permissions: serializeWindow(windowState).permissions,
    });

    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('window_chat_send', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const windowState = lobbyState.windows.get(payload.windowId);
    const user = lobbyState.users.get(socket.id);
    if (!windowState || !user) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Window or user not found.' });
      return;
    }

    const mutedUntil = windowState.permissions.mutedUsers.get(socket.id);
    if (mutedUntil && mutedUntil > Date.now()) {
      if (typeof ack === 'function') {
        ack({ ok: false, error: `Muted until ${new Date(mutedUntil).toLocaleTimeString()}` });
      }
      return;
    }

    const text = String(payload.message || '').trim().slice(0, 400);
    if (!text) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Message cannot be empty.' });
      return;
    }

    const tab = payload.tab === 'guests' ? 'guests' : 'collaborators';
    if (tab === 'collaborators' && !canEditWindow(windowState, socket.id)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'No permission for collaborator chat.' });
      return;
    }
    const message = {
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      windowId: windowState.id,
      userId: user.id,
      username: user.username,
      isGuest: user.isGuest,
      tab,
      text,
      timestamp: Date.now(),
    };

    windowState.chatLog.push(message);
    if (windowState.chatLog.length > 200) {
      windowState.chatLog.shift();
    }

    io.to(lobbyId).emit('window_chat_message', message);
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('window_chat_mute', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const windowState = lobbyState.windows.get(payload.windowId);
    if (!windowState) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Window not found.' });
      return;
    }

    if (windowState.ownerId !== socket.id) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Only owner can mute.' });
      return;
    }

    const targetId = payload.targetId;
    const duration = Number(payload.durationMinutes);
    if (!targetId || ![5, 10, 60].includes(duration)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Invalid mute payload.' });
      return;
    }

    const mutedUntil = Date.now() + duration * 60 * 1000;
    windowState.permissions.mutedUsers.set(targetId, mutedUntil);

    io.to(targetId).emit('window_user_muted', {
      windowId: windowState.id,
      mutedUntil,
    });

    io.to(lobbyId).emit('window_permissions_updated', {
      windowId: windowState.id,
      permissions: serializeWindow(windowState).permissions,
    });

    if (typeof ack === 'function') ack({ ok: true, mutedUntil });
  });

  socket.on('window_youtube_search', async (payload = {}, ack) => {
    if (typeof ack === 'function') {
      ack({ ok: false, error: 'Search is disabled. Paste a YouTube video or playlist URL.' });
    }
  });

  socket.on('window_youtube_select', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const windowState = lobbyState.windows.get(payload.windowId);
    if (!windowState) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Window not found.' });
      return;
    }

    if (windowState.type !== 'youtube') {
      if (typeof ack === 'function') ack({ ok: false, error: 'Not a YouTube window.' });
      return;
    }

    if (!canEditWindow(windowState, socket.id)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'No permission to control this player.' });
      return;
    }

    const url = String(payload.url || '').trim();
    const parsed = parseYouTubeUrl(url);
    if (!parsed) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Invalid YouTube video or playlist URL.' });
      return;
    }

    const videoId = parsed.videoId || '';
    const playlistId = parsed.playlistId || '';

    if (!videoId && !playlistId) {
      if (typeof ack === 'function') ack({ ok: false, error: 'URL must include a video or playlist.' });
      return;
    }

    const title = String(payload.title || '').trim();
    windowState.content.youtubeInputUrl = url;
    windowState.content.youtubeVideoId = videoId;
    windowState.content.youtubePlaylistId = playlistId;
    windowState.content.youtubeVideoTitle = title;
    windowState.content.youtubeState = 'paused';
    windowState.content.youtubeCurrentTime = 0;

    io.to(lobbyId).emit('window_content_updated', {
      windowId: windowState.id,
      content: windowState.content,
      modLog: windowState.modLog,
      snapshots: windowState.snapshots,
    });

    io.to(lobbyId).emit('window_youtube_control_sync', {
      windowId: windowState.id,
      videoId,
      playlistId,
      state: 'paused',
      time: 0,
    });

    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('window_youtube_control', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const windowState = lobbyState.windows.get(payload.windowId);
    if (!windowState) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Window not found.' });
      return;
    }

    if (windowState.type !== 'youtube') {
      if (typeof ack === 'function') ack({ ok: false, error: 'Not a YouTube window.' });
      return;
    }

    if (!canEditWindow(windowState, socket.id)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'No permission to control this player.' });
      return;
    }

    const state = payload.state === 'playing' ? 'playing' : 'paused';
    const time = Number.isFinite(Number(payload.time)) ? Number(payload.time) : 0;

    windowState.content.youtubeState = state;
    windowState.content.youtubeCurrentTime = Math.max(0, time);

    io.to(lobbyId).emit('window_youtube_control_sync', {
      windowId: windowState.id,
      videoId: windowState.content.youtubeVideoId,
      playlistId: windowState.content.youtubePlaylistId || '',
      state,
      time: windowState.content.youtubeCurrentTime,
    });

    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('window_youtube_resync', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const windowState = lobbyState.windows.get(payload.windowId);
    if (!windowState) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Window not found.' });
      return;
    }
    if (windowState.type !== 'youtube') {
      if (typeof ack === 'function') ack({ ok: false, error: 'Not a YouTube window.' });
      return;
    }
    if (!canEditWindow(windowState, socket.id)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'No permission to resync this player.' });
      return;
    }

    io.to(lobbyId).emit('window_youtube_control_sync', {
      windowId: windowState.id,
      videoId: windowState.content.youtubeVideoId || '',
      playlistId: windowState.content.youtubePlaylistId || '',
      state: windowState.content.youtubeState || 'paused',
      time: Number(windowState.content.youtubeCurrentTime) || 0,
      forced: true,
    });

    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('window_dino_state', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const windowState = lobbyState.windows.get(payload.windowId);
    if (!windowState) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Window not found.' });
      return;
    }

    if (windowState.type !== 'dino') {
      if (typeof ack === 'function') ack({ ok: false, error: 'Not a dino window.' });
      return;
    }

    if (windowState.ownerId !== socket.id) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Only owner can control dino.' });
      return;
    }

    const next = payload.state || {};
    const y = Number(next.y);
    const vy = Number(next.vy);
    const obstacleX = Number(next.obstacleX);
    const score = Number(next.score);
    if (!Number.isFinite(y) || !Number.isFinite(vy) || !Number.isFinite(obstacleX) || !Number.isFinite(score)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Invalid dino state.' });
      return;
    }

    windowState.content.dinoState = {
      y,
      vy,
      obstacleX,
      score,
    };

    socket.to(lobbyId).emit('window_dino_state_sync', {
      windowId: windowState.id,
      state: windowState.content.dinoState,
      ownerId: windowState.ownerId,
    });

    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('window_drawing_stroke', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const windowState = lobbyState.windows.get(payload.windowId);
    if (!windowState) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Window not found.' });
      return;
    }

    if (windowState.type !== 'drawing') {
      if (typeof ack === 'function') ack({ ok: false, error: 'Not a drawing window.' });
      return;
    }

    if (!canEditWindow(windowState, socket.id)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'No permission to draw.' });
      return;
    }

    const stroke = {
      id: `stroke-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      by: socket.id,
      color: String(payload.color || '#ffffff').slice(0, 20),
      size: Math.max(1, Math.min(20, Number(payload.size) || 2)),
      fromX: Number(payload.fromX),
      fromY: Number(payload.fromY),
      toX: Number(payload.toX),
      toY: Number(payload.toY),
      timestamp: Date.now(),
    };

    if (
      !Number.isFinite(stroke.fromX) ||
      !Number.isFinite(stroke.fromY) ||
      !Number.isFinite(stroke.toX) ||
      !Number.isFinite(stroke.toY)
    ) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Invalid stroke coordinates.' });
      return;
    }

    if (!Array.isArray(windowState.content.drawingStrokes)) {
      windowState.content.drawingStrokes = [];
    }

    windowState.content.drawingStrokes.push(stroke);
    if (windowState.content.drawingStrokes.length > 5000) {
      windowState.content.drawingStrokes.shift();
    }

    io.to(lobbyId).emit('window_drawing_stroke_sync', {
      windowId: windowState.id,
      stroke,
    });

    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('window_drawing_clear', (payload = {}, ack) => {
    const lobbyInfo = getLobbyFromSocket(socket);
    if (!lobbyInfo) return;

    const { lobbyId, lobbyState } = lobbyInfo;
    const windowState = lobbyState.windows.get(payload.windowId);
    if (!windowState) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Window not found.' });
      return;
    }

    if (windowState.type !== 'drawing') {
      if (typeof ack === 'function') ack({ ok: false, error: 'Not a drawing window.' });
      return;
    }

    if (!canEditWindow(windowState, socket.id)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'No permission to clear drawing.' });
      return;
    }

    windowState.content.drawingStrokes = [];

    io.to(lobbyId).emit('window_content_updated', {
      windowId: windowState.id,
      content: windowState.content,
      modLog: windowState.modLog,
      snapshots: windowState.snapshots,
    });

    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('leave_lobby', () => {
    leaveLobby(socket);
  });

  socket.on('disconnect', () => {
    leaveLobby(socket);
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`PixelCode Hub server listening on http://localhost:${PORT}`);
});
    const CHAIR_SEAT_OFFSET = 8;
