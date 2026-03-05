const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const levelTitleEl = document.getElementById("levelTitle");
const levelLocationEl = document.getElementById("levelLocation");
const questTextEl = document.getElementById("questText");
const interactionHintEl = document.getElementById("interactionHint");
const inventoryEl = document.getElementById("inventory");
const logEl = document.getElementById("log");

const endingEl = document.getElementById("ending");
const endingTitleEl = document.getElementById("endingTitle");
const endingTextEl = document.getElementById("endingText");
const nextLevelBtn = document.getElementById("nextLevelBtn");

const touchControlsEl = document.getElementById("touchControls");
const movePadEl = document.getElementById("movePad");
const stickBaseEl = document.getElementById("stickBase");
const stickKnobEl = document.getElementById("stickKnob");
const mobileLayoutEl = document.getElementById("mobileLayout");
const fullscreenBtn = document.getElementById("fullscreenBtn");

const MOBILE_LAYOUT_KEY = "dragon-mobile-layout";
const TOUCH_LAYOUTS = new Set(["classic", "lefty", "compact"]);
const isTouchDevice = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
const tg = window.__tg || window.Telegram?.WebApp || null;
const TG_TOP_OVERLAY_PX = 44;

const input = {
  up: false,
  down: false,
  left: false,
  right: false
};

const COOLDOWNS = {
  slash: 0.45,
  dash: 2.2,
  ice: 0.95
};

const ABILITIES = [
  { id: "slash", name: "Удар мечом", key: "Space", use: () => useSlash() },
  { id: "ice", name: "Ледяная стрела", key: "Q", use: () => useIceShot() },
  { id: "dash", name: "Рывок", key: "Shift", use: () => useDash() }
];

const state = {
  time: 0,
  lastTs: 0,
  status: "playing",
  logs: [],
  uiButtons: {},
  uiTextTick: 0,
  shake: 0,
  embers: [],
  fireballs: [],
  iceShots: [],
  particles: [],
  slashes: [],
  immersive: false,
  mobile: {
    enabled: isTouchDevice,
    layout: "classic",
    pointerId: null,
    touchActive: false,
    moveX: 0,
    moveY: 0,
    stickRadius: 44
  },
  player: {
    x: 180,
    y: 428,
    r: 14,
    speed: 248,
    faceX: 1,
    faceY: 0,
    hp: 100,
    maxHp: 100,
    slashCd: 0,
    dashCd: 0,
    iceCd: 0,
    dashTime: 0,
    dashVX: 0,
    dashVY: 0,
    invuln: 0
  },
  dragon: {
    x: 748,
    y: 156,
    targetX: 748,
    targetTimer: 0,
    wingPhase: 0,
    hp: 360,
    maxHp: 360,
    attackCd: 1.1,
    slowTime: 0,
    enraged: false,
    hitFlash: 0
  }
};

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function layoutLabel(layout) {
  if (layout === "lefty") return "Левша";
  if (layout === "compact") return "Компакт";
  return "Классика";
}

function getStoredLayout() {
  try {
    const value = localStorage.getItem(MOBILE_LAYOUT_KEY);
    if (value && TOUCH_LAYOUTS.has(value)) {
      return value;
    }
  } catch {}
  return "classic";
}

function storeLayout(layout) {
  try {
    localStorage.setItem(MOBILE_LAYOUT_KEY, layout);
  } catch {}
}

function tgImpact(style = "light") {
  try {
    tg?.HapticFeedback?.impactOccurred?.(style);
  } catch {}
}

function tgNotify(type = "success") {
  try {
    tg?.HapticFeedback?.notificationOccurred?.(type);
  } catch {}
}

function initTelegramBindings() {
  if (!tg?.MainButton) {
    return;
  }

  tg.MainButton.setParams({
    is_visible: false,
    color: "#7bd4ff",
    text_color: "#10202c"
  });

  tg.onEvent?.("mainButtonClicked", () => {
    resetGame();
  });
}

function getTelegramViewportHeight() {
  const stable = Number(tg?.viewportStableHeight);
  if (Number.isFinite(stable) && stable > 0) {
    return stable;
  }

  const current = Number(tg?.viewportHeight);
  if (Number.isFinite(current) && current > 0) {
    return current;
  }

  return 0;
}

function updateViewportCssVars() {
  const tgHeight = getTelegramViewportHeight();
  const viewportHeight = tgHeight > 0 ? tgHeight : window.innerHeight;
  const topOffset = state.immersive && state.mobile.enabled && tg ? TG_TOP_OVERLAY_PX : 0;

  document.documentElement.style.setProperty("--app-vh", `${Math.round(viewportHeight)}px`);
  document.documentElement.style.setProperty("--immersive-top-offset", `${topOffset}px`);
}

function isBrowserFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

async function requestBrowserFullscreen() {
  const target = document.documentElement;
  try {
    if (target.requestFullscreen) {
      await target.requestFullscreen();
    } else if (target.webkitRequestFullscreen) {
      target.webkitRequestFullscreen();
    }
  } catch {}
}

async function exitBrowserFullscreen() {
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  } catch {}
}

async function lockLandscapeOrientation() {
  try {
    await window.screen?.orientation?.lock?.("landscape");
  } catch {}
}

function unlockOrientation() {
  try {
    window.screen?.orientation?.unlock?.();
  } catch {}
}

