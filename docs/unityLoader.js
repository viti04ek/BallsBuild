let unityInstance = null;
var unityInstanceRef = null;
var unsubscribe = null;

const SW_VERSION = 'v3';
const SW_URL = `ServiceWorker.js?${SW_VERSION}`;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (let i = 0; i < regs.length; i++) {
        const url = regs[i].active?.scriptURL || '';
        if (url.includes('ServiceWorker.js') && !url.includes(SW_URL)) {
          await regs[i].unregister();
        }
      }
    } catch (err) {
      console.warn('Service worker cleanup failed:', err);
    }

    navigator.serviceWorker.register(SW_URL).catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

const canvas = document.querySelector("#unity-canvas");
const loader = document.getElementById("loader");
const errorBox = document.getElementById("error-message");

const bubbleTrack = document.getElementById("bubble-track");
const BUBBLE_COUNT = 12;
const bubbles = [];

const stage  = document.getElementById('stage');
const ASPECT_DESKTOP = 10 / 16;
const PAD_H = 0;
const TARGET_DPR_MIN = 1.0;
const TARGET_DPR_MAX = 2.0;
const QUALITY        = 1.25;
const STEP_PX        = 128;
const REF_H_MIN      = 960;
const REF_H_MAX      = 2048;
const FILL_MODE      = 'cover';

let cachedSafeArea = null;
let cachedDPR = null;
let lastViewportSize = null;
let isLayouting = false;
let isResizing = false;
let resizeTimeout;
let telegramViewportStable = false;

for (let i = 0; i < BUBBLE_COUNT; i++) {
  const b = document.createElement("div");
  b.className = "bubble";
  bubbleTrack.appendChild(b);
  bubbles.push(b);
}

function showError(message){ errorBox.style.display="block"; errorBox.innerHTML=message; }

const buildUrl = "Build";
const reloadNonce = new URLSearchParams(window.location.search).get('reload') || '';
const assetVersion = (typeof window !== 'undefined' && window.__assetVersion) ? String(window.__assetVersion) : '';
const buildNonce = reloadNonce || assetVersion;
const buildQuery = buildNonce ? `?v=${encodeURIComponent(buildNonce)}` : '';
const config = {
  dataUrl: buildUrl + "/Balls.data.unityweb" + buildQuery,
  frameworkUrl: buildUrl + "/Balls.framework.js.unityweb" + buildQuery,
  codeUrl: buildUrl + "/Balls.wasm.unityweb" + buildQuery,
  streamingAssetsUrl: "StreamingAssets",
  companyName: "DefaultCompany",
  productName: "balls",
  productVersion: "0.1.0"
};

config.matchWebGLToCanvasSize = false;
config.devicePixelRatio = 1;
const __initialDpr = !isMobileLike() ? getDesktopEffectiveDPR() : 1;
config.devicePixelRatio = __initialDpr;

const BG_PARAMS = {
  color1: '#080030',
  color2: '#000000',
  angle: 125,
  frequency: 2,
  spacing: 1.5,
  offset: 0.15
};

const bgCanvas = document.getElementById('bg-waves');
const bgCtx = bgCanvas.getContext('2d', { alpha:false, desynchronized:true });
if (!bgCtx) bgCtx = bgCanvas.getContext('2d');

function hexToRgb(h){
  const s = h.replace('#','');
  const n = parseInt(s.length===3 ? s.split('').map(c=>c+c).join('') : s, 16);
  return [ (n>>16)&255, (n>>8)&255, n&255 ];
}

function drawDiagonalWaves(params = BG_PARAMS){
  const { vw, vh } = getViewportSize();
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  const W = Math.max(1, Math.round(vw * dpr));
  const H = Math.max(1, Math.round(vh * dpr));
  if (bgCanvas.width !== W || bgCanvas.height !== H){
    bgCanvas.width = W; bgCanvas.height = H;
    bgCanvas.style.width  = vw + 'px';
    bgCanvas.style.height = vh + 'px';
  }

  const c1 = hexToRgb(params.color1);
  const c2 = hexToRgb(params.color2);

  const rad = params.angle * Math.PI / 180;
  const dirx = Math.cos(rad);
  const diry = Math.sin(rad);

  const freq    = params.frequency;
  const spacing = params.spacing;
  const offset  = params.offset;

  const img = bgCtx.createImageData(W, H);
  const data = img.data;

  for (let y = 0; y < H; y++){
    const v = 1 - (y / (H - 1));
    let row = y * W * 4;
    for (let x = 0; x < W; x++){
      const u = x / (W - 1);

      let t = (u * dirx + v * diry);
      t = (t * freq * spacing + offset) * Math.PI;

      const w = 0.5 + 0.5 * Math.sin(t);

      data[row++] = Math.round(c1[0] * (1 - w) + c2[0] * w);
      data[row++] = Math.round(c1[1] * (1 - w) + c2[1] * w);
      data[row++] = Math.round(c1[2] * (1 - w) + c2[2] * w);
      data[row++] = 255;
    }
  }
  bgCtx.putImageData(img, 0, 0);
}

