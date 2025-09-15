let unityInstance = null;

const canvas = document.querySelector("#unity-canvas");
const loader = document.getElementById("loader");
const errorBox = document.getElementById("error-message");

const bubbleTrack = document.getElementById("bubble-track");
const BUBBLE_COUNT = 12;            // сколько шариков в полосе
const bubbles = [];

// создать шарики один раз
for (let i = 0; i < BUBBLE_COUNT; i++) {
  const b = document.createElement("div");
  b.className = "bubble";
  bubbleTrack.appendChild(b);
  bubbles.push(b);
}

function showError(message){ errorBox.style.display="block"; errorBox.innerHTML=message; }

// Конфиг Unity
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
const ASPECT_DESKTOP = 9 / 18;
const MAX_H_DESKTOP = 1200;

function getViewportSize(){
  let vw = window.innerWidth;
  let vh = window.innerHeight;

  if (window.Telegram?.WebApp?.viewportStableHeight) {
    vh = window.Telegram.WebApp.viewportStableHeight;
  } else if (window.visualViewport) {
    vh = Math.min(vh, window.visualViewport.height);
  }
  return { vw, vh };
}

function isMobileLike(){
  if (window.Telegram?.WebApp) return !Telegram.WebApp.isDesktop;
  return matchMedia('(pointer:coarse)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

function layoutStage(){
  const { vw, vh } = getViewportSize();
  const mobile = isMobileLike();

  if (mobile) {
    stage.style.width  = vw + 'px';
    stage.style.height = vh + 'px';
  } else {
    const limitH = Math.min(vh * 0.96, MAX_H_DESKTOP);
    const limitW = vw * 0.96;

    let h = Math.min(limitH, limitW / ASPECT_DESKTOP);
    let w = h * ASPECT_DESKTOP;

    stage.style.width  = w + 'px';
    stage.style.height = h + 'px';
  }

  const r = stage.getBoundingClientRect();
  canvas.style.width  = r.width + 'px';
  canvas.style.height = r.height + 'px';

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = Math.round(r.width  * dpr);
  canvas.height = Math.round(r.height * dpr);
}

layoutStage();
window.addEventListener('resize', layoutStage);
window.addEventListener('orientationchange', layoutStage);

try {
  if (window.Telegram?.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
    Telegram.WebApp.onEvent('viewportChanged', layoutStage);
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