function setImmersiveMode(enabled) {
  state.immersive = enabled;
  document.body.classList.toggle("immersive-mode", enabled);

  if (fullscreenBtn) {
    fullscreenBtn.textContent = enabled ? "↙ Обычный экран" : "⛶ Полный экран";
  }

  try {
    if (enabled) {
      tg?.expand?.();
      tg?.requestFullscreen?.();
    } else {
      tg?.exitFullscreen?.();
    }
  } catch {}

  updateViewportCssVars();
  updateHint();
}

async function toggleFullscreenMode() {
  const shouldEnable = !state.immersive;

  if (shouldEnable) {
    await requestBrowserFullscreen();
    await lockLandscapeOrientation();
    setImmersiveMode(true);
    tgImpact("light");
    return;
  }

  await exitBrowserFullscreen();
  unlockOrientation();
  setImmersiveMode(false);
}

function initFullscreenControl() {
  updateViewportCssVars();

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      toggleFullscreenMode();
    });
  }

  document.addEventListener("fullscreenchange", () => {
    if (!isBrowserFullscreen() && state.immersive) {
      unlockOrientation();
      setImmersiveMode(false);
      return;
    }

    updateViewportCssVars();
  });

  window.addEventListener("resize", () => {
    updateViewportCssVars();
    updateHint();
  });

  tg?.onEvent?.("viewportChanged", () => {
    updateViewportCssVars();
    updateHint();
  });

  tg?.onEvent?.("fullscreenChanged", (payload) => {
    const isFullscreen = typeof payload === "boolean"
      ? payload
      : Boolean(payload?.isFullscreen ?? payload?.is_fullscreen);

    if (!isFullscreen && state.immersive && !isBrowserFullscreen()) {
      unlockOrientation();
      setImmersiveMode(false);
      return;
    }

    updateViewportCssVars();
  });
}

function addLog(text) {
  state.logs.unshift(text);
  if (state.logs.length > 32) {
    state.logs.length = 32;
  }
  renderLog();
}

function renderLog() {
  logEl.innerHTML = "";
  state.logs.slice(0, 16).forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line;
    logEl.appendChild(p);
  });
}

function showEnding(title, text, buttonText) {
  endingTitleEl.textContent = title;
  endingTextEl.textContent = text;
  nextLevelBtn.textContent = buttonText;
  endingEl.classList.remove("hidden");

  if (tg?.MainButton) {
    tg.MainButton.setText(buttonText);
    tg.MainButton.show();
  }
}

function hideEnding() {
  endingEl.classList.add("hidden");

  if (tg?.MainButton) {
    tg.MainButton.hide();
  }
}

function createAbilityButtons() {
  inventoryEl.innerHTML = "";
  state.uiButtons = {};

  ABILITIES.forEach((ability) => {
    const button = document.createElement("button");
    button.type = "button";
    button.addEventListener("click", ability.use);
    inventoryEl.appendChild(button);
    state.uiButtons[ability.id] = button;
  });
}

function cooldownText(value) {
  return value > 0.01 ? ` ${value.toFixed(1)}с` : "";
}

function updateAbilityButtons() {
  ABILITIES.forEach((ability) => {
    const button = state.uiButtons[ability.id];
    if (!button) {
      return;
    }

    const cdValue =
      ability.id === "slash"
        ? state.player.slashCd
        : ability.id === "dash"
          ? state.player.dashCd
          : state.player.iceCd;

    button.textContent = `${ability.name} [${ability.key}]${cooldownText(cdValue)}`;
    button.disabled = state.status !== "playing" || cdValue > 0.01;
  });
}

function getQuestText() {
  if (state.status === "win") {
    return "Дракон повержен. Арена освобождена.";
  }

  if (state.status === "lose") {
    return "Герой пал. Нужна новая попытка.";
  }

  if (state.dragon.enraged) {
    return "Фаза ярости: уклоняйся от залпов и добивай дракона.";
  }

  if (state.dragon.hp < state.dragon.maxHp * 0.5) {
    return "Дожми босса: чередуй меч, лед и рывок.";
  }

  return "Победи дракона и выживи в огненном шторме.";
}

function renderMeta() {
  levelTitleEl.textContent = "🐉 Бой с Драконом";

  if (state.status === "playing") {
    levelLocationEl.textContent = state.dragon.enraged
      ? "Лавовая арена у руин крепости. Дракон в ярости."
      : "Лавовая арена у руин старой крепости.";
  } else if (state.status === "win") {
    levelLocationEl.textContent = "Победа. Пепел остывает, клинок цел.";
  } else {
    levelLocationEl.textContent = "Поражение. Арена снова ждет претендента.";
  }

  questTextEl.textContent = getQuestText();
}

function updateHint() {
  const layoutNote = state.mobile.enabled ? ` Схема Android: ${layoutLabel(state.mobile.layout)}.` : "";

  if (state.immersive && state.mobile.enabled && window.innerHeight > window.innerWidth) {
    interactionHintEl.textContent = "Поверни телефон горизонтально для нормального полного экрана.";
    return;
  }

  if (state.status === "playing") {
    if (state.dragon.enraged) {
      interactionHintEl.textContent = `Ярость босса: больше огня. Уклоняйся рывком (Shift).${layoutNote}`;
    } else {
      interactionHintEl.textContent = `Space - меч, Q - ледяная стрела, Shift - рывок.${layoutNote}`;
    }
    return;
  }

  if (state.status === "win") {
    interactionHintEl.textContent = "Бой завершен. Нажми кнопку ниже или R для новой битвы.";
    return;
  }

  interactionHintEl.textContent = "Поражение. Нажми кнопку ниже или R для рестарта.";
}