let backgroundCache = null;

function redrawBackground(){ drawDiagonalWaves(); }

function getSafeTopFromTelegram() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return 0;

  const csi = tg.contentSafeAreaInset || tg.contentSafeAreaInsets;
  const si  = tg.safeAreaInset        || tg.safeAreaInsets;

  let top = 0;
  if (csi && typeof csi.top === 'number') top = csi.top;
  else if (si && typeof si.top === 'number') top = si.top;

  if (!top) {
    const css = getComputedStyle(document.documentElement);
    const cssTop = parseFloat(css.getPropertyValue('--sat')) || 0;
    const tgH = tg?.viewportStableHeight || tg?.viewportHeight || window.innerHeight;
    const overlayTotal = Math.max(0, window.innerHeight - tgH);
    top = Math.round(cssTop + overlayTotal);
  }
  return Math.max(0, Math.round(top));
}

function sendSafeAreaToUnity(){
  const px = getSafeTopFromTelegram();
  if (window.unityInstance){
    try { window.unityInstance.SendMessage('PlayerDataManager','SetSafeArea', String(px)); } catch {}
  }
}

function hookTelegramSafeArea(){
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  try { tg.requestContentSafeArea?.(); } catch {}
  try { tg.requestSafeArea?.(); } catch {}

  sendSafeAreaToUnity();

  const onChange = () => sendSafeAreaToUnity();

  tg.onEvent?.('contentSafeAreaChanged', onChange);
  tg.onEvent?.('safeAreaChanged', onChange);
  tg.onEvent?.('fullscreenChanged', onChange);
  tg.onEvent?.('viewportChanged', (e)=>{ if (!e || e.isStateStable === undefined || e.isStateStable) onChange(); });

  tg.onEvent?.('content_safe_area_changed', onChange);
  tg.onEvent?.('safe_area_changed', onChange);
}

hookTelegramSafeArea();

function getViewportSize() {
  const tg = window.Telegram?.WebApp;
  let vh = window.innerHeight;
  let vw = window.innerWidth;

  if (tg) {
    const stable = tg.viewportStableHeight || tg.viewportHeight;
    if (stable && stable > 200) vh = stable;
  }
  return { vw, vh };
}

function getStableDPR() {
  const currentSize = `${window.innerWidth}x${window.innerHeight}`;
  
  if (cachedDPR && lastViewportSize === currentSize) {
    return cachedDPR;
  }
  
  const dpr = window.devicePixelRatio || 1;
  const stableDPR = Math.min(Math.max(dpr, 1), 2);
  
  cachedDPR = stableDPR;
  lastViewportSize = currentSize;
  
  return stableDPR;
}

function getEffectiveDPR() {
  return getStableDPR();
}

