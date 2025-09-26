let unityInstance = null;

const canvas = document.querySelector("#unity-canvas");
const loader = document.getElementById("loader");
const errorBox = document.getElementById("error-message");

const bubbleTrack = document.getElementById("bubble-track");
const BUBBLE_COUNT = 12;
const bubbles = [];

for (let i = 0; i < BUBBLE_COUNT; i++) {
  const b = document.createElement("div");
  b.className = "bubble";
  bubbleTrack.appendChild(b);
  bubbles.push(b);
}

function showError(message){ errorBox.style.display="block"; errorBox.innerHTML=message; }

const buildUrl = "Build";
const config = {
  dataUrl: buildUrl + "/Balls.data",
  frameworkUrl: buildUrl + "/Balls.framework.js",
  codeUrl: buildUrl + "/Balls.wasm",
  streamingAssetsUrl: "StreamingAssets",
  companyName: "DefaultCompany",
  productName: "balls",
  productVersion: "1.0"
};

const stage  = document.getElementById('stage');
const ASPECT_DESKTOP = 10 / 17;
const PAD_H = 0;

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

function layoutStage(){
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

  canvas.style.width  = r.width + 'px';
  canvas.style.height = r.height + 'px';

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
}

function bounceResizeStable(retries = [0, 60, 180, 360]) {
  layoutStage();
  for (const t of retries) setTimeout(layoutStage, t);
}

layoutStage();
window.addEventListener('resize', bounceResizeStable());
window.addEventListener('orientationchange', bounceResizeStable());
document.addEventListener('visibilitychange', () => { if (!document.hidden) bounceResizeStable(); });
window.addEventListener('pageshow', bounceResizeStable());

try {
  if (window.Telegram?.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
    requestAnimationFrame(() => bounceResizeStable());
    Telegram.WebApp.onEvent('viewportChanged', (e) => {
      if (!e || e.isStateStable === undefined || e.isStateStable) bounceResizeStable();
    });
  }
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
});