function clearTouchInput() {
  state.mobile.pointerId = null;
  state.mobile.touchActive = false;
  state.mobile.moveX = 0;
  state.mobile.moveY = 0;
  if (stickKnobEl) {
    stickKnobEl.style.transform = "translate(0px, 0px)";
  }
}

function applyMobileLayout(layout) {
  const target = TOUCH_LAYOUTS.has(layout) ? layout : "classic";
  state.mobile.layout = target;

  if (touchControlsEl) {
    touchControlsEl.dataset.layout = target;
  }

  if (mobileLayoutEl && mobileLayoutEl.value !== target) {
    mobileLayoutEl.value = target;
  }

  storeLayout(target);
  updateHint();
}

function updateTouchVectorFromPoint(clientX, clientY) {
  if (!stickBaseEl || !stickKnobEl) {
    return;
  }

  const rect = stickBaseEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  let dx = clientX - cx;
  let dy = clientY - cy;

  const dist = Math.hypot(dx, dy);
  const maxDist = state.mobile.stickRadius;

  if (dist > maxDist && dist > 0) {
    const k = maxDist / dist;
    dx *= k;
    dy *= k;
  }

  state.mobile.moveX = dx / maxDist;
  state.mobile.moveY = dy / maxDist;
  state.mobile.touchActive = true;

  stickKnobEl.style.transform = `translate(${dx}px, ${dy}px)`;
}

function triggerTouchAction(action) {
  if (action === "slash") useSlash();
  if (action === "ice") useIceShot();
  if (action === "dash") useDash();
}

