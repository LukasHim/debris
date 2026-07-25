// ==UserScript==
// @name         i.pximg.net 403 Forbidden Fix
// @namespace    LukasHim
// @version      1.3
// @description  Fix Pixiv raw image 403 with responsive dark UI + Viewer.js
// @author       LukasHim
// @match        https://i.pximg.net/*
// @match        https://img-comic.pximg.net/*
// @grant        GM_xmlhttpRequest
// @compatible   firefox >=52
// @compatible   chrome >=55
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";
  const removeAllChild = (el) => {
    while (el.firstChild) el.removeChild(el.firstChild);
  };
  function download(url, name) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  function createButton(text) {
    const btn = document.createElement("button");
    btn.textContent = text;
    Object.assign(btn.style, {
      padding: "10px 20px",
      border: "0",
      borderRadius: "12px",
      background: "#0096fa",
      color: "#fff",
      fontSize: "16px",
      fontWeight: "500",
      cursor: "pointer",
      whiteSpace: "nowrap",
      touchAction: "manipulation",
    });
    btn.onmousedown = () => (btn.style.opacity = ".75");
    btn.onmouseup = () => (btn.style.opacity = "1");
    return btn;
  }
  function loadViewer() {
    return new Promise((resolve) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href =
        "https://cdnjs.cloudflare.com/ajax/libs/viewerjs/1.11.6/viewer.min.css";
      document.head.appendChild(css);
      const js = document.createElement("script");
      js.src =
        "https://cdnjs.cloudflare.com/ajax/libs/viewerjs/1.11.6/viewer.min.js";
      js.onload = resolve;
      document.head.appendChild(js);
    });
  }
  if (document.title === "403 Forbidden") {
    const fname = location.pathname.split("/").pop();
    const id = /(\d+)/.exec(fname)?.[1];
    const viewport = document.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width,initial-scale=1";
    document.head.appendChild(viewport);
    loadViewer();

    removeAllChild(document.body);
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    Object.assign(document.body.style, {
      margin: "0",
      padding: "12px",
      minHeight: "100vh",
      boxSizing: "border-box",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      background: dark ? "#111" : "#f3f3f3",
      color: dark ? "#eee" : "#222",
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    });
    const card = document.createElement("div");
    Object.assign(card.style, {
      width: "fit-content",
      maxWidth: "100%",
      padding: "20px",
      borderRadius: "18px",
      background: dark ? "#1c1c1e" : "#fff",
      boxShadow: dark
        ? "0 6px 25px rgba(0,0,0,.5)"
        : "0 6px 25px rgba(0,0,0,.12)",
    });
    const title = document.createElement("h2");
    title.textContent = "";
    Object.assign(title.style, {
      margin: "0 0 20px",
      textAlign: "center",
      fontSize: "24px",
    });
    const actions = document.createElement("div");
    Object.assign(actions.style, {
      display: "flex",
      gap: "10px",
      justifyContent: "center",
      flexWrap: "wrap",
    });
    // skeleton
    const skeleton = document.createElement("div");
    Object.assign(skeleton.style, {
      width: "min(800px,90vw)",
      height: "400px",
      borderRadius: "12px",
      marginBottom: "18px",
      background: dark
        ? "linear-gradient(90deg,#222,#333,#222)"
        : "linear-gradient(90deg,#eee,#ddd,#eee)",
      backgroundSize: "200% 100%",
      animation: "skeleton 1.5s infinite",
    });
    const style = document.createElement("style");
    style.textContent = `
      @keyframes skeleton {
        from {
          background-position:200% 0;
        }
        to {
          background-position:-200% 0;
        }
      }
    `;
    document.head.appendChild(style);
    card.append(title, skeleton, actions);
    document.body.appendChild(card);
    const pixiv = document.createElement("a");
    pixiv.textContent = "Open Pixiv";
    pixiv.href = `https://www.pixiv.net/artworks/${id}`;
    pixiv.target = "_blank";
    pixiv.rel = "noopener noreferrer";
    Object.assign(pixiv.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "10px 20px",
      borderRadius: "12px",
      background: "#0096fa",
      color: "#fff",
      textDecoration: "none",
      fontSize: "16px",
      whiteSpace: "nowrap",
    });
    actions.appendChild(pixiv);
    GM_xmlhttpRequest({
      method: "GET",
      url: location.href,
      headers: {
        Referer: "https://www.pixiv.net/",
      },
      responseType: "blob",
      onload(xhr) {
        if (!xhr.response) {
          throw new Error();
        }
        const url = URL.createObjectURL(xhr.response);
        const img = new Image();
        Object.assign(img.style, {
          display: "block",
          width: "auto",
          height: "auto",
          maxWidth: "100%",
          maxHeight: "85vh",
          borderRadius: "12px",
          marginBottom: "18px",
          cursor: "zoom-in",
        });
        img.src = url;
        img.onload = async () => {
          skeleton.remove();
          title.remove();
          card.insertBefore(img, actions);
          const downloadBtn = createButton("Download Image");
          downloadBtn.onclick = () => {
            download(url, fname);
          };
          actions.appendChild(downloadBtn);
          const viewer = new Viewer(img, {
            navbar: false,
            toolbar: true,
            title: false,
            movable: true,
            zoomable: true,
            scalable: true,
          });
          img.onclick = async () => {
            viewer.show();
          };
          document.title = fname;
        };
      },
      onerror() {
        skeleton.remove();
        title.textContent = "Image load failed";
        const retry = createButton("Retry");
        retry.onclick = () => {
          location.reload();
        };
        actions.appendChild(retry);
      },
    });
  }
})();
