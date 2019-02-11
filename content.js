function injectHook(url) {
  var hookScript = document.createElement("script");
  hookScript.type = "module";
  hookScript.src = url;
  (document.head || document.body || document.documentElement).appendChild(hookScript);
}

injectHook(chrome.extension.getURL("hook.js"));