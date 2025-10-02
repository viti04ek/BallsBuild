let unityInstance = null;

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

for (let i = 0; i < BUBBLE_COUNT; i++) {
  const b = document.createElement("div");
  b.className = "bubble";
  bubbleTrack.appendChild(b);
  bubbles.push(b);
}

function showError(message){ errorBox.style.display="block"; errorBox.innerHTML=message; }

const buildUrl = "Build";
const config = {
  dataUrl: buildUrl + "/Balls.data.unityweb",
  frameworkUrl: buildUrl + "/Balls.framework.js.unityweb",
  codeUrl: buildUrl + "/Balls.wasm.unityweb",
  streamingAssetsUrl: "StreamingAssets",
  companyName: "DefaultCompany",
  productName: "balls",
  productVersion: "1.0"
};

config.matchWebGLToCanvasSize = false;
config.devicePixelRatio = 1;
const __initialDpr = !isMobileLike() ? getDesktopEffectiveDPR() : 1;
config.devicePixelRatio = __initialDpr;

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

function getEffectiveDPR() {
  const dpr = window.devicePixelRatio || 1;
  return Math.min(Math.max(dpr, 1), 2);
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
  if (isMobileLike()) {
    layoutStageMobile();
  } else {
    canvas.classList.remove('mobile-scale');
    canvas.style.transform = '';
    canvas.style.width = '';
    canvas.style.height = '';
    layoutStageDesktop();
    const r = stage.getBoundingClientRect();
    //ensureCanvasBackbuffer(Math.round(r.width), Math.round(r.height));
    const dpr = getDesktopEffectiveDPR();
    const targetW = Math.round(r.width  * dpr);
    const targetH = Math.round(r.height * dpr);
    ensureCanvasBackbuffer(targetW, targetH);
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

function bounce(){
  layoutStage();
  ensureCanvasBackbuffer();
  setTimeout(layoutStage, 80);
  setTimeout(layoutStage, 200);
}

layoutStage();

window.addEventListener('resize', bounce);
window.addEventListener('orientationchange', bounce);
document.addEventListener('visibilitychange', () => { if (!document.hidden) bounce(); });
window.addEventListener('pageshow', bounce);

try {
  if (window.Telegram?.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
    requestAnimationFrame(bounce);
    Telegram.WebApp.onEvent('viewportChanged', (e) => {
      if (!e || e.isStateStable === undefined || e.isStateStable) bounce();
    });
  }
} catch {}

function isMobileTelegram() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return false;
  if (tg.platform === 'android' || tg.platform === 'ios') return true;
  if (typeof tg.isDesktop === 'boolean') return !tg.isDesktop;
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

let _fsDone = false;
async function requestFullscreenNow() {
  if (_fsDone) return;
  const tg = window.Telegram?.WebApp;
  if (!tg || !isMobileTelegram()) return;

  try { tg.ready?.(); } catch {}
  try { tg.expand?.(); } catch {}
  try { tg.setHeaderColor?.('bg_color'); } catch {}

  if (typeof tg.requestFullscreen === 'function') {
    try { 
      await tg.requestFullscreen();
      _fsDone = true;
    } catch (_) { }
  }
}

requestFullscreenNow();

setTimeout(requestFullscreenNow, 120);
requestAnimationFrame(() => setTimeout(requestFullscreenNow, 0));

try {
  window.Telegram?.WebApp?.onEvent?.('viewportChanged', (e) => {
    if (!_fsDone && (!e || e.isStateStable === undefined || e.isStateStable)) {
      requestFullscreenNow();
    }
  });
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
    window.unityInstance = instance;

    if (window.pendingUserData) {
      unityInstance.SendMessage('JSConnect', 'ReceiveDataFromReact', window.pendingUserData);
      window.pendingUserData = null;
    }

    loader.style.opacity = "0";
    setTimeout(() => { loader.style.display = "none"; }, 180);
  }).catch((error) => {
    console.error(error);
    showError('Unable to load the game. Please refresh the page.');
  });

  bounce();
});