function isMobileLike(){
  if (window.Telegram?.WebApp && typeof Telegram.WebApp.isDesktop === 'boolean')
    return !Telegram.WebApp.isDesktop;
  return matchMedia('(pointer:coarse)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

/*function layoutStage(){
  const { vw, vh } = getViewportSize();
  const mobile = isMobileLike();

  if (mobile) {
    stage.style.width  = '100vw';
    stage.style.height = '100dvh';
  } else {
    let targetH = vh;
    let targetW = targetH * ASPECT_DESKTOP;

    const maxW = vw * (1 - PAD_H*2);
    if (targetW > maxW) {
      targetW = maxW;
      targetH = targetW / ASPECT_DESKTOP;
    }

    stage.style.width  = `${targetW}px`;
    stage.style.height = `${targetH}px`;
  }

  const r = stage.getBoundingClientRect();

  const dpr = getEffectiveDPR();
  const w = Math.round(r.width  * dpr);
  const h = Math.round(r.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width  = w;
    canvas.height = h;

    try {
      if (unityInstance?.Module?.setCanvasSize) {
        unityInstance.Module.setCanvasSize(w, h);
      }
    } catch {}
  }
}*/

function layoutStageDesktop(){
  const { vw, vh } = getViewportSize();
  let h = vh;
  let w = h * ASPECT_DESKTOP;
  const maxW = vw * (1 - PAD_H*2);
  if (w > maxW) { w = maxW; h = w / ASPECT_DESKTOP; }
  stage.style.width  = `${w}px`;
  stage.style.height = `${h}px`;

  const dpr = getStableDPR();
  const targetW = Math.round(w * dpr);
  const targetH = Math.round(h * dpr);
  ensureCanvasBackbuffer(targetW, targetH);
}

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function roundToStep(v, step){ return Math.round(v / step) * step; }

function getDesktopEffectiveDPR() {
  let dpr = window.devicePixelRatio || 1;
  if (window.visualViewport && typeof window.visualViewport.scale === 'number') {
    dpr *= window.visualViewport.scale;
  }
  return clamp(dpr, TARGET_DPR_MIN, TARGET_DPR_MAX);
}

function pickMobileRefSize() {
  const r = stage.getBoundingClientRect();

  const deviceDpr = clamp(window.devicePixelRatio || 1, TARGET_DPR_MIN, TARGET_DPR_MAX);
  let refH = r.height * deviceDpr * QUALITY;
  refH = clamp(refH, REF_H_MIN, REF_H_MAX);
  refH = roundToStep(refH, STEP_PX);

  const refW = Math.round(refH * (9/18));
  return { refW, refH, stageW: r.width, stageH: r.height };
}

function applyMobileScale(refW, refH, stageW, stageH){
  canvas.classList.add('mobile-scale');

  canvas.style.width  = `${refW}px`;
  canvas.style.height = `${refH}px`;

  let sx = stageW / refW;
  let sy = stageH / refH;
  let s  = (FILL_MODE === 'cover') ? Math.max(sx, sy) : Math.min(sx, sy);

  canvas.style.transform = `translate(-50%, -50%) scale(${s})`;
}

function layoutStageMobile(){
  const { refW, refH, stageW, stageH } = pickMobileRefSize();
  applyMobileScale(refW, refH, stageW, stageH);
  ensureCanvasBackbuffer(refW, refH);
}

function layoutStage(){
  if (isLayouting) return;
  isLayouting = true;

  if (isMobileLike()) {
    layoutStageMobile();
  } else {
    canvas.classList.remove('mobile-scale');
    canvas.style.transform = '';
    canvas.style.width = '';
    canvas.style.height = '';
    layoutStageDesktop();
    /*const r = stage.getBoundingClientRect();
    const dpr = getDesktopEffectiveDPR();
    const targetW = Math.round(r.width  * dpr);
    const targetH = Math.round(r.height * dpr);
    ensureCanvasBackbuffer(targetW, targetH);*/
  }
}

function ensureCanvasBackbuffer(targetW, targetH){
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width  = targetW;
    canvas.height = targetH;
    try { unityInstance?.Module?.setCanvasSize?.(targetW, targetH); } catch {}
  }
}

/*function bounceResizeStable(retries = [0, 60, 180, 360]) {
  layoutStage();
  for (const t of retries) setTimeout(layoutStage, t);
}*/

function debouncedResize() {
  if (isResizing) return;
  isResizing = true;
  
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    layoutStage();
    redrawBackground();
    sendSafeAreaToUnity();
    isResizing = false;
  }, 100); // Увеличиваем до 100ms для стабильности
}

// Стабильная версия bounce без множественных setTimeout
function stableLayout() {
  if (isLayouting) return;
  isLayouting = true;
  
  layoutStage();
  redrawBackground();
  sendSafeAreaToUnity();
  
  setTimeout(() => {
    isLayouting = false;
  }, 50);
}

// Инициализация
stableLayout();

window.addEventListener('resize', debouncedResize);
window.addEventListener('orientationchange', debouncedResize);
document.addEventListener('visibilitychange', () => { 
  if (!document.hidden) { 
    debouncedResize(); 
  }
});
window.addEventListener('pageshow', debouncedResize);

try {
  if (window.Telegram?.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();

    const tgVersion = Telegram.WebApp.version;
    const tgVersionNumber = parseFloat(tgVersion);
    if (!Number.isNaN(tgVersionNumber) && tgVersionNumber >= 7.7 && typeof Telegram.WebApp.disableVerticalSwipes === 'function') {
      Telegram.WebApp.disableVerticalSwipes();
      console.log(`Telegram WebApp vertical swipes disabled (version ${tgVersion})`);
    }
    
    // Только один вызов после инициализации
    requestAnimationFrame(() => { 
      debouncedResize(); 
    });
    
    // Стабильный обработчик viewport с проверкой стабильности
    Telegram.WebApp.onEvent('viewportChanged', (e) => {
      if (e && e.isStateStable === true && !telegramViewportStable) {
        telegramViewportStable = true;
        debouncedResize();
      }
    });
  }
} catch (error) {
  console.warn('Telegram WebApp initialization failed:', error);
}