function initTouchControls() {
  applyMobileLayout(getStoredLayout());

  if (!touchControlsEl || !movePadEl || !mobileLayoutEl) {
    return;
  }

  mobileLayoutEl.disabled = !state.mobile.enabled;
  touchControlsEl.classList.toggle("hidden", !state.mobile.enabled);

  mobileLayoutEl.addEventListener("change", () => {
    applyMobileLayout(mobileLayoutEl.value);
  });

  movePadEl.addEventListener("pointerdown", (event) => {
    if (!state.mobile.enabled) {
      return;
    }

    event.preventDefault();
    state.mobile.pointerId = event.pointerId;
    movePadEl.setPointerCapture(event.pointerId);
    updateTouchVectorFromPoint(event.clientX, event.clientY);
  });

  movePadEl.addEventListener("pointermove", (event) => {
    if (state.mobile.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    updateTouchVectorFromPoint(event.clientX, event.clientY);
  });

  const endTouch = (event) => {
    if (state.mobile.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    clearTouchInput();
  };

  movePadEl.addEventListener("pointerup", endTouch);
  movePadEl.addEventListener("pointercancel", endTouch);
  movePadEl.addEventListener("lostpointercapture", () => {
    clearTouchInput();
  });

  document.querySelectorAll(".touch-action-btn").forEach((btn) => {
    btn.addEventListener("pointerdown", (event) => {
      if (!state.mobile.enabled) {
        return;
      }
      event.preventDefault();
      triggerTouchAction(btn.dataset.touchAction);
    });
  });
}

function getMoveIntent() {
  let dx = 0;
  let dy = 0;

  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;

  if (state.mobile.enabled && state.mobile.touchActive) {
    if (dx === 0 && dy === 0) {
      dx = state.mobile.moveX;
      dy = state.mobile.moveY;
    } else {
      dx = clamp(dx + state.mobile.moveX, -1, 1);
      dy = clamp(dy + state.mobile.moveY, -1, 1);
    }
  }

  const mag = Math.hypot(dx, dy);
  if (mag > 0) {
    dx /= mag;
    dy /= mag;
  }

  return { dx, dy, active: mag > 0 };
}

function spawnParticle(x, y, vx, vy, life, size, color, gravity = 0, drag = 0) {
  state.particles.push({ x, y, vx, vy, life, maxLife: life, size, color, gravity, drag });
}

function spawnBurst(x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const a = randomRange(0, Math.PI * 2);
    const s = randomRange(speed * 0.4, speed);
    spawnParticle(
      x,
      y,
      Math.cos(a) * s,
      Math.sin(a) * s,
      randomRange(0.24, 0.6),
      randomRange(2, 5),
      color,
      240,
      1.8
    );
  }
}

function initEmbers() {
  state.embers = [];
  for (let i = 0; i < 85; i += 1) {
    state.embers.push({
      x: randomRange(0, canvas.width),
      y: randomRange(0, canvas.height),
      speed: randomRange(14, 45),
      drift: randomRange(-10, 10),
      size: randomRange(1, 2.8),
      phase: randomRange(0, Math.PI * 2)
    });
  }
}

function resetGame() {
  state.time = 0;
  state.lastTs = 0;
  state.status = "playing";
  state.logs = [];
  state.shake = 0;

  state.fireballs = [];
  state.iceShots = [];
  state.particles = [];
  state.slashes = [];

  state.player.x = 180;
  state.player.y = 428;
  state.player.faceX = 1;
  state.player.faceY = 0;
  state.player.hp = state.player.maxHp;
  state.player.slashCd = 0;
  state.player.dashCd = 0;
  state.player.iceCd = 0;
  state.player.dashTime = 0;
  state.player.dashVX = 0;
  state.player.dashVY = 0;
  state.player.invuln = 0;

  state.dragon.x = 748;
  state.dragon.y = 156;
  state.dragon.targetX = 748;
  state.dragon.targetTimer = 0.2;
  state.dragon.wingPhase = 0;
  state.dragon.hp = state.dragon.maxHp;
  state.dragon.attackCd = 1.1;
  state.dragon.slowTime = 0;
  state.dragon.enraged = false;
  state.dragon.hitFlash = 0;

  hideEnding();
  initEmbers();
  clearTouchInput();

  addLog("Ты входишь на арену. В небе кружит древний дракон.");
  addLog("Совет: держи дистанцию, бей мечом после рывка, сбивай темп льдом.");

  renderMeta();
  updateAbilityButtons();
  updateHint();
}

function dealDamageToPlayer(amount, reason) {
  if (state.status !== "playing" || state.player.invuln > 0) {
    return;
  }

  state.player.hp = Math.max(0, state.player.hp - amount);
  state.player.invuln = 0.85;
  state.shake = Math.max(state.shake, 0.32);
  tgImpact("rigid");
  spawnBurst(state.player.x, state.player.y - 18, "255,110,100", 14, 210);

  if (reason) {
    addLog(reason);
  }

  if (state.player.hp <= 0) {
    finishBattle(false);
  }
}

function dealDamageToDragon(amount, reason) {
  if (state.status !== "playing") {
    return;
  }

  state.dragon.hp = Math.max(0, state.dragon.hp - amount);
  state.dragon.hitFlash = 0.14;
  state.shake = Math.max(state.shake, 0.18);
  spawnBurst(state.dragon.x - 35, state.dragon.y + 10, "255,212,110", 18, 230);

  if (reason && Math.random() < 0.65) {
    addLog(reason);
  }

  if (state.dragon.hp <= 0) {
    finishBattle(true);
  }
}

function finishBattle(victory) {
  state.status = victory ? "win" : "lose";
  tgNotify(victory ? "success" : "error");

  if (victory) {
    addLog("Дракон повержен. Крепость снова видит рассвет.");
    for (let i = 0; i < 120; i += 1) {
      spawnParticle(
        canvas.width * 0.52,
        canvas.height * 0.42,
        randomRange(-220, 220),
        randomRange(-260, 60),
        randomRange(0.8, 1.5),
        randomRange(2, 6),
        i % 2 === 0 ? "255,220,140" : "120,210,255",
        240,
        0.9
      );
    }
    showEnding("🏆 Победа", "Ты победил дракона. Арена очищена от пламени.", "Новая битва");
  } else {
    addLog("Герой пал. Дракон снова захватил небо.");
    showEnding("💀 Поражение", "Пламя оказалось сильнее. Попробуй снова.", "Повторить бой");
  }

  renderMeta();
  updateHint();
  updateAbilityButtons();
}

function useSlash() {
  if (state.status !== "playing" || state.player.slashCd > 0) {
    return;
  }

  state.player.slashCd = COOLDOWNS.slash;
  tgImpact("light");
  state.slashes.push({
    x: state.player.x,
    y: state.player.y - 8,
    dirX: state.player.faceX,
    dirY: state.player.faceY,
    life: 0.18,
    maxLife: 0.18
  });

  spawnBurst(state.player.x + state.player.faceX * 34, state.player.y - 12, "255,238,190", 10, 160);

  const dx = state.dragon.x - (state.player.x + state.player.faceX * 42);
  const dy = state.dragon.y + 16 - (state.player.y - 8);
  const dist = Math.hypot(dx, dy);
  const forward = (dx * state.player.faceX + dy * state.player.faceY) / (dist || 1);

  if (dist < 176 && forward > 0.05) {
    dealDamageToDragon(randomRange(14, 20), "Клинок вспорол чешую дракона.");
  }
}

function useDash() {
  if (state.status !== "playing" || state.player.dashCd > 0) {
    return;
  }

  const intent = getMoveIntent();
  let dirX = intent.dx;
  let dirY = intent.dy;

  if (!intent.active) {
    dirX = state.player.faceX;
    dirY = state.player.faceY;
  }

  const len = Math.hypot(dirX, dirY) || 1;
  dirX /= len;
  dirY /= len;

  state.player.dashCd = COOLDOWNS.dash;
  tgImpact("medium");
  state.player.dashTime = 0.17;
  state.player.dashVX = dirX * 650;
  state.player.dashVY = dirY * 650;
  state.player.invuln = Math.max(state.player.invuln, 0.24);

  for (let i = 0; i < 12; i += 1) {
    spawnParticle(
      state.player.x,
      state.player.y + 16,
      randomRange(-100, 100),
      randomRange(-40, 80),
      randomRange(0.2, 0.5),
      randomRange(2, 4),
      "180,215,255",
      180,
      1.4
    );
  }
}

function useIceShot() {
  if (state.status !== "playing" || state.player.iceCd > 0) {
    return;
  }

  state.player.iceCd = COOLDOWNS.ice;
  tgImpact("light");

  let dirX = state.dragon.x - state.player.x;
  let dirY = state.dragon.y - 18 - state.player.y;
  const len = Math.hypot(dirX, dirY) || 1;
  dirX /= len;
  dirY /= len;

  state.iceShots.push({
    x: state.player.x + state.player.faceX * 18,
    y: state.player.y - 18,
    vx: dirX * 470,
    vy: dirY * 470,
    r: 7,
    life: 2
  });

  spawnBurst(state.player.x + state.player.faceX * 18, state.player.y - 18, "130,220,255", 8, 120);
}

function dragonBreathAttack() {
  const count = state.dragon.enraged ? 4 : 3;

  const aimX = state.player.x - state.dragon.x;
  const aimY = state.player.y - 20 - state.dragon.y;
  const base = Math.atan2(aimY, aimX);
  const spread = state.dragon.enraged ? 0.33 : 0.2;

  for (let i = 0; i < count; i += 1) {
    const angle = base + (i - (count - 1) * 0.5) * spread;
    const speed = randomRange(205, 285) * (state.dragon.enraged ? 1.15 : 1);

    state.fireballs.push({
      x: state.dragon.x - 86,
      y: state.dragon.y + 16,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: randomRange(10, 14),
      life: 4
    });
  }

  spawnBurst(state.dragon.x - 86, state.dragon.y + 16, "255,160,75", 18, 230);

  if (Math.random() < 0.45) {
    addLog("Дракон выдыхает залп пламени.");
  }
}

function updateEmbers(dt) {
  state.embers.forEach((ember) => {
    ember.y -= ember.speed * dt;
    ember.x += (ember.drift + Math.sin(state.time * 2 + ember.phase) * 6) * dt;

    if (ember.y < -10) {
      ember.y = canvas.height + randomRange(4, 30);
      ember.x = randomRange(-20, canvas.width + 20);
      ember.speed = randomRange(14, 45);
    }

    if (ember.x < -20) ember.x = canvas.width + 20;
    if (ember.x > canvas.width + 20) ember.x = -20;
  });
}

function updatePlayer(dt) {
  const p = state.player;

  p.slashCd = Math.max(0, p.slashCd - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.iceCd = Math.max(0, p.iceCd - dt);
  p.invuln = Math.max(0, p.invuln - dt);

  if (p.dashTime > 0) {
    p.dashTime -= dt;
    p.x += p.dashVX * dt;
    p.y += p.dashVY * dt;

    spawnParticle(
      p.x - p.faceX * 6,
      p.y + 12,
      randomRange(-50, 50),
      randomRange(-10, 40),
      randomRange(0.15, 0.35),
      randomRange(1.6, 3.2),
      "180,220,255",
      130,
      1.5
    );
  } else if (state.status === "playing") {
    const move = getMoveIntent();

    if (move.active) {
      p.x += move.dx * p.speed * dt;
      p.y += move.dy * p.speed * dt;

      p.faceX = move.dx;
      p.faceY = move.dy;
    }
  }

  p.x = clamp(p.x, 40, canvas.width - 40);
  p.y = clamp(p.y, 244, canvas.height - 34);
}

function updateDragon(dt) {
  const d = state.dragon;

  d.hitFlash = Math.max(0, d.hitFlash - dt);
  d.slowTime = Math.max(0, d.slowTime - dt);
  d.wingPhase += dt * (d.enraged ? 14 : 10);

  if (state.status !== "playing") {
    return;
  }

  if (!d.enraged && d.hp < d.maxHp * 0.45) {
    d.enraged = true;
    addLog("Дракон впадает в ярость. Темп атаки растет.");
  }

  d.targetTimer -= dt;
  if (d.targetTimer <= 0) {
    d.targetTimer = randomRange(1.2, 2.2);
    d.targetX = randomRange(590, 860);
  }

  const slowFactor = d.slowTime > 0 ? 0.48 : 1;
  const speedFactor = (d.enraged ? 1.3 : 1) * slowFactor;

  d.x += (d.targetX - d.x) * dt * 1.75 * speedFactor;
  d.y = 152 + Math.sin(state.time * 2.4) * 24 + (d.enraged ? Math.sin(state.time * 6.2) * 5 : 0);

  d.attackCd -= dt;
  if (d.attackCd <= 0) {
    dragonBreathAttack();
    d.attackCd = randomRange(1.2, 2.1) / (d.enraged ? 1.35 : 1);
  }

  const hitDist = Math.hypot(state.player.x - d.x, state.player.y - (d.y + 18));
  if (hitDist < 84) {
    dealDamageToPlayer(10, "Дракон задел тебя крылом.");
  }
}

function updateProjectiles(dt) {
  for (let i = state.fireballs.length - 1; i >= 0; i -= 1) {
    const fire = state.fireballs[i];
    fire.x += fire.vx * dt;
    fire.y += fire.vy * dt;
    fire.vy += 26 * dt;
    fire.life -= dt;

    spawnParticle(
      fire.x,
      fire.y,
      randomRange(-22, 22),
      randomRange(-20, 30),
      randomRange(0.12, 0.24),
      randomRange(2, 3.8),
      "255,145,65",
      130,
      1.2
    );

    const hitPlayer = Math.hypot(fire.x - state.player.x, fire.y - (state.player.y - 12)) < fire.r + state.player.r;

    if (hitPlayer) {
      state.fireballs.splice(i, 1);
      spawnBurst(fire.x, fire.y, "255,120,70", 18, 220);
      dealDamageToPlayer(14, "Пламя попало в героя.");
      continue;
    }

    const out =
      fire.life <= 0 ||
      fire.x < -80 ||
      fire.x > canvas.width + 80 ||
      fire.y < -80 ||
      fire.y > canvas.height + 80;

    if (out) {
      state.fireballs.splice(i, 1);
      spawnBurst(fire.x, fire.y, "255,120,60", 8, 130);
    }
  }

  for (let i = state.iceShots.length - 1; i >= 0; i -= 1) {
    const ice = state.iceShots[i];
    ice.x += ice.vx * dt;
    ice.y += ice.vy * dt;
    ice.life -= dt;

    spawnParticle(
      ice.x,
      ice.y,
      randomRange(-12, 12),
      randomRange(-14, 14),
      randomRange(0.14, 0.26),
      randomRange(1.5, 2.8),
      "120,210,255",
      60,
      1.0
    );

    const hitDragon = Math.hypot(ice.x - state.dragon.x, ice.y - (state.dragon.y + 16)) < ice.r + 72;
    if (hitDragon) {
      state.iceShots.splice(i, 1);
      state.dragon.slowTime = Math.max(state.dragon.slowTime, 0.8);
      dealDamageToDragon(10, "Ледяная стрела впилась в дракона.");
      spawnBurst(ice.x, ice.y, "140,225,255", 14, 180);
      continue;
    }

    const out =
      ice.life <= 0 ||
      ice.x < -60 ||
      ice.x > canvas.width + 60 ||
      ice.y < -60 ||
      ice.y > canvas.height + 60;

    if (out) {
      state.iceShots.splice(i, 1);
    }
  }
}

function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= dt;

    if (p.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }

    p.vx -= p.vx * p.drag * dt;
    p.vy -= p.vy * p.drag * dt;
    p.vy += p.gravity * dt;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

function updateSlashes(dt) {
  for (let i = state.slashes.length - 1; i >= 0; i -= 1) {
    const slash = state.slashes[i];
    slash.life -= dt;
    if (slash.life <= 0) {
      state.slashes.splice(i, 1);
    }
  }
}

function update(dt) {
  state.time += dt;
  state.shake = Math.max(0, state.shake - dt * 2.2);

  updateEmbers(dt);
  updatePlayer(dt);
  updateDragon(dt);
  updateProjectiles(dt);
  updateParticles(dt);
  updateSlashes(dt);

  state.uiTextTick -= dt;
  if (state.uiTextTick <= 0) {
    renderMeta();
    updateAbilityButtons();
    updateHint();
    state.uiTextTick = 0.08;
  }
}

function drawSky() {
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#2e1320");
  sky.addColorStop(0.58, "#7f3429");
  sky.addColorStop(1, "#2a1612");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const sun = ctx.createRadialGradient(730, 94, 16, 730, 94, 180);
  sun.addColorStop(0, "rgba(255, 197, 102, 0.62)");
  sun.addColorStop(1, "rgba(255, 197, 102, 0)");
  ctx.fillStyle = sun;
  ctx.fillRect(550, -40, 360, 280);

  ctx.fillStyle = "rgba(30, 16, 25, 0.42)";
  for (let i = 0; i < 5; i += 1) {
    const x = 90 + i * 180 + Math.sin(state.time * 0.22 + i) * 18;
    const y = 95 + i * 7;
    ctx.beginPath();
    ctx.ellipse(x, y, 70, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMountains() {
  ctx.fillStyle = "#2f1e22";
  ctx.beginPath();
  ctx.moveTo(0, 340);
  ctx.lineTo(120, 190);
  ctx.lineTo(220, 300);
  ctx.lineTo(370, 160);
  ctx.lineTo(510, 292);
  ctx.lineTo(670, 172);
  ctx.lineTo(810, 290);
  ctx.lineTo(960, 220);
  ctx.lineTo(960, 540);
  ctx.lineTo(0, 540);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#47292b";
  ctx.beginPath();
  ctx.moveTo(0, 374);
  ctx.lineTo(150, 250);
  ctx.lineTo(290, 330);
  ctx.lineTo(430, 238);
  ctx.lineTo(580, 344);
  ctx.lineTo(740, 255);
  ctx.lineTo(900, 338);
  ctx.lineTo(960, 304);
  ctx.lineTo(960, 540);
  ctx.lineTo(0, 540);
  ctx.closePath();
  ctx.fill();
}

function drawGround() {
  ctx.fillStyle = "#2a1a16";
  ctx.fillRect(0, 360, canvas.width, canvas.height - 360);

  for (let i = 0; i < 15; i += 1) {
    const x = i * 72 + (Math.sin(state.time * 0.9 + i) * 10 + 20);
    const glow = 0.38 + Math.sin(state.time * 5 + i) * 0.18;

    ctx.strokeStyle = `rgba(255, 117, 56, ${glow})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 374);
    ctx.lineTo(x - 18, 424);
    ctx.lineTo(x + 12, 464);
    ctx.lineTo(x - 12, 518);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255, 132, 68, 0.18)";
  ctx.fillRect(0, 352, canvas.width, 8);
}

function drawEmbers() {
  state.embers.forEach((ember) => {
    const alpha = 0.2 + (canvas.height - ember.y) / canvas.height * 0.55;
    ctx.fillStyle = `rgba(255, 180, 95, ${alpha})`;
    ctx.beginPath();
    ctx.arc(ember.x, ember.y, ember.size, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawDragon() {
  const d = state.dragon;
  const wing = Math.sin(d.wingPhase) * 34;

  ctx.fillStyle = "rgba(10, 10, 14, 0.35)";
  ctx.beginPath();
  ctx.ellipse(d.x - 10, 372, 122, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#341616";
  ctx.beginPath();
  ctx.moveTo(d.x - 32, d.y + 20);
  ctx.lineTo(d.x - 162, d.y - 38 - wing);
  ctx.lineTo(d.x - 128, d.y + 36 + wing * 0.3);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#4b1f20";
  ctx.beginPath();
  ctx.moveTo(d.x - 12, d.y + 18);
  ctx.lineTo(d.x + 120, d.y - 44 + wing * 0.9);
  ctx.lineTo(d.x + 106, d.y + 34 - wing * 0.2);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#2a0f12";
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(d.x - 42, d.y + 28);
  ctx.quadraticCurveTo(d.x - 150, d.y + 58, d.x - 210, d.y + 26 + Math.sin(state.time * 4) * 12);
  ctx.stroke();

  const body = ctx.createLinearGradient(d.x - 100, d.y, d.x + 90, d.y + 40);
  body.addColorStop(0, "#6c2523");
  body.addColorStop(0.55, "#8c332e");
  body.addColorStop(1, "#5b1e1c");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(d.x, d.y + 14, 90, 56, -0.02, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#7f2b28";
  ctx.beginPath();
  ctx.ellipse(d.x + 66, d.y - 10, 32, 24, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = d.enraged ? "#ff5640" : "#ffd072";
  ctx.beginPath();
  ctx.arc(d.x + 78, d.y - 14, 4.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ead9c0";
  ctx.beginPath();
  ctx.moveTo(d.x + 90, d.y - 42);
  ctx.lineTo(d.x + 97, d.y - 58);
  ctx.lineTo(d.x + 102, d.y - 40);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(d.x + 62, d.y - 44);
  ctx.lineTo(d.x + 68, d.y - 60);
  ctx.lineTo(d.x + 73, d.y - 42);
  ctx.closePath();
  ctx.fill();

  if (d.attackCd < 0.32 && state.status === "playing") {
    const breath = ctx.createRadialGradient(d.x + 94, d.y + 4, 4, d.x + 94, d.y + 4, 48);
    breath.addColorStop(0, "rgba(255, 186, 98, 0.75)");
    breath.addColorStop(1, "rgba(255, 186, 98, 0)");
    ctx.fillStyle = breath;
    ctx.beginPath();
    ctx.arc(d.x + 94, d.y + 4, 48, 0, Math.PI * 2);
    ctx.fill();
  }

  if (d.hitFlash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${d.hitFlash * 1.8})`;
    ctx.beginPath();
    ctx.ellipse(d.x, d.y + 8, 100, 64, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer() {
  const p = state.player;
  const blink = p.invuln > 0 && Math.floor(state.time * 24) % 2 === 0;

  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 22, 24, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  if (blink) {
    ctx.globalAlpha = 0.45;
  }

  const moving = input.left || input.right || input.up || input.down || state.mobile.touchActive;
  const step = Math.sin(state.time * 12) * (moving ? 2 : 0);

  ctx.fillStyle = "#f3ceb0";
  ctx.beginPath();
  ctx.arc(p.x, p.y - 24, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#31598d";
  ctx.fillRect(p.x - 12, p.y - 12, 24, 30);

  ctx.fillStyle = "#23374f";
  ctx.fillRect(p.x - 10, p.y + 18, 8, 16 + step);
  ctx.fillRect(p.x + 2, p.y + 18, 8, 16 - step);

  ctx.strokeStyle = "#dce7f5";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(p.x + p.faceX * 4, p.y - 4 + p.faceY * 4);
  ctx.lineTo(p.x + p.faceX * 28, p.y - 15 + p.faceY * 14);
  ctx.stroke();

  ctx.strokeStyle = "#9dc2e6";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x + p.faceX * 28, p.y - 15 + p.faceY * 14);
  ctx.lineTo(p.x + p.faceX * 42, p.y - 18 + p.faceY * 16);
  ctx.stroke();

  ctx.fillStyle = "#121212";
  ctx.beginPath();
  ctx.arc(p.x - 4 + p.faceX * 1.5, p.y - 26 + p.faceY * 1.5, 1.8, 0, Math.PI * 2);
  ctx.arc(p.x + 4 + p.faceX * 1.5, p.y - 26 + p.faceY * 1.5, 1.8, 0, Math.PI * 2);
  ctx.fill();

  if (blink) {
    ctx.globalAlpha = 1;
  }
}

function drawFireballs() {
  state.fireballs.forEach((fire) => {
    const glow = ctx.createRadialGradient(fire.x, fire.y, 2, fire.x, fire.y, fire.r * 2.3);
    glow.addColorStop(0, "rgba(255, 230, 130, 0.8)");
    glow.addColorStop(1, "rgba(255, 100, 45, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(fire.x, fire.y, fire.r * 2.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ff7f45";
    ctx.beginPath();
    ctx.arc(fire.x, fire.y, fire.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawIceShots() {
  state.iceShots.forEach((ice) => {
    const glow = ctx.createRadialGradient(ice.x, ice.y, 1, ice.x, ice.y, 16);
    glow.addColorStop(0, "rgba(215,245,255,0.95)");
    glow.addColorStop(1, "rgba(105,200,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ice.x, ice.y, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#9ae5ff";
    ctx.beginPath();
    ctx.arc(ice.x, ice.y, ice.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawSlashes() {
  state.slashes.forEach((slash) => {
    const t = slash.life / slash.maxLife;
    const radius = 62 + (1 - t) * 34;
    const centerAngle = Math.atan2(slash.dirY, slash.dirX);

    ctx.strokeStyle = `rgba(235, 246, 255, ${t * 0.9})`;
    ctx.lineWidth = 7 * t;
    ctx.beginPath();
    ctx.arc(
      slash.x + slash.dirX * 18,
      slash.y + slash.dirY * 18,
      radius,
      centerAngle - 0.72,
      centerAngle + 0.72
    );
    ctx.stroke();
  });
}

function drawParticles() {
  state.particles.forEach((p) => {
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = `rgba(${p.color},${alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawHealthBars() {
  const panelW = 270;
  const panelH = 20;

  ctx.fillStyle = "rgba(10, 12, 16, 0.72)";
  ctx.fillRect(16, 12, panelW + 18, 56);
  ctx.fillRect(canvas.width - panelW - 34, 12, panelW + 18, 56);

  ctx.fillStyle = "#e7edf8";
  ctx.font = "bold 13px Trebuchet MS";
  ctx.textAlign = "left";
  ctx.fillText("Герой", 24, 30);

  ctx.textAlign = "right";
  ctx.fillText("Дракон", canvas.width - 24, 30);

  const pRatio = state.player.hp / state.player.maxHp;
  const dRatio = state.dragon.hp / state.dragon.maxHp;

  ctx.fillStyle = "#27171a";
  ctx.fillRect(24, 38, panelW, panelH);
  ctx.fillRect(canvas.width - panelW - 24, 38, panelW, panelH);

  ctx.fillStyle = "#64d6ff";
  ctx.fillRect(24, 38, panelW * pRatio, panelH);

  ctx.fillStyle = state.dragon.enraged ? "#ff4f48" : "#ff8a55";
  ctx.fillRect(canvas.width - panelW - 24, 38, panelW * dRatio, panelH);

  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.strokeRect(24, 38, panelW, panelH);
  ctx.strokeRect(canvas.width - panelW - 24, 38, panelW, panelH);
}

function drawCooldownOverlay() {
  const baseX = 22;
  const baseY = canvas.height - 68;
  const barW = 136;
  const barH = 8;

  const entries = [
    { name: "Меч", cd: state.player.slashCd, max: COOLDOWNS.slash },
    { name: "Лед", cd: state.player.iceCd, max: COOLDOWNS.ice },
    { name: "Рывок", cd: state.player.dashCd, max: COOLDOWNS.dash }
  ];

  entries.forEach((entry, index) => {
    const y = baseY + index * 18;
    const ratio = clamp(1 - entry.cd / entry.max, 0, 1);

    ctx.fillStyle = "rgba(12, 15, 22, 0.78)";
    ctx.fillRect(baseX, y, barW, barH);

    ctx.fillStyle = entry.name === "Рывок" ? "#9dcfff" : "#ffd08f";
    ctx.fillRect(baseX, y, barW * ratio, barH);

    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.strokeRect(baseX, y, barW, barH);

    ctx.fillStyle = "#f5f0e6";
    ctx.font = "11px Trebuchet MS";
    ctx.textAlign = "left";
    ctx.fillText(entry.name, baseX + barW + 8, y + 7);
  });
}

function renderScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  if (state.shake > 0) {
    ctx.translate((Math.random() - 0.5) * state.shake * 16, (Math.random() - 0.5) * state.shake * 16);
  }

  drawSky();
  drawMountains();
  drawGround();
  drawEmbers();
  drawDragon();
  drawFireballs();
  drawIceShots();
  drawSlashes();
  drawPlayer();
  drawParticles();

  ctx.restore();

  drawHealthBars();
  drawCooldownOverlay();
}

function tick(ts) {
  if (!state.lastTs) {
    state.lastTs = ts;
  }

  const dt = Math.min(0.033, (ts - state.lastTs) / 1000);
  state.lastTs = ts;

  update(dt);
  renderScene();

  requestAnimationFrame(tick);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (key === "w" || event.key === "ArrowUp") input.up = true;
  if (key === "s" || event.key === "ArrowDown") input.down = true;
  if (key === "a" || event.key === "ArrowLeft") input.left = true;
  if (key === "d" || event.key === "ArrowRight") input.right = true;

  if (event.code === "Space") {
    event.preventDefault();
    useSlash();
  }

  if (key === "q") {
    useIceShot();
  }

  if (key === "shift") {
    useDash();
  }

  if (key === "r") {
    resetGame();
  }

  if (key === "f") {
    event.preventDefault();
    toggleFullscreenMode();
  }
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (key === "w" || event.key === "ArrowUp") input.up = false;
  if (key === "s" || event.key === "ArrowDown") input.down = false;
  if (key === "a" || event.key === "ArrowLeft") input.left = false;
  if (key === "d" || event.key === "ArrowRight") input.right = false;
});

nextLevelBtn.addEventListener("click", () => {
  resetGame();
});

createAbilityButtons();
initTouchControls();
initTelegramBindings();
initFullscreenControl();
resetGame();
requestAnimationFrame(tick);





