function isMobileTelegram() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return false;
  if (tg.platform === 'android' || tg.platform === 'ios') return true;
  if (typeof tg.isDesktop === 'boolean') return !tg.isDesktop;
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

function isMobileTelegramStrict() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return false;
  if (tg.platform === 'android' || tg.platform === 'ios') return true;
  if (typeof tg.isDesktop === 'boolean') return !tg.isDesktop;
  return false;
}

let _fsDone = false;
let _fsTriedAuto = false;
async function requestFullscreenNow() {
  if (_fsDone) return;
  const tg = window.Telegram?.WebApp;
  if (!tg || !isMobileTelegramStrict()) return;

  try { tg.ready?.(); } catch {}
  try { tg.expand?.(); } catch {}
  try { tg.setHeaderColor?.('bg_color'); } catch {}

  if (typeof tg.requestFullscreen === 'function') {
    try { 
      await tg.requestFullscreen();
      _fsDone = true;
    } catch (_) { }
  }
  _fsTriedAuto = true;
}

function armInteractiveFullscreenOnce(){
  if (!isMobileTelegramStrict()) return;
  const once = async () => {
    if (_fsDone) return;
    try {
      await window.Telegram?.WebApp?.requestFullscreen?.();
      _fsDone = true;
    } catch {}
    window.removeEventListener('pointerup', once, { capture:true });
    window.removeEventListener('click', once, { capture:true });
    window.removeEventListener('touchend', once, { capture:true });
  };
  window.addEventListener('pointerup', once, { passive:true, capture:true, once:true });
  window.addEventListener('click',     once, { passive:true, capture:true, once:true });
  window.addEventListener('touchend',  once, { passive:true, capture:true, once:true });
}

if (isMobileTelegramStrict()) {
  requestFullscreenNow();
  setTimeout(requestFullscreenNow, 120);
  requestAnimationFrame(() => setTimeout(requestFullscreenNow, 0));
}

try {
  if (window.Telegram?.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.onEvent('viewportChanged', (e) => {
      if (e && e.isStateStable === true && !telegramViewportStable) {
        telegramViewportStable = true;
        requestFullscreenNow();         // авто-попытка
        if (!_fsDone) armInteractiveFullscreenOnce(); // запаска по жесту
      }
    });
  }
} catch {}

try {
  window.Telegram?.WebApp?.onEvent?.('fullscreenFailed', ({ error }) => {
    console.log('Telegram fullscreen failed:', error);
  });
} catch {}

function updateBubbles(progress){
  const total = BUBBLE_COUNT;
  const p = Math.max(0, Math.min(1, progress || 0));
  const filled = Math.floor(p * total);
  const frac   = (p * total) - filled;

  bubbleTrack.setAttribute("aria-valuenow", String(Math.round(p * 100)));

  for (let i = 0; i < total; i++) {
    let s = 0;
    if (i < filled) {
      s = 1;
    } else if (i === filled && p < 1) {
      s = 0.4 + 0.6 * frac;
    } else if (p === 1) {
      s = 1;
    }
    bubbles[i].style.setProperty("--s", s.toFixed(3));
  }
}

window.addEventListener('message', function(event) {
  try {
    const jsonData = event.data;
    if (unityInstance) {
      unityInstance.SendMessage('JSConnect', 'ReceiveDataFromReact', jsonData);
    } else {
      window.pendingUserData = jsonData;
    }
  } catch (e) { console.error('Ошибка обработки сообщения от React Native:', e); }
});

window.RequestDataFromReact = function() {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "getUserData", data: "" }));
  }
};

window.addEventListener("load", () => {
  errorBox.style.display = "none";
  layoutStage();

  createUnityInstance(canvas, config, (progress) => {
    updateBubbles(progress);
  }).then((instance) => {
    unityInstance = instance;
    unityInstanceRef = instance;
    window.unityInstance = instance;
    sendSafeAreaToUnity();

    loader.style.opacity = "0";
    setTimeout(() => { loader.style.display = "none"; }, 180);
  }).catch((error) => {
    console.error(error);
    showError('Unable to load the game. Please refresh the page.');
  });

  debouncedResize();
});
