var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/@capacitor/core/dist/index.cjs.js
var require_index_cjs = __commonJS({
  "node_modules/@capacitor/core/dist/index.cjs.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ExceptionCode = void 0;
    (function(ExceptionCode) {
      ExceptionCode["Unimplemented"] = "UNIMPLEMENTED";
      ExceptionCode["Unavailable"] = "UNAVAILABLE";
    })(exports.ExceptionCode || (exports.ExceptionCode = {}));
    var CapacitorException = class extends Error {
      constructor(message, code, data) {
        super(message);
        this.message = message;
        this.code = code;
        this.data = data;
      }
    };
    var getPlatformId = (win) => {
      var _a, _b;
      if (win === null || win === void 0 ? void 0 : win.androidBridge) {
        return "android";
      } else if ((_b = (_a = win === null || win === void 0 ? void 0 : win.webkit) === null || _a === void 0 ? void 0 : _a.messageHandlers) === null || _b === void 0 ? void 0 : _b.bridge) {
        return "ios";
      } else {
        return "web";
      }
    };
    var createCapacitor = (win) => {
      const capCustomPlatform = win.CapacitorCustomPlatform || null;
      const cap = win.Capacitor || {};
      const Plugins = cap.Plugins = cap.Plugins || {};
      const getPlatform = () => {
        return capCustomPlatform !== null ? capCustomPlatform.name : getPlatformId(win);
      };
      const isNativePlatform = () => getPlatform() !== "web";
      const isPluginAvailable = (pluginName) => {
        const plugin = registeredPlugins.get(pluginName);
        if (plugin === null || plugin === void 0 ? void 0 : plugin.platforms.has(getPlatform())) {
          return true;
        }
        if (getPluginHeader(pluginName)) {
          return true;
        }
        return false;
      };
      const getPluginHeader = (pluginName) => {
        var _a;
        return (_a = cap.PluginHeaders) === null || _a === void 0 ? void 0 : _a.find((h) => h.name === pluginName);
      };
      const handleError = (err) => win.console.error(err);
      const registeredPlugins = /* @__PURE__ */ new Map();
      const registerPlugin2 = (pluginName, jsImplementations = {}) => {
        const registeredPlugin = registeredPlugins.get(pluginName);
        if (registeredPlugin) {
          console.warn(`Capacitor plugin "${pluginName}" already registered. Cannot register plugins twice.`);
          return registeredPlugin.proxy;
        }
        const platform = getPlatform();
        const pluginHeader = getPluginHeader(pluginName);
        let jsImplementation;
        const loadPluginImplementation = async () => {
          if (!jsImplementation && platform in jsImplementations) {
            jsImplementation = typeof jsImplementations[platform] === "function" ? jsImplementation = await jsImplementations[platform]() : jsImplementation = jsImplementations[platform];
          } else if (capCustomPlatform !== null && !jsImplementation && "web" in jsImplementations) {
            jsImplementation = typeof jsImplementations["web"] === "function" ? jsImplementation = await jsImplementations["web"]() : jsImplementation = jsImplementations["web"];
          }
          return jsImplementation;
        };
        const createPluginMethod = (impl, prop) => {
          var _a, _b;
          if (pluginHeader) {
            const methodHeader = pluginHeader === null || pluginHeader === void 0 ? void 0 : pluginHeader.methods.find((m) => prop === m.name);
            if (methodHeader) {
              if (methodHeader.rtype === "promise") {
                return (options) => cap.nativePromise(pluginName, prop.toString(), options);
              } else {
                return (options, callback) => cap.nativeCallback(pluginName, prop.toString(), options, callback);
              }
            } else if (impl) {
              return (_a = impl[prop]) === null || _a === void 0 ? void 0 : _a.bind(impl);
            }
          } else if (impl) {
            return (_b = impl[prop]) === null || _b === void 0 ? void 0 : _b.bind(impl);
          } else {
            throw new CapacitorException(`"${pluginName}" plugin is not implemented on ${platform}`, exports.ExceptionCode.Unimplemented);
          }
        };
        const createPluginMethodWrapper = (prop) => {
          let remove;
          const wrapper = (...args) => {
            const p = loadPluginImplementation().then((impl) => {
              const fn = createPluginMethod(impl, prop);
              if (fn) {
                const p2 = fn(...args);
                remove = p2 === null || p2 === void 0 ? void 0 : p2.remove;
                return p2;
              } else {
                throw new CapacitorException(`"${pluginName}.${prop}()" is not implemented on ${platform}`, exports.ExceptionCode.Unimplemented);
              }
            });
            if (prop === "addListener") {
              p.remove = async () => remove();
            }
            return p;
          };
          wrapper.toString = () => `${prop.toString()}() { [capacitor code] }`;
          Object.defineProperty(wrapper, "name", {
            value: prop,
            writable: false,
            configurable: false
          });
          return wrapper;
        };
        const addListener = createPluginMethodWrapper("addListener");
        const removeListener = createPluginMethodWrapper("removeListener");
        const addListenerNative = (eventName, callback) => {
          const call = addListener({ eventName }, callback);
          const remove = async () => {
            const callbackId = await call;
            removeListener({
              eventName,
              callbackId
            }, callback);
          };
          const p = new Promise((resolve) => call.then(() => resolve({ remove })));
          p.remove = async () => {
            console.warn(`Using addListener() without 'await' is deprecated.`);
            await remove();
          };
          return p;
        };
        const proxy = new Proxy({}, {
          get(_, prop) {
            switch (prop) {
              // https://github.com/facebook/react/issues/20030
              case "$$typeof":
                return void 0;
              case "toJSON":
                return () => ({});
              case "addListener":
                return pluginHeader ? addListenerNative : addListener;
              case "removeListener":
                return removeListener;
              default:
                return createPluginMethodWrapper(prop);
            }
          }
        });
        Plugins[pluginName] = proxy;
        registeredPlugins.set(pluginName, {
          name: pluginName,
          proxy,
          platforms: /* @__PURE__ */ new Set([...Object.keys(jsImplementations), ...pluginHeader ? [platform] : []])
        });
        return proxy;
      };
      if (!cap.convertFileSrc) {
        cap.convertFileSrc = (filePath) => filePath;
      }
      cap.getPlatform = getPlatform;
      cap.handleError = handleError;
      cap.isNativePlatform = isNativePlatform;
      cap.isPluginAvailable = isPluginAvailable;
      cap.registerPlugin = registerPlugin2;
      cap.Exception = CapacitorException;
      cap.DEBUG = !!cap.DEBUG;
      cap.isLoggingEnabled = !!cap.isLoggingEnabled;
      return cap;
    };
    var initCapacitorGlobal = (win) => win.Capacitor = createCapacitor(win);
    var Capacitor2 = /* @__PURE__ */ initCapacitorGlobal(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
    var registerPlugin = Capacitor2.registerPlugin;
    var WebPlugin = class {
      constructor() {
        this.listeners = {};
        this.retainedEventArguments = {};
        this.windowListeners = {};
      }
      addListener(eventName, listenerFunc) {
        let firstListener = false;
        const listeners = this.listeners[eventName];
        if (!listeners) {
          this.listeners[eventName] = [];
          firstListener = true;
        }
        this.listeners[eventName].push(listenerFunc);
        const windowListener = this.windowListeners[eventName];
        if (windowListener && !windowListener.registered) {
          this.addWindowListener(windowListener);
        }
        if (firstListener) {
          this.sendRetainedArgumentsForEvent(eventName);
        }
        const remove = async () => this.removeListener(eventName, listenerFunc);
        const p = Promise.resolve({ remove });
        return p;
      }
      async removeAllListeners() {
        this.listeners = {};
        for (const listener in this.windowListeners) {
          this.removeWindowListener(this.windowListeners[listener]);
        }
        this.windowListeners = {};
      }
      notifyListeners(eventName, data, retainUntilConsumed) {
        const listeners = this.listeners[eventName];
        if (!listeners) {
          if (retainUntilConsumed) {
            let args = this.retainedEventArguments[eventName];
            if (!args) {
              args = [];
            }
            args.push(data);
            this.retainedEventArguments[eventName] = args;
          }
          return;
        }
        listeners.forEach((listener) => listener(data));
      }
      hasListeners(eventName) {
        var _a;
        return !!((_a = this.listeners[eventName]) === null || _a === void 0 ? void 0 : _a.length);
      }
      registerWindowListener(windowEventName, pluginEventName) {
        this.windowListeners[pluginEventName] = {
          registered: false,
          windowEventName,
          pluginEventName,
          handler: (event) => {
            this.notifyListeners(pluginEventName, event);
          }
        };
      }
      unimplemented(msg = "not implemented") {
        return new Capacitor2.Exception(msg, exports.ExceptionCode.Unimplemented);
      }
      unavailable(msg = "not available") {
        return new Capacitor2.Exception(msg, exports.ExceptionCode.Unavailable);
      }
      async removeListener(eventName, listenerFunc) {
        const listeners = this.listeners[eventName];
        if (!listeners) {
          return;
        }
        const index = listeners.indexOf(listenerFunc);
        if (index !== -1) {
          this.listeners[eventName].splice(index, 1);
        }
        if (!this.listeners[eventName].length) {
          this.removeWindowListener(this.windowListeners[eventName]);
        }
      }
      addWindowListener(handle) {
        window.addEventListener(handle.windowEventName, handle.handler);
        handle.registered = true;
      }
      removeWindowListener(handle) {
        if (!handle) {
          return;
        }
        window.removeEventListener(handle.windowEventName, handle.handler);
        handle.registered = false;
      }
      sendRetainedArgumentsForEvent(eventName) {
        const args = this.retainedEventArguments[eventName];
        if (!args) {
          return;
        }
        delete this.retainedEventArguments[eventName];
        args.forEach((arg) => {
          this.notifyListeners(eventName, arg);
        });
      }
    };
    var WebView = /* @__PURE__ */ registerPlugin("WebView");
    var encode = (str2) => encodeURIComponent(str2).replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent).replace(/[()]/g, escape);
    var decode2 = (str2) => str2.replace(/(%[\dA-F]{2})+/gi, decodeURIComponent);
    var CapacitorCookiesPluginWeb = class extends WebPlugin {
      async getCookies() {
        const cookies = document.cookie;
        const cookieMap = {};
        cookies.split(";").forEach((cookie) => {
          if (cookie.length <= 0)
            return;
          let [key, value] = cookie.replace(/=/, "CAP_COOKIE").split("CAP_COOKIE");
          key = decode2(key).trim();
          value = decode2(value).trim();
          cookieMap[key] = value;
        });
        return cookieMap;
      }
      async setCookie(options) {
        try {
          const encodedKey = encode(options.key);
          const encodedValue = encode(options.value);
          const expires = options.expires ? `; expires=${options.expires.replace("expires=", "")}` : "";
          const path = (options.path || "/").replace("path=", "");
          const domain = options.url != null && options.url.length > 0 ? `domain=${options.url}` : "";
          document.cookie = `${encodedKey}=${encodedValue || ""}${expires}; path=${path}; ${domain};`;
        } catch (error) {
          return Promise.reject(error);
        }
      }
      async deleteCookie(options) {
        try {
          document.cookie = `${options.key}=; Max-Age=0`;
        } catch (error) {
          return Promise.reject(error);
        }
      }
      async clearCookies() {
        try {
          const cookies = document.cookie.split(";") || [];
          for (const cookie of cookies) {
            document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, `=;expires=${(/* @__PURE__ */ new Date()).toUTCString()};path=/`);
          }
        } catch (error) {
          return Promise.reject(error);
        }
      }
      async clearAllCookies() {
        try {
          await this.clearCookies();
        } catch (error) {
          return Promise.reject(error);
        }
      }
    };
    var CapacitorCookies = registerPlugin("CapacitorCookies", {
      web: () => new CapacitorCookiesPluginWeb()
    });
    var readBlobAsBase64 = async (blob) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result;
        resolve(base64String.indexOf(",") >= 0 ? base64String.split(",")[1] : base64String);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(blob);
    });
    var normalizeHttpHeaders = (headers = {}) => {
      const originalKeys = Object.keys(headers);
      const loweredKeys = Object.keys(headers).map((k) => k.toLocaleLowerCase());
      const normalized = loweredKeys.reduce((acc, key, index) => {
        acc[key] = headers[originalKeys[index]];
        return acc;
      }, {});
      return normalized;
    };
    var buildUrlParams = (params, shouldEncode = true) => {
      if (!params)
        return null;
      const output = Object.entries(params).reduce((accumulator, entry) => {
        const [key, value] = entry;
        let encodedValue;
        let item;
        if (Array.isArray(value)) {
          item = "";
          value.forEach((str2) => {
            encodedValue = shouldEncode ? encodeURIComponent(str2) : str2;
            item += `${key}=${encodedValue}&`;
          });
          item.slice(0, -1);
        } else {
          encodedValue = shouldEncode ? encodeURIComponent(value) : value;
          item = `${key}=${encodedValue}`;
        }
        return `${accumulator}&${item}`;
      }, "");
      return output.substr(1);
    };
    var buildRequestInit = (options, extra = {}) => {
      const output = Object.assign({ method: options.method || "GET", headers: options.headers }, extra);
      const headers = normalizeHttpHeaders(options.headers);
      const type = headers["content-type"] || "";
      if (typeof options.data === "string") {
        output.body = options.data;
      } else if (type.includes("application/x-www-form-urlencoded")) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(options.data || {})) {
          params.set(key, value);
        }
        output.body = params.toString();
      } else if (type.includes("multipart/form-data") || options.data instanceof FormData) {
        const form = new FormData();
        if (options.data instanceof FormData) {
          options.data.forEach((value, key) => {
            form.append(key, value);
          });
        } else {
          for (const key of Object.keys(options.data)) {
            form.append(key, options.data[key]);
          }
        }
        output.body = form;
        const headers2 = new Headers(output.headers);
        headers2.delete("content-type");
        output.headers = headers2;
      } else if (type.includes("application/json") || typeof options.data === "object") {
        output.body = JSON.stringify(options.data);
      }
      return output;
    };
    var CapacitorHttpPluginWeb = class extends WebPlugin {
      /**
       * Perform an Http request given a set of options
       * @param options Options to build the HTTP request
       */
      async request(options) {
        const requestInit = buildRequestInit(options, options.webFetchExtra);
        const urlParams = buildUrlParams(options.params, options.shouldEncodeUrlParams);
        const url = urlParams ? `${options.url}?${urlParams}` : options.url;
        const response = await fetch(url, requestInit);
        const contentType = response.headers.get("content-type") || "";
        let { responseType = "text" } = response.ok ? options : {};
        if (contentType.includes("application/json")) {
          responseType = "json";
        }
        let data;
        let blob;
        switch (responseType) {
          case "arraybuffer":
          case "blob":
            blob = await response.blob();
            data = await readBlobAsBase64(blob);
            break;
          case "json":
            data = await response.json();
            break;
          case "document":
          case "text":
          default:
            data = await response.text();
        }
        const headers = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        return {
          data,
          headers,
          status: response.status,
          url: response.url
        };
      }
      /**
       * Perform an Http GET request given a set of options
       * @param options Options to build the HTTP request
       */
      async get(options) {
        return this.request(Object.assign(Object.assign({}, options), { method: "GET" }));
      }
      /**
       * Perform an Http POST request given a set of options
       * @param options Options to build the HTTP request
       */
      async post(options) {
        return this.request(Object.assign(Object.assign({}, options), { method: "POST" }));
      }
      /**
       * Perform an Http PUT request given a set of options
       * @param options Options to build the HTTP request
       */
      async put(options) {
        return this.request(Object.assign(Object.assign({}, options), { method: "PUT" }));
      }
      /**
       * Perform an Http PATCH request given a set of options
       * @param options Options to build the HTTP request
       */
      async patch(options) {
        return this.request(Object.assign(Object.assign({}, options), { method: "PATCH" }));
      }
      /**
       * Perform an Http DELETE request given a set of options
       * @param options Options to build the HTTP request
       */
      async delete(options) {
        return this.request(Object.assign(Object.assign({}, options), { method: "DELETE" }));
      }
    };
    var CapacitorHttp2 = registerPlugin("CapacitorHttp", {
      web: () => new CapacitorHttpPluginWeb()
    });
    exports.SystemBarsStyle = void 0;
    (function(SystemBarsStyle) {
      SystemBarsStyle["Dark"] = "DARK";
      SystemBarsStyle["Light"] = "LIGHT";
      SystemBarsStyle["Default"] = "DEFAULT";
    })(exports.SystemBarsStyle || (exports.SystemBarsStyle = {}));
    exports.SystemBarType = void 0;
    (function(SystemBarType) {
      SystemBarType["StatusBar"] = "StatusBar";
      SystemBarType["NavigationBar"] = "NavigationBar";
    })(exports.SystemBarType || (exports.SystemBarType = {}));
    var SystemBarsPluginWeb = class extends WebPlugin {
      async setStyle() {
        this.unavailable("not available for web");
      }
      async setAnimation() {
        this.unavailable("not available for web");
      }
      async show() {
        this.unavailable("not available for web");
      }
      async hide() {
        this.unavailable("not available for web");
      }
    };
    var SystemBars = registerPlugin("SystemBars", {
      web: () => new SystemBarsPluginWeb()
    });
    exports.Capacitor = Capacitor2;
    exports.CapacitorCookies = CapacitorCookies;
    exports.CapacitorException = CapacitorException;
    exports.CapacitorHttp = CapacitorHttp2;
    exports.SystemBars = SystemBars;
    exports.WebPlugin = WebPlugin;
    exports.WebView = WebView;
    exports.buildRequestInit = buildRequestInit;
    exports.registerPlugin = registerPlugin;
  }
});

// src/runner/main.ts
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// src/lib/sync/github.ts
var CONFLICT = "conflict";
function api(url, token, init) {
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token.trim()}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers ?? {}
    }
  });
}
function repoUrl(repo, path) {
  const clean2 = repo.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(clean2)) throw new Error("D\xE9p\xF4t mal form\xE9 : attends \xAB utilisateur/d\xE9p\xF4t \xBB (ex : Nikola17/boussole-sync).");
  return `https://api.github.com/repos/${clean2}/contents/${path}`;
}
function bytesToB64(buf) {
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}
async function b64ToString(b64) {
  const bin = atob(b64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
async function fetchRemote(repo, path, token) {
  const res = await api(repoUrl(repo, path), token);
  if (res.status === 404) return null;
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error("Jeton GitHub refus\xE9 (v\xE9rifie sa validit\xE9 et son acc\xE8s au d\xE9p\xF4t).");
    if (res.status === 403) throw new Error(`Acc\xE8s refus\xE9 par GitHub${msg.message ? ` : ${msg.message}` : ""} (le jeton doit pouvoir lire le d\xE9p\xF4t de synchronisation).`);
    throw new Error(`Lecture GitHub impossible (${res.status}${msg.message ? ` : ${msg.message}` : ""}).`);
  }
  const j = await res.json();
  if (typeof j.content !== "string") throw new Error("Le fichier de synchronisation distant est illisible (contenu vide ou trop gros pour l\u2019API).");
  return { sha: j.sha, content: await b64ToString(j.content) };
}
async function pushRemote(repo, path, token, content2, knownSha) {
  const body = { message: "Boussole : synchronisation", content: bytesToB64(new TextEncoder().encode(content2)) };
  if (knownSha) body.sha = knownSha;
  const res = await api(repoUrl(repo, path), token, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return;
  const msg = await res.json().catch(() => ({}));
  if (res.status === 409 || res.status === 422) throw new Error(CONFLICT);
  if (res.status === 401) throw new Error("Jeton GitHub refus\xE9 (v\xE9rifie sa validit\xE9 et son acc\xE8s au d\xE9p\xF4t).");
  if (res.status === 403) throw new Error(`\xC9criture refus\xE9e par GitHub${msg.message ? ` : ${msg.message}` : ""} (le jeton doit avoir \xAB Contents : Read and write \xBB sur ce d\xE9p\xF4t).`);
  throw new Error(`\xC9criture GitHub impossible (${res.status}${msg.message ? ` : ${msg.message}` : ""}).`);
}

// src/runner/config.ts
var PATH_DEFAULT = "boussole-sync.enc";
var str = (v) => typeof v === "string" ? v.trim() : "";
function validateConfig(raw, opts = {}) {
  const problems = [];
  if (typeof raw !== "object" || raw === null) return { config: null, problems: ["Configuration illisible : attends un objet JSON."] };
  const r = raw;
  const syncRepo = str(r.syncRepo);
  if (!syncRepo) problems.push('syncRepo manquant (ex : "Nikola17/boussole-sync").');
  else if (!/^[\w.-]+\/[\w.-]+$/.test(syncRepo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, ""))) problems.push("syncRepo mal form\xE9 : attends \xAB utilisateur/d\xE9p\xF4t \xBB.");
  const timeZone = str(r.timeZone) || "Europe/Paris";
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone });
  } catch {
    problems.push(`timeZone inconnu : \xAB ${timeZone} \xBB.`);
  }
  const currency = str(r.currency).toUpperCase() === "USD" ? "USD" : "EUR";
  const briefHourRaw = r.briefHour;
  let briefHour = 8;
  if (briefHourRaw !== void 0) {
    briefHour = typeof briefHourRaw === "number" && Number.isInteger(briefHourRaw) && briefHourRaw >= 0 && briefHourRaw <= 23 ? briefHourRaw : -1;
    if (briefHour < 0) problems.push("briefHour doit \xEAtre un entier entre 0 et 23.");
  }
  const hourOf = (v, name) => {
    if (v === void 0) return null;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 23) {
      problems.push(`${name} doit \xEAtre un entier entre 0 et 23.`);
      return null;
    }
    return v;
  };
  const quietStart = hourOf(r.quietStart, "quietStart") ?? 23;
  const quietEnd = hourOf(r.quietEnd, "quietEnd") ?? 8;
  const intervalRaw = r.intervalMinutes;
  let intervalMinutes = 5;
  if (intervalRaw !== void 0) {
    intervalMinutes = typeof intervalRaw === "number" && Number.isFinite(intervalRaw) && intervalRaw >= 1 && intervalRaw <= 120 ? Math.round(intervalRaw) : 0;
    if (!intervalMinutes) problems.push("intervalMinutes doit \xEAtre un nombre entre 1 et 120.");
  }
  if (typeof r.briefEnabled !== "undefined" && typeof r.briefEnabled !== "boolean") problems.push("briefEnabled doit \xEAtre true ou false.");
  const bool = (v) => typeof v === "boolean";
  for (const k of ["briefUsOpen", "briefUsClose", "newsEnabled", "smartMoneyEnabled", "emergingEnabled", "autopilotEnabled", "autopilotTelegram", "signalAlertsEnabled"]) {
    if (typeof r[k] !== "undefined" && typeof r[k] !== "boolean") problems.push(`${k} doit \xEAtre true ou false.`);
  }
  const syncToken = str(r.syncToken);
  const passphrase = str(r.passphrase);
  const telegramToken = str(r.telegramToken);
  const telegramChatId = str(r.telegramChatId);
  if (!syncToken) problems.push("syncToken manquant (ou variable d\u2019environnement BOUSSOLE_SYNC_TOKEN).");
  if (!passphrase) problems.push("passphrase manquante (ou BOUSSOLE_PASSPHRASE) \u2014 la m\xEAme que dans l\u2019application, R\xE9glages \u2192 Synchronisation.");
  if (!telegramToken) problems.push("telegramToken manquant (ou TELEGRAM_BOT_TOKEN) \u2014 cr\xE9\xE9 avec @BotFather.");
  if (!telegramChatId && !opts.allowMissingChatId) problems.push("telegramChatId manquant (ou TELEGRAM_CHAT_ID) \u2014 obtenu par la commande --discover.");
  if (problems.length) return { config: null, problems };
  return {
    config: {
      syncRepo,
      syncPath: str(r.syncPath) || PATH_DEFAULT,
      syncToken,
      passphrase,
      telegramToken,
      telegramChatId,
      coingeckoKey: str(r.coingeckoKey) || null,
      currency,
      intervalMinutes,
      briefHour,
      briefEnabled: typeof r.briefEnabled === "boolean" ? r.briefEnabled : true,
      briefUsOpen: r.briefUsOpen === void 0 ? true : bool(r.briefUsOpen),
      briefUsClose: r.briefUsClose === void 0 ? true : bool(r.briefUsClose),
      newsEnabled: r.newsEnabled === void 0 ? true : bool(r.newsEnabled),
      smartMoneyEnabled: r.smartMoneyEnabled === void 0 ? true : bool(r.smartMoneyEnabled),
      emergingEnabled: r.emergingEnabled === void 0 ? true : bool(r.emergingEnabled),
      autopilotEnabled: r.autopilotEnabled === void 0 ? true : bool(r.autopilotEnabled),
      autopilotTelegram: r.autopilotTelegram === void 0 ? true : bool(r.autopilotTelegram),
      signalAlertsEnabled: r.signalAlertsEnabled === void 0 ? true : bool(r.signalAlertsEnabled),
      mistralApiKey: str(r.mistralApiKey) || null,
      mistralModel: str(r.mistralModel) || "mistral-small-latest",
      timeZone,
      quietStart,
      quietEnd,
      stateDir: str(r.stateDir),
      device: str(r.device) || "vps-boussole"
    },
    problems: []
  };
}
function applyEnv(raw, env = process.env) {
  const out = { ...raw };
  const set = (key, envName) => {
    const v = env[envName];
    if (typeof v === "string" && v.trim()) out[key] = v.trim();
  };
  set("syncToken", "BOUSSOLE_SYNC_TOKEN");
  set("passphrase", "BOUSSOLE_PASSPHRASE");
  set("telegramToken", "TELEGRAM_BOT_TOKEN");
  set("telegramChatId", "TELEGRAM_CHAT_ID");
  set("coingeckoKey", "COINGECKO_KEY");
  set("mistralApiKey", "MISTRAL_API_KEY");
  set("stateDir", "BOUSSOLE_STATE_DIR");
  return out;
}

// src/runner/state.ts
var DAY_MS = 24 * 36e5;
var SENT_RETENTION_MS = 30 * DAY_MS;
function emptyState() {
  return { sent: {}, lastBriefSlot: {}, zoneLabel: null, quietQueue: {}, smCursor: {}, okAt: null, attemptAt: null, error: null };
}
function parseState(json) {
  if (!json) return emptyState();
  try {
    const r = JSON.parse(json);
    const sent = r.sent && typeof r.sent === "object" && !Array.isArray(r.sent) ? r.sent : {};
    const slots = r.lastBriefSlot && typeof r.lastBriefSlot === "object" && !Array.isArray(r.lastBriefSlot) ? r.lastBriefSlot : {};
    const out = { sent: {}, lastBriefSlot: {}, zoneLabel: typeof r.zoneLabel === "string" ? r.zoneLabel : null, quietQueue: {}, smCursor: {}, okAt: typeof r.okAt === "number" ? r.okAt : null, attemptAt: typeof r.attemptAt === "number" ? r.attemptAt : null, error: typeof r.error === "string" ? r.error : null };
    if (typeof r.lastBriefDay === "string" && typeof slots.matin === "undefined") out.lastBriefSlot.matin = r.lastBriefDay;
    for (const [k, v] of Object.entries(slots)) if (typeof v === "string") out.lastBriefSlot[k] = v;
    for (const [k, v] of Object.entries(sent)) if (typeof v === "number" && Number.isFinite(v)) out.sent[k] = v;
    const quietRaw = r.quietQueue;
    if (quietRaw && typeof quietRaw === "object" && !Array.isArray(quietRaw)) {
      for (const [k, v] of Object.entries(quietRaw)) {
        const q = v;
        if (typeof q.text === "string" && q.text.trim() && typeof q.at === "number" && Number.isFinite(q.at)) {
          out.quietQueue[k] = { text: q.text, at: q.at, ...typeof q.alertId === "string" ? { alertId: q.alertId } : {} };
        }
      }
    }
    const sig = r.signals;
    if (sig && typeof sig.day === "string" && sig.active && typeof sig.active === "object" && sig.starts && typeof sig.starts === "object") out.signals = { day: sig.day, active: sig.active, starts: sig.starts };
    const cursorRaw = r.smCursor;
    if (cursorRaw && typeof cursorRaw === "object" && !Array.isArray(cursorRaw)) {
      for (const [k, v] of Object.entries(cursorRaw)) if (typeof v === "number" && Number.isFinite(v)) out.smCursor[k] = v;
    }
    return out;
  } catch {
    return emptyState();
  }
}
function pruneSent(state, now) {
  const kept = {};
  let changed = false;
  for (const [k, at] of Object.entries(state.sent)) {
    if (k.startsWith("exit:")) {
      kept[k] = at;
      continue;
    }
    if (now - at > SENT_RETENTION_MS) changed = true;
    else kept[k] = at;
  }
  return changed ? { ...state, sent: kept } : state;
}
function shouldSend(state, key) {
  return state.sent[key] == null;
}
function markSent(state, keys, now) {
  if (!keys.length) return state;
  const sent = { ...state.sent };
  for (const k of keys) sent[k] = now;
  return { ...state, sent };
}
function recordStatus(state, ok, error, now) {
  const out = { ...state, attemptAt: now };
  if (ok) {
    out.okAt = now;
    out.error = null;
  } else out.error = error ?? "erreur inconnue";
  return out;
}
function inQuietWindow(start, end, now) {
  if (start === end) return false;
  const h = now.getHours();
  return start < end ? h >= start && h < end : h >= start || h < end;
}
function holdQuiet(state, items, now) {
  if (!items.length) return state;
  const quietQueue = { ...state.quietQueue };
  for (const it of items) quietQueue[it.key] = { text: it.text, at: now, alertId: it.alertId };
  return { ...state, quietQueue };
}
function dropQuiet(state, keys) {
  if (!keys.length) return state;
  const quietQueue = { ...state.quietQueue };
  for (const k of keys) delete quietQueue[k];
  return { ...state, quietQueue };
}
function quietMessage(items, timeZone = "Europe/Paris") {
  const fmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone });
  const lines = items.sort((a, b) => a.at - b.at).map((it) => `${fmt.format(new Date(it.at))} \u2014 ${it.text.split("\n")[0]}`);
  const shown = lines.slice(0, 8);
  if (lines.length > 8) shown.push(`+ ${lines.length - 8} autre${lines.length > 9 ? "s" : ""} pendant la nuit`);
  return ["Pendant la nuit, sans r\xE9veiller personne :", ...shown].join("\n");
}

// src/lib/sync/crypto.ts
var PREFIX = "BC1";
var ITERATIONS = 6e5;
var SALT_BYTES = 16;
var IV_BYTES = 12;
var te = new TextEncoder();
var td = new TextDecoder();
function bytesToB642(buf) {
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function randomBytes(n2) {
  const out = new Uint8Array(n2);
  crypto.getRandomValues(out);
  return out;
}
async function deriveKey(passphrase, salt) {
  const base = await crypto.subtle.importKey("raw", te.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
function checkPassphrase(passphrase) {
  const p = passphrase.trim();
  if (p.length < 8) return "Choisis une phrase de passe d\u2019au moins 8 caract\xE8res (elle ne quitte jamais cet appareil).";
  return null;
}
async function seal(value, passphrase) {
  if (checkPassphrase(passphrase)) throw new Error(checkPassphrase(passphrase));
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase.trim(), salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(JSON.stringify(value))));
  return `${PREFIX}|${bytesToB642(salt)}|${bytesToB642(iv)}|${bytesToB642(ct)}`;
}
async function unseal(sealed, passphrase) {
  const parts = sealed.split("|");
  if (parts.length !== 4 || parts[0] !== PREFIX) throw new Error("Le fichier de synchronisation n\u2019a pas le format attendu (Boussole chiffr\xE9 v1).");
  let value;
  try {
    const key = await deriveKey(passphrase.trim(), b64ToBytes(parts[1]));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(parts[2]) }, key, b64ToBytes(parts[3]));
    value = JSON.parse(td.decode(plain));
  } catch {
    throw new Error("Phrase de passe incorrecte, ou fichier endommag\xE9 pendant le transfert.");
  }
  return value;
}

// src/lib/format.ts
var nf = (opts) => new Intl.NumberFormat("fr-FR", opts);
function priceDigits(v) {
  const a = Math.abs(v);
  if (a === 0 || !Number.isFinite(a)) return 2;
  if (a >= 1e3) return 0;
  if (a >= 1) return 2;
  if (a >= 0.01) return 4;
  if (a >= 1e-4) return 6;
  return 8;
}
function fmtPrice(v, currency = "EUR") {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  const d = priceDigits(v);
  return nf({ style: "currency", currency, minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d }).format(v);
}
function fmtPct(v, digits = 1, signed3 = true) {
  if (v == null || !Number.isFinite(v)) return "\u2014";
  const s = nf({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  return `${signed3 && v > 0 ? "+" : ""}${s} %`;
}
function fmtDate(d, withTime = false) {
  if (d == null) return "\u2014";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "\u2014";
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...withTime ? { hour: "2-digit", minute: "2-digit" } : {}
  });
}
function isoDay(d = /* @__PURE__ */ new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// src/lib/fx.ts
var FALLBACK_EUR_PER_USD = 0.87;

// src/lib/portfolio.ts
function txAmounts(tx, amount) {
  const fx = tx.fxEurPerUsd > 0 ? tx.fxEurPerUsd : FALLBACK_EUR_PER_USD;
  if (tx.currency === "EUR") return { eur: amount, usd: amount / fx };
  return { eur: amount * fx, usd: amount };
}
function sortTx(txs) {
  const key = (t) => t.time ?? t.date;
  return [...txs].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka === kb ? 0 : ka < kb ? -1 : 1;
  });
}
function buildPositions(txs) {
  const map = /* @__PURE__ */ new Map();
  for (const tx of sortTx(txs)) {
    let p = map.get(tx.coinId);
    if (!p) {
      p = { coinId: tx.coinId, symbol: tx.symbol, name: tx.name, image: tx.image, quantity: 0, costEur: 0, costUsd: 0, realizedEur: 0, realizedUsd: 0, txCount: 0 };
      map.set(tx.coinId, p);
    }
    p.txCount++;
    if (tx.image && !p.image) p.image = tx.image;
    const gross = txAmounts(tx, tx.quantity * tx.price);
    const fee = txAmounts(tx, tx.fee || 0);
    switch (tx.type) {
      case "buy":
      case "deposit": {
        p.quantity += tx.quantity;
        p.costEur += gross.eur + fee.eur;
        p.costUsd += gross.usd + fee.usd;
        break;
      }
      case "reward": {
        p.quantity += tx.quantity;
        p.costEur += fee.eur;
        p.costUsd += fee.usd;
        break;
      }
      case "transfer":
        break;
      case "sell":
      case "withdraw": {
        if (p.quantity <= 0) break;
        const q = Math.min(tx.quantity, p.quantity);
        const ratio = q / p.quantity;
        const removedEur = p.costEur * ratio;
        const removedUsd = p.costUsd * ratio;
        if (tx.type === "sell") {
          const proceeds = txAmounts(tx, q * tx.price);
          p.realizedEur += proceeds.eur - fee.eur - removedEur;
          p.realizedUsd += proceeds.usd - fee.usd - removedUsd;
        }
        p.quantity -= q;
        p.costEur -= removedEur;
        p.costUsd -= removedUsd;
        if (p.quantity < 1e-12) {
          p.quantity = 0;
          p.costEur = 0;
          p.costUsd = 0;
        }
        break;
      }
    }
  }
  return map;
}
var STABLES = /* @__PURE__ */ new Set([
  "usdt",
  "usdc",
  "dai",
  "fdusd",
  "tusd",
  "usde",
  "usds",
  "pyusd",
  "usdd",
  "frax",
  "lusd",
  "gusd",
  "usdp",
  "eurc",
  "eurs",
  "rlusd",
  "usd1",
  "busd",
  "usdb",
  "usdy",
  "usdtb",
  "gho",
  "crvusd",
  "dola",
  "eure",
  "susde",
  "usdg",
  "usdf"
]);
var STABLE_IDS = /* @__PURE__ */ new Set(["tether", "usd-coin", "dai", "first-digital-usd", "ethena-usde", "usds", "paypal-usd", "euro-coin", "ripple-usd", "true-usd", "frax", "usd1-wlfi"]);
function isStable(symbol, coinId) {
  return STABLES.has(symbol.toLowerCase()) || (coinId ? STABLE_IDS.has(coinId) : false);
}
var WRAPPED = /* @__PURE__ */ new Set([
  "wbtc",
  "weth",
  "steth",
  "wsteth",
  "reth",
  "cbeth",
  "cbbtc",
  "tbtc",
  "weeth",
  "ezeth",
  "rseth",
  "meth",
  "wbeth",
  "bnsol",
  "jitosol",
  "msol",
  "jupsol",
  "bsol",
  "lbtc",
  "solvbtc",
  "wbnb",
  "wsol",
  "wavax",
  "wmatic",
  "btcb",
  "sweth",
  "oseth",
  "stkaave",
  "wtrx",
  "wht",
  "wftm",
  "lseth",
  "pufeth",
  "rsweth",
  "ethx",
  "sfrxeth",
  "frxeth",
  "clbtc",
  "enzobtc",
  "unibtc",
  "xsolvbtc"
]);
function isWrappedOrStaked(symbol, name = "", coinId = "") {
  if (WRAPPED.has(symbol.toLowerCase())) return true;
  const s = `${name} ${coinId}`.toLowerCase();
  return /\bwrapped\b|\bbridged\b|\bstaked\b|restaked|liquid staking|\bwormhole\b|binance-peg|\bpeg\b/.test(s);
}
function isGold(symbol) {
  return ["paxg", "xaut", "kau", "xaum"].includes(symbol.toLowerCase());
}

// src/lib/indicators.ts
function sma(values, period) {
  const out = new Array(values.length).fill(NaN);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}
function ema(values, period) {
  const out = new Array(values.length).fill(NaN);
  if (values.length < period || period <= 0) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}
function rsi(values, period = 14) {
  const out = new Array(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}
function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  const ef = ema(values, fast);
  const es = ema(values, slow);
  const line = values.map((_, i) => Number.isFinite(ef[i]) && Number.isFinite(es[i]) ? ef[i] - es[i] : NaN);
  const firstValid = line.findIndex((v) => Number.isFinite(v));
  const signal = new Array(values.length).fill(NaN);
  if (firstValid >= 0) {
    const sub = ema(line.slice(firstValid), signalPeriod);
    for (let i = 0; i < sub.length; i++) signal[firstValid + i] = sub[i];
  }
  const hist = line.map((v, i) => Number.isFinite(v) && Number.isFinite(signal[i]) ? v - signal[i] : NaN);
  return { macd: line, signal, hist };
}
function bollinger(values, period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper = new Array(values.length).fill(NaN);
  const lower = new Array(values.length).fill(NaN);
  const width = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (values[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
    width[i] = mid[i] !== 0 ? (upper[i] - lower[i]) / mid[i] : NaN;
  }
  return { mid, upper, lower, width };
}
function atr(candles, period = 14) {
  const out = new Array(candles.length).fill(NaN);
  if (candles.length <= period) return out;
  const tr = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
  let prev = 0;
  for (let i = 1; i <= period; i++) prev += tr[i];
  prev /= period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}
function highest(values, period, endIndex = values.length - 1) {
  let m = -Infinity;
  for (let i = Math.max(0, endIndex - period + 1); i <= endIndex; i++) m = Math.max(m, values[i]);
  return m;
}
function lowest(values, period, endIndex = values.length - 1) {
  let m = Infinity;
  for (let i = Math.max(0, endIndex - period + 1); i <= endIndex; i++) m = Math.min(m, values[i]);
  return m;
}
function last(arr, offset = 0) {
  return arr[arr.length - 1 - offset];
}
function changePct(values, n2) {
  if (values.length <= n2) return NaN;
  const a = values[values.length - 1 - n2];
  const b = values[values.length - 1];
  return a ? (b - a) / a * 100 : NaN;
}
function slopePct(values, n2) {
  const lastV = values[values.length - 1];
  const prevV = values[values.length - 1 - n2];
  if (!Number.isFinite(lastV) || !Number.isFinite(prevV) || prevV === 0) return NaN;
  return (lastV - prevV) / prevV * 100;
}
function lastCross(a, b, lookback = 30) {
  const n2 = a.length;
  for (let k = 0; k < Math.min(lookback, n2 - 1); k++) {
    const i = n2 - 1 - k;
    const prev = a[i - 1] - b[i - 1];
    const cur = a[i] - b[i];
    if (!Number.isFinite(prev) || !Number.isFinite(cur)) continue;
    if (prev <= 0 && cur > 0) return { dir: 1, barsAgo: k };
    if (prev >= 0 && cur < 0) return { dir: -1, barsAgo: k };
  }
  return null;
}
function supportResistance(candles, w = 5, tolerancePct = 2.5, maxBars = 365) {
  const cs = candles.slice(-maxBars);
  const pivots = [];
  for (let i = w; i < cs.length - w; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - w; j <= i + w; j++) {
      if (j === i) continue;
      if (cs[j].high > cs[i].high) isHigh = false;
      if (cs[j].low < cs[i].low) isLow = false;
    }
    if (isHigh) pivots.push({ price: cs[i].high, type: "high" });
    if (isLow) pivots.push({ price: cs[i].low, type: "low" });
  }
  const clusters = [];
  for (const p of pivots.sort((a, b) => a.price - b.price)) {
    const c = clusters[clusters.length - 1];
    if (c && Math.abs(p.price - c.sum / c.n) / (c.sum / c.n) * 100 <= tolerancePct) {
      c.sum += p.price;
      c.n += 1;
    } else clusters.push({ sum: p.price, n: 1 });
  }
  const lastClose = cs[cs.length - 1]?.close ?? 0;
  return clusters.map((c) => {
    const price = c.sum / c.n;
    return { price, touches: c.n, kind: price <= lastClose ? "support" : "resistance" };
  }).sort((a, b) => a.price - b.price);
}
function volumeRatio(candles, period = 20, opts = {}) {
  const closed = opts.closedOnly ? candles : candles.slice(0, -1);
  if (closed.length < period + 1) return NaN;
  const vols = closed.map((c) => c.volume);
  const avg = sma(vols.slice(0, -1), period);
  const a = avg[avg.length - 1];
  return a > 0 ? vols[vols.length - 1] / a : NaN;
}
function toWeekly(daily) {
  const out = [];
  let cur = null;
  let curWeek = -1;
  for (const c of daily) {
    const d = new Date(c.time * 1e3);
    const day = (d.getUTCDay() + 6) % 7;
    const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) / 1e3;
    if (monday !== curWeek) {
      if (cur) out.push(cur);
      cur = { time: monday, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
      curWeek = monday;
    } else if (cur) {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// src/lib/thresholds.ts
var TEMPERATURE = { extremeFear: 20, fear: 40, warm: 60, euphoria: 80 };
var FOMO_7D_PCT = 50;
var MIN_RUNG_VALUE_USD = 20;

// src/lib/cycle.ts
var CYCLE_VERSION = 1;
var HALVINGS = ["2012-11-28", "2016-07-09", "2020-05-11", "2024-04-20", "2028-04-15"];
function halvingContext(now = /* @__PURE__ */ new Date()) {
  const t = now.getTime();
  let last2 = HALVINGS[0];
  let next = HALVINGS[1] ?? HALVINGS[0];
  for (let i = 0; i < HALVINGS.length - 1; i++) {
    if (Date.parse(HALVINGS[i]) <= t) {
      last2 = HALVINGS[i];
      next = HALVINGS[i + 1];
    }
  }
  return {
    last: last2,
    next,
    daysSince: Math.max(0, Math.floor((t - Date.parse(last2)) / 864e5)),
    daysToNext: Math.max(0, Math.ceil((Date.parse(next) - t) / 864e5))
  };
}
function piecewise(x, points) {
  if (!Number.isFinite(x)) return NaN;
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x0, y0] = points[i - 1];
    if (x <= x1) return y0 + (x - x0) / (x1 - x0) * (y1 - y0);
  }
  return points[points.length - 1][1];
}
function zoneFor(t) {
  if (t < TEMPERATURE.extremeFear) return { key: "capitulation", label: "Peur extr\xEAme", action: "Zone d'achat historique : renforce ton DCA (\xD72) sur BTC/ETH, par paliers, sans tout miser d'un coup.", dcaMultiplier: 2, tone: "up" };
  if (t < TEMPERATURE.fear) return { key: "accumulation", label: "Accumulation", action: "Bon moment pour accumuler : DCA renforc\xE9 (\xD71,5), privil\xE9gie la qualit\xE9.", dcaMultiplier: 1.5, tone: "up" };
  if (t < TEMPERATURE.warm) return { key: "neutre", label: "Neutre", action: "DCA normal, aucun exc\xE8s : respecte ton plan et ta r\xE9partition cible.", dcaMultiplier: 1, tone: "neutral" };
  if (t < TEMPERATURE.euphoria) return { key: "chaleur", label: "March\xE9 chaud", action: "DCA r\xE9duit (\xD70,5) et pr\xE9pare tes prises de profits par paliers sur les positions en gain.", dcaMultiplier: 0.5, tone: "down" };
  return { key: "euphorie", label: "Euphorie", action: "Prends des profits progressivement, stoppe les achats d\u2019altcoins, remonte ta part de stablecoins.", dcaMultiplier: 0.25, tone: "down" };
}
function computeCycle({ btcDaily, fng, fundingRate, mvrv, stableShare }) {
  if (btcDaily.length < 200) return null;
  const closes = btcDaily.map((c) => c.close);
  const price = closes[closes.length - 1];
  const comps = [];
  if (fng != null && Number.isFinite(fng)) {
    comps.push({
      key: "fng",
      label: "Fear & Greed",
      value: `${Math.round(fng)}/100`,
      heat: fng,
      weight: 25,
      explain: "Sentiment agr\xE9g\xE9 (volatilit\xE9, volumes, r\xE9seaux sociaux, dominance). Sous 25 : peur extr\xEAme, au-dessus de 75 : avidit\xE9."
    });
  }
  const s200 = sma(closes, 200);
  const mayer = price / s200[s200.length - 1];
  comps.push({
    key: "mayer",
    label: "Multiple de Mayer (BTC)",
    value: mayer.toFixed(2).replace(".", ","),
    weight: 25,
    heat: piecewise(mayer, [[0.6, 0], [1, 35], [1.5, 65], [2.4, 100]]),
    explain: "Prix du BTC divis\xE9 par sa moyenne 200 jours. Sous 0,8 : zone d\u2019achat historique ; au-dessus de 2,4 : bulle."
  });
  const weekly = toWeekly(btcDaily);
  const wCloses = weekly.map((w) => w.close);
  let ratio200w = NaN;
  if (wCloses.length >= 200) {
    const s200w = sma(wCloses, 200);
    ratio200w = price / s200w[s200w.length - 1];
    comps.push({
      key: "ma200w",
      label: "Prix / moyenne 200 semaines",
      value: `${ratio200w.toFixed(2).replace(".", ",")}\xD7`,
      weight: 20,
      heat: piecewise(ratio200w, [[0.8, 0], [1, 15], [1.5, 40], [2.5, 75], [3.5, 100]]),
      explain: "La moyenne 200 semaines a marqu\xE9 tous les creux majeurs du Bitcoin. Pr\xE8s de 1\xD7 : opportunit\xE9 rare."
    });
  }
  const rw = rsi(wCloses, 14);
  const rsiW = rw[rw.length - 1];
  if (Number.isFinite(rsiW)) {
    comps.push({
      key: "rsiw",
      label: "RSI hebdomadaire (BTC)",
      value: `${Math.round(rsiW)}`,
      weight: 15,
      heat: piecewise(rsiW, [[30, 0], [50, 45], [70, 75], [85, 100]]),
      explain: "Au-dessus de 80 en hebdo, le march\xE9 est historiquement euphorique ; sous 35, il est \xE9puis\xE9."
    });
  }
  let piCycle = NaN;
  if (closes.length >= 350) {
    const s111 = sma(closes, 111);
    const s350 = sma(closes, 350);
    piCycle = s111[s111.length - 1] / (2 * s350[s350.length - 1]);
    comps.push({
      key: "pi",
      label: "Indicateur Pi Cycle",
      value: `${Math.round(piCycle * 100)} %`,
      weight: 10,
      heat: piecewise(piCycle, [[0.4, 0], [0.7, 50], [1, 100]]),
      explain: "Rapport MM111 / (2 \xD7 MM350). \xC0 100 %, il a signal\xE9 les sommets de cycle de 2013, 2017 et 2021."
    });
  }
  if (mvrv != null && Number.isFinite(mvrv)) {
    comps.push({
      key: "mvrv",
      label: "MVRV (BTC)",
      value: `${mvrv.toFixed(2).replace(".", ",")}\xD7`,
      weight: 10,
      heat: piecewise(mvrv, [[0.8, 0], [1, 25], [1.5, 50], [2, 72], [2.5, 85], [3, 95], [4, 100]]),
      explain: "Capitalisation divis\xE9e par capital r\xE9alis\xE9 (ce que valent les pi\xE8ces au prix o\xF9 elles ont boug\xE9 pour la derni\xE8re fois). Sous 1 : le march\xE9 d\xE9tient globalement en perte \u2014 zone d\u2019accumulation. Au-dessus de 3 : chaque cycle s\u2019y est arr\xEAt\xE9 (2013, 2017, 2021). Source gratuite retard\xE9e de ~7 jours."
    });
  }
  if (stableShare != null && Number.isFinite(stableShare)) {
    comps.push({
      key: "stables",
      label: "Puissance stablecoins",
      value: `${stableShare.toFixed(1).replace(".", ",")} % de la crypto`,
      weight: 5,
      heat: piecewise(stableShare, [[3, 100], [5, 70], [7, 40], [9, 20], [12, 10]]),
      explain: "Part des stablecoins dans la capitalisation totale : la poudre s\xE8che install\xE9e en attendant d\u2019acheter. Une part \xE9lev\xE9e = du carburant disponible ; une part faible = le capital est d\xE9j\xE0 investi (et r\xE9cup\xE9rer du cash co\xFBte cher)."
    });
  }
  if (fundingRate != null && Number.isFinite(fundingRate)) {
    const f = fundingRate * 100;
    comps.push({
      key: "funding",
      label: "Taux de financement (perp BTC)",
      value: `${f.toFixed(3).replace(".", ",")} %`,
      weight: 5,
      heat: piecewise(f, [[-0.01, 10], [0, 30], [0.01, 50], [0.03, 75], [0.05, 100]]),
      explain: "Co\xFBt pay\xE9 par les positions longues \xE0 effet de levier. Tr\xE8s \xE9lev\xE9 = exc\xE8s de sp\xE9culation."
    });
  }
  const wsum = comps.reduce((s, c) => s + (Number.isFinite(c.heat) ? c.weight : 0), 0);
  const temperature = wsum > 0 ? comps.reduce((s, c) => s + (Number.isFinite(c.heat) ? c.heat * c.weight : 0), 0) / wsum : 50;
  return { temperature, zone: zoneFor(temperature), components: comps, mayer, ratio200w, piCycle, halving: halvingContext() };
}

// src/lib/alerts.ts
var watchedAlerts = (alerts) => alerts.filter((a) => a.active && !a.triggeredAt);
function checkPriceAlerts(alerts, prices) {
  const out = [];
  for (const a of watchedAlerts(alerts)) {
    const price = prices.get(a.coinId);
    if (price == null || !Number.isFinite(price) || price <= 0) continue;
    if (a.condition === "above" ? price >= a.priceUsd : price <= a.priceUsd) out.push({ alert: a, price });
  }
  return out;
}

// src/lib/exit.ts
var DEFAULT_LADDER = [{ multiple: 2, pct: 25 }, { multiple: 3, pct: 25 }, { multiple: 5, pct: 25 }];
function exitLadder(i) {
  if (!(i.avgCostUsd > 0) || !(i.priceUsd > 0) || !(i.quantity > 0)) return [];
  const doneShare = i.steps.filter((s) => i.doneMultiples.includes(s.multiple)).reduce((t, s) => t + s.pct, 0) / 100;
  const initial = doneShare < 0.999 ? i.quantity / (1 - doneShare) : i.quantity;
  return [...i.steps].sort((a, b) => a.multiple - b.multiple).map((s) => {
    const done = i.doneMultiples.includes(s.multiple);
    const target = i.avgCostUsd * s.multiple;
    const qty = Math.min(initial * s.pct / 100, i.quantity);
    return { multiple: s.multiple, pct: s.pct, done, targetPrice: target, reached: i.priceUsd >= target, progressPct: Math.min(100, i.priceUsd / target * 100), qty: done ? 0 : qty, valueUsd: done ? 0 : qty * i.priceUsd };
  });
}
function pendingRungs(rungs, minValueUsd = MIN_RUNG_VALUE_USD) {
  return rungs.filter((r) => r.reached && !r.done && r.valueUsd >= minValueUsd);
}

// src/runner/evaluate.ts
function watchOf(bundle) {
  const list3 = (k) => Array.isArray(bundle.data[k]) ? bundle.data[k] : [];
  const stamps = bundle.data;
  const exitDone = stamps.exitDone && typeof stamps.exitDone === "object" && !Array.isArray(stamps.exitDone) ? stamps.exitDone : {};
  const exitSteps = stamps.exitSteps && typeof stamps.exitSteps === "object" && !Array.isArray(stamps.exitSteps) ? stamps.exitSteps : {};
  const profileRaw = stamps.profile;
  const vacationUntil = profileRaw && typeof profileRaw === "object" && typeof profileRaw.vacationUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(profileRaw.vacationUntil) ? profileRaw.vacationUntil : null;
  return { alerts: list3("alerts"), transactions: list3("transactions"), exitSteps, exitDone, paperTrades: list3("paperTrades"), paperPortfolios: list3("paperPortfolios"), paperOrders: list3("paperOrders"), paperDays: list3("paperDays"), smartWallets: list3("smartWallets"), watchedTokens: list3("watchedTokens"), vacationUntil };
}
var alertKey = (id) => `alert:${id}`;
var rungKey = (coinId, multiple) => `exit:${coinId}:${multiple}`;
function priceLabel(usd, cur) {
  return fmtPrice(cur.currency === "EUR" ? usd * (cur.eurPerUsd > 0 ? cur.eurPerUsd : 1) : usd, cur.currency);
}
function hitAlerts(watch, prices) {
  return checkPriceAlerts(watch.alerts, prices);
}
function alertMessage(a, price, cur) {
  const side = a.condition === "above" ? "au-dessus" : "en dessous";
  return `Alerte ${a.symbol.toUpperCase()}
${a.name} est pass\xE9 ${side} de ${priceLabel(a.priceUsd, cur)} (cours : ${priceLabel(price, cur)}).`;
  ;
}
function hitRungs(watch, prices) {
  const out = [];
  for (const p of buildPositions(watch.transactions).values()) {
    if (p.coinId === "bitcoin" || p.coinId === "ethereum" || p.symbol.toLowerCase() === "usdc" || p.symbol.toLowerCase() === "usdt") continue;
    const price = prices.get(p.coinId);
    if (price == null || !Number.isFinite(price) || price <= 0) continue;
    if (!(p.quantity > 0) || !(p.costUsd > 0)) continue;
    const steps = watch.exitSteps[p.coinId]?.length ? watch.exitSteps[p.coinId] : DEFAULT_LADDER;
    const rungs = exitLadder({ avgCostUsd: p.costUsd / p.quantity, priceUsd: price, quantity: p.quantity, steps, doneMultiples: watch.exitDone[p.coinId] ?? [] });
    for (const r of pendingRungs(rungs)) {
      out.push({ coinId: p.coinId, symbol: p.symbol, name: p.name, multiple: r.multiple, pct: r.pct, targetUsd: r.targetPrice, valueUsd: r.valueUsd });
    }
  }
  return out;
}
function rungMessage(t, cur) {
  return `Palier \xD7${t.multiple} atteint sur ${t.symbol.toUpperCase()}
Vends ${t.pct} % de ta position de d\xE9part : ce palier a \xE9t\xE9 fix\xE9 \xE0 froid (\u2248 ${priceLabel(t.valueUsd, cur)} \xE0 vendre). Ouvre Boussole.`;
}
function zoneMessage(zone, temperature, previous) {
  return `Le march\xE9 change de zone : ${zone.label}
Temp\xE9rature ${Math.round(temperature)}/100 (elle \xE9tait \xAB ${previous} \xBB).
${zone.action}`;
}
function consumeAlerts(bundle, alertIds, nowIso) {
  if (!alertIds.length) return bundle;
  const alerts = watchOf(bundle).alerts;
  const wanted = new Set(alertIds);
  let changed = false;
  const next = alerts.map((a) => {
    if (!wanted.has(a.id) || a.triggeredAt || !a.active) return a;
    changed = true;
    return { ...a, triggeredAt: nowIso, active: false, updatedAt: nowIso };
  });
  if (!changed) return bundle;
  const data = { ...bundle.data, alerts: next };
  return { ...bundle, data };
}

// src/lib/dca.ts
var TEMP_TABLES = {
  actuelle: [2, 1.5, 1, 0.5, 0.25],
  plate: [1.5, 1.25, 1, 0.75, 0.5],
  pentue: [3, 2, 1, 0.33, 0]
};
function temperatureMultiplier(t, table = TEMP_TABLES.actuelle) {
  if (!Number.isFinite(t)) return 1;
  if (t < 20) return table[0];
  if (t < 40) return table[1];
  if (t < 60) return table[2];
  if (t < 80) return table[3];
  return table[4];
}
function parseDay(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function daysBetween(from, to) {
  return Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 864e5);
}
function nextOccurrences(plan, from, count = 5) {
  const out = [];
  const start = startOfDay(parseDay(plan.startDate));
  let cursor = startOfDay(from < start ? start : from);
  let guard = 0;
  while (out.length < count && guard < 800) {
    guard++;
    if (isScheduledDay(plan, cursor)) out.push(new Date(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return out;
}
function isScheduledDay(plan, day) {
  const start = startOfDay(parseDay(plan.startDate));
  const d = startOfDay(day);
  if (d < start) return false;
  const dow = (d.getDay() + 6) % 7 + 1;
  switch (plan.frequency) {
    case "daily":
      return true;
    case "weekly":
      return dow === (plan.dayOfWeek ?? (start.getDay() + 6) % 7 + 1);
    case "biweekly": {
      const target = plan.dayOfWeek ?? (start.getDay() + 6) % 7 + 1;
      if (dow !== target) return false;
      const weeks = Math.floor(daysBetween(start, d) / 7);
      return weeks % 2 === 0;
    }
    case "monthly":
      return d.getDate() === Math.min(plan.dayOfMonth ?? start.getDate(), 28);
  }
}
function periodKey(plan, day) {
  const d = startOfDay(day);
  const start = startOfDay(parseDay(plan.startDate));
  switch (plan.frequency) {
    case "daily":
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    case "weekly": {
      const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7);
      return `w-${monday.getFullYear()}-${monday.getMonth() + 1}-${monday.getDate()}`;
    }
    case "biweekly": {
      const weeks = Math.floor(daysBetween(start, d) / 7);
      return `b-${Math.floor(weeks / 2)}`;
    }
    case "monthly":
      return `m-${d.getFullYear()}-${d.getMonth() + 1}`;
  }
}

// src/lib/basket.ts
function parseDay2(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
var startOfDay2 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
var dowOf = (d) => (d.getDay() + 6) % 7 + 1;
function isBasketDay(b, day) {
  const d = startOfDay2(day);
  if (d < startOfDay2(parseDay2(b.startDate))) return false;
  return b.daysOfWeek.includes(dowOf(d));
}
function nextBasketOccurrences(b, from, count = 4) {
  const out = [];
  let cursor = startOfDay2(from);
  for (let i = 0; i < 400 && out.length < count; i++) {
    if (isBasketDay(b, cursor)) out.push(new Date(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return out;
}
function discoveryTemperatureFactor(t) {
  if (t == null) return 1;
  if (t >= 80) return 0;
  if (t >= 60) return 0.5;
  return 1;
}

// src/lib/paper.ts
var liveTrades = (trades) => trades.filter((t) => !t.ghost);
function paperPositions(trades, prices) {
  const agg = /* @__PURE__ */ new Map();
  for (const t of trades) {
    const a = agg.get(t.coinId) ?? { coinId: t.coinId, symbol: t.symbol, name: t.name, quantity: 0, costUsd: 0 };
    const fee = t.feeUsd ?? 0;
    if (t.type === "buy") {
      a.quantity += t.quantity;
      a.costUsd += t.quantity * t.priceUsd + fee;
    } else {
      const avgCost = a.quantity > 0 ? a.costUsd / a.quantity : 0;
      const qty = Math.min(t.quantity, a.quantity);
      a.quantity -= qty;
      a.costUsd = Math.max(0, a.costUsd - qty * avgCost);
    }
    if (a.quantity <= 1e-12) {
      a.quantity = 0;
      a.costUsd = Math.max(0, a.costUsd);
    }
    agg.set(t.coinId, a);
  }
  const positions = [...agg.values()].filter((a) => a.quantity > 0);
  const unpriced = positions.filter((p) => prices.get(p.coinId) == null).length;
  return {
    positions: positions.map(({ coinId, symbol, name, quantity, costUsd }) => ({ coinId, symbol, name, quantity, costUsd })),
    unpriced
  };
}
function paperStatus(startingUsd, trades, prices) {
  trades = liveTrades(trades);
  let cash = startingUsd;
  for (const t of trades) {
    const fee = t.feeUsd ?? 0;
    if (t.type === "buy") cash -= t.quantity * t.priceUsd + fee;
    else cash += t.quantity * t.priceUsd - fee;
  }
  const base = paperPositions(trades, prices);
  const positions = base.positions.map((p) => {
    const price = prices.get(p.coinId);
    const value = price != null ? p.quantity * price : null;
    return { ...p, priceUsd: price ?? null, valueUsd: value, pnlUsd: value != null ? value - p.costUsd : null, pnlPct: value != null && p.costUsd > 0 ? (value / p.costUsd - 1) * 100 : null };
  });
  positions.sort((a, b) => (b.valueUsd ?? b.costUsd) - (a.valueUsd ?? a.costUsd));
  const investedCostUsd = positions.reduce((s, p) => s + p.costUsd, 0);
  const valueUsd = positions.reduce((s, p) => s + (p.valueUsd ?? 0), 0);
  const totalUsd = cash + valueUsd;
  const totalInvestedUsd = trades.filter((t) => t.type === "buy").reduce((s, t) => s + t.quantity * t.priceUsd + (t.feeUsd ?? 0), 0);
  return {
    cashUsd: cash,
    investedCostUsd,
    valueUsd,
    totalUsd,
    pnlUsd: totalUsd - startingUsd,
    pnlPct: startingUsd > 0 ? (totalUsd / startingUsd - 1) * 100 : 0,
    totalInvestedUsd,
    positions,
    unpriced: base.unpriced
  };
}
function ghostTheses(trades, prices) {
  const ghosts = trades.filter((t) => t.ghost);
  const byCoin = /* @__PURE__ */ new Map();
  for (const t of ghosts) {
    const list3 = byCoin.get(t.coinId) ?? [];
    list3.push(t);
    byCoin.set(t.coinId, list3);
  }
  const out = [];
  for (const [coinId, list3] of byCoin) {
    const first = list3[0];
    let investedUsd = 0;
    let realizedUsd = 0;
    let openQty = 0;
    let fullyPricedBasis = true;
    for (const t of list3) {
      const fee = t.feeUsd ?? 0;
      if (t.type === "buy") {
        if (!(t.priceUsd > 0) || !Number.isFinite(t.priceUsd)) {
          fullyPricedBasis = false;
          continue;
        }
        investedUsd += t.quantity * t.priceUsd + fee;
        openQty += t.quantity;
      } else {
        if (!(t.priceUsd > 0)) continue;
        realizedUsd += t.quantity * t.priceUsd - fee;
        openQty = Math.max(0, openQty - t.quantity);
      }
    }
    const price = prices.get(coinId);
    const priced = price != null && Number.isFinite(price) && price > 0;
    const openValueUsd = priced ? openQty * price : null;
    const firstAt = list3.reduce((min, t) => (t.time ?? t.date) < min ? t.time ?? t.date : min, first.time ?? first.date);
    const pnlUsd = fullyPricedBasis && (openQty <= 0 || openValueUsd != null) ? realizedUsd + (openValueUsd ?? 0) - investedUsd : null;
    out.push({
      coinId,
      symbol: first.symbol,
      name: first.name,
      investedUsd,
      realizedUsd,
      openQty,
      priceUsd: priced ? price : null,
      openValueUsd,
      pnlUsd,
      pnlPct: null,
      firstAt,
      closed: openQty <= 1e-12
    });
  }
  for (const g of out) {
    if (g.pnlUsd == null || !Number.isFinite(g.pnlUsd) || !(g.investedUsd > 0)) continue;
    g.pnlUsd = Math.round(g.pnlUsd * 100) / 100;
    g.pnlPct = Math.round(g.pnlUsd / g.investedUsd * 100 * 100) / 100;
  }
  out.sort((a, b) => a.closed === b.closed ? b.firstAt.localeCompare(a.firstAt) : a.closed ? -1 : 1);
  return out;
}

// src/lib/macro.ts
var MACRO_LABEL = {
  fomc: "Fed (FOMC)",
  cpi: "Inflation US (CPI)",
  expiry: "\xC9ch\xE9ance d\xE9riv\xE9s BTC",
  halving: "Halving Bitcoin"
};
var MACRO_ADVICE = {
  fomc: "D\xE9cision de taux \xE0 19 h, puis conf\xE9rence de Powell \xE0 19 h 30 (Paris). Volatilit\xE9 garantie : \xE9vite de passer un ordre dans la demi-heure autour de l\u2019annonce, et garde ta r\xE9serve disponible 24 h.",
  cpi: "Publication \xE0 14 h 30 (Paris). Si tu dois acheter ou vendre, fais-le plut\xF4t \xE0 distance de 14 h 25-14 h 45 : la surprise est souvent violente puis dig\xE9r\xE9e.",
  expiry: "\xC9ch\xE9ance trimestrielle des futures et options Bitcoin (Deribit, 8 h UTC) : le cours peut bouger au matin sans raison visible, puis s\u2019apaiser. Pas de panique, pas d\u2019achat impulsif sur ce mouvement.",
  halving: "La r\xE9compense de bloc est divis\xE9e par deux : l\u2019offre neuve passe de ~450 \xE0 ~225 BTC/jour. Historiquement, les 12-18 mois qui suivent sont la partie la plus chaude du cycle \u2014 c\u2019est le moment o\xF9 tes paliers de vente servent."
};
var FOMC_DAYS = [
  "2026-01-28",
  "2026-03-18",
  "2026-04-29",
  "2026-06-17",
  "2026-07-29",
  "2026-09-16",
  "2026-10-28",
  "2026-12-09"
];
var CPI_DAYS = [
  "2026-01-13",
  "2026-02-11",
  "2026-03-11",
  "2026-04-10",
  "2026-05-12",
  "2026-06-10",
  "2026-07-14",
  "2026-08-12",
  "2026-09-11",
  "2026-10-15",
  "2026-11-12",
  "2026-12-15"
];
function lastFridayOf(year, month) {
  const last2 = new Date(year, month + 1, 0);
  const d = new Date(last2);
  d.setDate(d.getDate() - (d.getDay() + 2) % 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysToIso(isoDate, now) {
  const at = /* @__PURE__ */ new Date(isoDate + "T12:00:00");
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.round((at.getTime() - today.getTime()) / 864e5);
}
var mk = (kind, date, now, label) => ({
  id: `${kind}:${date}`,
  date,
  kind,
  label: label ?? MACRO_LABEL[kind],
  daysTo: daysToIso(date, now),
  advice: MACRO_ADVICE[kind]
});
function macroEvents(now) {
  const year = now.getFullYear();
  const ft = ["fomc", "cpi"];
  const out = [];
  for (const k of ft) for (const d of k === "fomc" ? FOMC_DAYS : CPI_DAYS) {
    if (daysToIso(d, now) >= -2 && daysToIso(d, now) < 400) out.push(mk(k, d, now));
  }
  for (let y = year - 2; y <= year + 2; y++) {
    const d = lastFridayOf(y, 11);
    if (daysToIso(d, now) >= -2 && daysToIso(d, now) < 400) out.push(mk("expiry", d, now));
    for (const m of [2, 5, 8]) {
      const q = lastFridayOf(y, m);
      if (daysToIso(q, now) >= -2 && daysToIso(q, now) < 400) out.push(mk("expiry", q, now));
    }
  }
  out.sort((a, b) => a.daysTo - b.daysTo);
  return out;
}
function nextMacroEvents(now, max = 4, withinDays = 60) {
  return macroEvents(now).filter((e) => e.daysTo >= 0 && e.daysTo <= withinDays).slice(0, max);
}

// src/runner/brief.ts
function nyEpoch(hour, minute, now) {
  let day;
  try {
    day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return null;
  }
  for (const off of ["-04:00", "-05:00"]) {
    const t = Date.parse(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${off}`);
    if (!Number.isFinite(t)) continue;
    try {
      const shown = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hourCycle: "h23" }).format(new Date(t));
      if (shown === `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`) return t;
    } catch {
      return null;
    }
  }
  return null;
}
function slotsOfDay(cfg, now) {
  const out = [{ id: "matin", label: "brief du matin", atMs: new Date(now.getFullYear(), now.getMonth(), now.getDate(), cfg.briefHour, 0, 0, 0).getTime() }];
  const usOpen = cfg.briefUsOpen ? nyEpoch(9, 30, now) : null;
  const usClose = cfg.briefUsClose ? nyEpoch(16, 0, now) : null;
  if (usOpen != null) out.push({ id: "us-open", label: "ouverture des march\xE9s am\xE9ricains", atMs: usOpen });
  if (usClose != null) out.push({ id: "us-close", label: "cl\xF4ture des march\xE9s am\xE9ricains", atMs: usClose });
  return out;
}
var HEAD_TOP = 3;
var list = (v) => Array.isArray(v) ? v : [];
function buildBrief(i) {
  const lines = [];
  const watch = watchOf(i.bundle);
  const today = isoDay(i.now);
  const cur = i.currency;
  const short = i.slot === "us-open" || i.slot === "us-close";
  lines.push(i.slot === "us-open" ? `Boussole \u2014 ouverture am\xE9ricaine \xB7 ${fmtDate(i.now)}` : i.slot === "us-close" ? `Boussole \u2014 cl\xF4ture am\xE9ricaine \xB7 ${fmtDate(i.now)}` : `Boussole \u2014 brief du ${fmtDate(i.now)}`);
  const btc = i.prices.bitcoin;
  const market = [];
  if (i.fng) market.push(`Fear & Greed ${i.fng.value} (${i.fng.label})`);
  if (i.temperature) market.push(`zone : ${i.temperature.zoneLabel} (${Math.round(i.temperature.value)}/100)`);
  if (i.cycleMetrics?.mvrv != null) market.push(`MVRV ${i.cycleMetrics.mvrv.toFixed(2).replace(".", ",")}\xD7`);
  if (i.cycleMetrics?.stableShare != null) market.push(`stablecoins ${i.cycleMetrics.stableShare.toFixed(1).replace(".", ",")} %`);
  if (btc?.usd != null) market.push(`BTC ${fmtPrice(btc.usd, "USD")}${btc.change != null ? ` (${fmtPct(btc.change, 1, true)} / 24 h)` : ""}`);
  lines.push(market.length ? `March\xE9 : ${market.join(" \xB7 ")}` : "March\xE9 : donn\xE9es indisponibles pour l\u2019instant.");
  const horizon = nextMacroEvents(i.now, 3, 21);
  if (horizon.length) {
    lines.push(`\xC0 l\u2019horizon : ${horizon.map((e) => `${e.label} ${e.daysTo === 0 ? "aujourd\u2019hui" : e.daysTo === 1 ? "demain" : `dans ${e.daysTo} j`}`).join(" \xB7 ")}`);
    const first = horizon[0];
    if (first.daysTo <= 3) lines.push(`${first.label} \u2014 ${first.advice}`);
  }
  if (i.cycleMetrics?.halvingDaysToNext != null && i.cycleMetrics.halvingDaysToNext > 0) {
    lines.push(`Cycle : prochain halving estim\xE9 dans ${Math.round(i.cycleMetrics.halvingDaysToNext / 30)} mois.`);
  }
  const priceOf = (coinId) => {
    const p = i.prices[coinId];
    if (!p || typeof p !== "object") return null;
    const v = cur === "EUR" ? p.eur : p.usd;
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  };
  let total = 0;
  let withoutPrice = 0;
  const rows = [];
  for (const p of buildPositions(watch.transactions).values()) {
    if (!(p.quantity > 0)) continue;
    const price = priceOf(p.coinId);
    if (price == null) {
      withoutPrice++;
      continue;
    }
    total += price * p.quantity;
    rows.push({ symbol: p.symbol, value: price * p.quantity, share: 0, change: i.prices[p.coinId]?.change ?? null });
  }
  rows.sort((a, b) => b.value - a.value);
  for (const r of rows) r.share = total > 0 ? r.value / total * 100 : 0;
  if (rows.length) {
    lines.push(`Portefeuille (journal) : ${fmtPrice(total, cur)}${withoutPrice ? ` \u2014 ${withoutPrice} ligne${withoutPrice > 1 ? "s" : ""} sans prix connu` : ""}`);
    lines.push(rows.slice(0, HEAD_TOP).map((r) => `${r.symbol.toUpperCase()} ${Math.round(r.share)} %${r.change != null ? ` (${fmtPct(r.change, 1, true)})` : ""}`).join(" \xB7 "));
  }
  const usd = /* @__PURE__ */ new Map();
  for (const [id, p] of Object.entries(i.prices)) if (typeof p?.usd === "number" && p.usd > 0) usd.set(id, p.usd);
  if (i.autopilots?.length) lines.push(["Autopilotes (papier) :", ...i.autopilots.map((l) => `\xB7 ${l}`)].join("\n"));
  const manuel = watch.paperPortfolios.find((p) => p.id === "manuel");
  const manualTrades = watch.paperTrades.filter((t) => !t.ghost && (t.portfolioId ?? "manuel") === "manuel");
  if (manuel && !manuel.archived && manualTrades.length) {
    const st = paperStatus(manuel.startingUsd, manualTrades, usd);
    if (st.positions.length) {
      const badge = st.pnlUsd >= 0 ? "+" : "";
      lines.push(`Papier (exp\xE9rimentations) : ${fmtPrice(st.totalUsd, "USD")} (${badge}${st.pnlPct.toFixed(1).replace(".", ",")} %)${st.unpriced ? `${st.unpriced} ligne${st.unpriced > 1 ? "s" : ""} sans prix` : ""}`);
    }
  }
  const ghosts = ghostTheses(watch.paperTrades, usd);
  if (ghosts.length) {
    const verdicts = ghosts.slice(0, 4).map((g) => `${g.symbol.toUpperCase()} ${g.pnlPct != null ? `${g.pnlPct >= 0 ? "+" : ""}${g.pnlPct.toFixed(0)} %` : "sans prix"}${g.closed ? " (close)" : ""}`);
    lines.push(`Achats fant\xF4mes (envies not\xE9es, pas achet\xE9es) : ${verdicts.join(", ")}${ghosts.length > 4 ? `\u2026 ${ghosts.length} lignes` : ""}`);
  }
  const plans = list(i.bundle.data.dcaPlans).filter((p) => p.active);
  const dcaExecs = list(i.bundle.data.dcaExecutions);
  const baskets = list(i.bundle.data.basket).filter((b) => b.active);
  const basketExecs = list(i.bundle.data.basketExecutions);
  const due = [];
  const upcoming = [];
  for (const b of baskets) {
    if (isBasketDay(b, i.now)) {
      const done = basketExecs.some((e) => e.basketId === b.id && e.periodKey === today);
      due.push(`panier \xAB ${b.name} \xBB ${done ? "(d\xE9j\xE0 pass\xE9 aujourd\u2019hui)" : `(${b.amountUsd} USDC)`}`);
    } else {
      const next = nextBasketOccurrences(b, i.now, 1)[0];
      if (next) upcoming.push(`panier \xAB ${b.name} \xBB ${fmtDate(next)}`);
    }
  }
  for (const p of plans) {
    if (isScheduledDay(p, i.now)) {
      const done = dcaExecs.some((e) => e.planId === p.id && e.periodKey === periodKey(p, i.now));
      due.push(`DCA ${p.name}${done ? " (d\xE9j\xE0 pass\xE9 aujourd\u2019hui)" : ""}`);
    } else {
      const next = nextOccurrences(p, i.now, 1)[0];
      if (next) upcoming.push(`DCA ${p.name} ${fmtDate(next)}`);
    }
  }
  if (due.length) lines.push(`Aujourd\u2019hui : ${due.join(" \xB7 ")}`);
  if (!short && upcoming.length) lines.push(`Prochaine \xE9ch\xE9ance : ${upcoming.join(" \xB7 ")}`);
  if (!short && !due.length && !upcoming.length) lines.push("Aucune \xE9ch\xE9ance DCA programm\xE9e.");
  const rungs = hitRungs(watch, usd);
  if (rungs.length) lines.push(`Paliers atteints non vendus : ${rungs.map((r) => `${r.symbol.toUpperCase()} \xD7${r.multiple} (vends ${r.pct} %)`).join(" \xB7 ")}`);
  if (!short) {
    const armed = watch.alerts.filter((a) => a.active && !a.triggeredAt).length;
    lines.push(`Alertes arm\xE9es : ${armed}`);
  }
  const news = i.news ?? [];
  const topNews = news.filter((n2) => n2.publishedAt > i.now.getTime() - 18 * 36e5).slice(0, 3);
  if (topNews.length) {
    lines.push(`Actus : ${topNews.map((n2) => `\xAB ${n2.title} \xBB${n2.source ? ` (${n2.source})` : ""}`).join(" \xB7 ")}`);
    for (const n2 of topNews) if (n2.resume) lines.push(`${n2.coinName} : ${n2.resume.replace(/\s+/g, " ").slice(0, 320)}`);
  }
  if (!short && i.vacationUntil) {
    lines.push(`Mode vacances jusqu'au ${i.vacationUntil} : veille critique uniquement \u2014 alertes de prix et paliers. \xC9ch\xE9ances et actus reprendront apr\xE8s.`);
  }
  const smart = i.smart ?? [];
  if (smart.length && !short) {
    lines.push(`Wallets suivis : ${smart[0]}`);
    for (const l of smart.slice(1)) lines.push(`  ${l}`);
  }
  const emerging = i.emerging ?? [];
  if (emerging.length && !short) {
    lines.push(`\xC9mergentes (Solana/Base, \xE0 scanner avant tout) : ${emerging[0]}`);
    for (const l of emerging.slice(1)) lines.push(`  ${l}`);
  }
  if (!short && i.syncSavedAt) {
    const when = new Date(i.syncSavedAt);
    if (!Number.isNaN(when.getTime())) lines.push(`Donn\xE9es de synchronisation : ${fmtDate(when, true)}${i.syncDevice ? ` (${i.syncDevice})` : ""}`);
  }
  return lines.join("\n");
}

// src/runner/news.ts
var HOT_WORDS = /(hack|pirat|hijack|exploit|breach|vol[eé]|stolen|liquidat|rug|scam|arnaque|sec\b|poursuite|lawsuit|interdiction|suspension|faillite|bankrupt|partenariat|partnership|listing|etf|approv|upgrade|mainnet|halving|acquisition|rach[ae]t|adoption|institutionnel|reserve|strategic)/i;
function isHotNews(item) {
  return HOT_WORDS.test(`${item.title} ${item.summaryText}`);
}
var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "\u2019", lsquo: "\u2018", ldquo: "\u201C", rdquo: "\u201D", ndash: "\u2013", mdash: "\u2014", hellip: "\u2026" };
function decode(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&#(\d+);/g, (_, n2) => String.fromCodePoint(Number(n2))).replace(/&#x([0-9a-f]+);/gi, (_, n2) => String.fromCodePoint(parseInt(n2, 16))).replace(/&([a-z]+);/gi, (m, n2) => ENTITIES[n2.toLowerCase()] ?? m);
}
var clean = (s) => decode(decode(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
}
function parseRss(xml, coin) {
  const out = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const block = m[0];
    const raw = clean(tag(block, "title"));
    const dash = raw.lastIndexOf(" - ");
    const title = (dash > 0 ? raw.slice(0, dash) : raw).trim();
    const fallbackSource = dash > 0 ? raw.slice(dash + 3).trim() : "";
    const url = decode(tag(block, "link")).trim() || decode(tag(block, "guid")).trim();
    const sourceTag = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    const source = sourceTag ? clean(sourceTag[1]) : fallbackSource;
    const time = Date.parse(decode(tag(block, "pubDate")).trim());
    if (!title || !/^https?:\/\//i.test(url) || !Number.isFinite(time)) continue;
    out.push({ coinId: coin.coinId, coinName: coin.name, title, url, source, publishedAt: time, summaryText: clean(tag(block, "description")).slice(0, 280) });
  }
  return out;
}
function newsKey(item) {
  let h = 2166136261;
  for (let i = 0; i < item.url.length; i++) {
    h ^= item.url.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `news:${h.toString(16)}`;
}
var TIMEOUT_MS = 15e3;
async function fetchCoinNews(coin, maxAgeMs, limit = 8) {
  try {
    const q = encodeURIComponent(`${coin.name} crypto`);
    const url = `https://news.google.com/rss/search?q=${q}&hl=fr&gl=FR&ceid=FR:fr`;
    const res = await fetch(url, { headers: { Accept: "application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return [];
    const items = parseRss(await res.text(), coin).filter((i) => i.publishedAt > 0 && i.publishedAt <= Date.now() + 36e5).filter((i) => Date.now() - i.publishedAt < maxAgeMs).sort((a, b) => b.publishedAt - a.publishedAt);
    return items.slice(0, limit);
  } catch {
    return [];
  }
}

// src/lib/smartmoney.ts
var eventKey = (e) => `sm:${e.walletId}:${e.txHash}:${e.mint}`;
function balancesByMint(rows, wallet, other) {
  const out = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const mint = r.mint;
    if (!mint) continue;
    const owner = r.owner ?? other.find((o) => o.accountIndex === r.accountIndex)?.owner ?? null;
    if (owner !== wallet) continue;
    out.set(mint, (out.get(mint) ?? 0) + (r.uiTokenAmount?.uiAmount ?? 0));
  }
  return out;
}
function solanaDeltas(tx, wallet) {
  const pre = balancesByMint(tx.meta?.preTokenBalances ?? [], wallet, tx.meta?.postTokenBalances ?? []);
  const post2 = balancesByMint(tx.meta?.postTokenBalances ?? [], wallet, tx.meta?.preTokenBalances ?? []);
  const atMs = (tx.blockTime ?? 0) * 1e3;
  const hash = tx.signature ?? "";
  const out = [];
  for (const [mint, after] of post2) {
    const before = pre.get(mint) ?? 0;
    const delta = after - before;
    if (Math.abs(delta) < 1e-9) continue;
    out.push({ mint, delta, atMs, hash });
  }
  return out;
}
var evmQty = (raw, decimals) => {
  if (!raw || !/^-?\d+$/.test(raw)) return null;
  const scale = decimals != null && decimals >= 0 && decimals <= 36 ? Math.pow(10, decimals) : null;
  const v = scale != null ? Number(raw) / scale : null;
  return v != null && Number.isFinite(v) ? v : null;
};
function evmDeltas(items, wallet) {
  const me = wallet.address.toLowerCase();
  const acc = /* @__PURE__ */ new Map();
  for (const it of items) {
    const tok = it.token;
    if (!tok?.address || tok.type && tok.type !== "ERC-20") continue;
    const qty = evmQty(it.total?.value, tok.decimals ?? null);
    if (qty == null || qty <= 0) continue;
    const addr = tok.address.toLowerCase();
    const from = (it.from?.hash ?? "").toLowerCase();
    const to = (it.to?.hash ?? "").toLowerCase();
    if (from !== me && to !== me) continue;
    const delta = to === me ? qty : -qty;
    const atMs = it.timestamp ? Date.parse(it.timestamp) : 0;
    const hash = it.tx_hash ?? "";
    const prev = acc.get(addr);
    if (prev) {
      if (prev.hash === hash) {
        prev.delta += delta;
        continue;
      }
    }
    acc.set(addr, { mint: addr, delta, symbol: tok.symbol ?? null, name: tok.name ?? null, atMs, hash });
  }
  return [...acc.values()].filter((d) => Math.abs(d.delta) > 1e-12);
}
var CHAIN_ALIASES = { eth: "ethereum", ethereum: "ethereum", solana: "solana", base: "base", bsc: "bsc", arbitrum: "arbitrum" };
var normChain = (c) => c ? CHAIN_ALIASES[c.toLowerCase()] ?? c.toLowerCase() : null;
function tokenMatches(ev, refs) {
  const evChain = normChain(ev.chain);
  const mint = ev.mint.toLowerCase();
  const sym = (ev.symbol ?? "").toUpperCase();
  for (const r of refs) {
    if (r.address && normChain(r.chain) === evChain && r.address.toLowerCase() === mint) return true;
    if (sym && r.symbol.toUpperCase() === sym) return true;
  }
  return false;
}
function relevantEvents(events, refs) {
  return events.filter((e) => tokenMatches(e, refs));
}
function refsOf(w) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (r) => {
    const k = `${r.chain ?? ""}:${r.address ?? r.symbol}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(r);
  };
  for (const t of w.watched) push({ chain: t.chainId, address: t.address, symbol: t.symbol });
  for (const p of w.positions) push({ symbol: p.symbol });
  for (const a of w.alerts) if (a.active && !a.triggeredAt) push({ symbol: a.symbol });
  return out;
}
var qtyLabel = (e) => {
  const q = e.uiAmount;
  const digits = q >= 1e3 ? 0 : q >= 1 ? 2 : 6;
  return `${q.toFixed(digits)} ${e.symbol ?? ""}`.trim();
};
function smartMessage(e, nowMs = Date.now()) {
  const ago = e.atMs > 0 ? Math.max(0, Math.round((nowMs - e.atMs) / 6e4)) : null;
  const when = ago != null ? ago < 60 ? `il y a ${ago} min` : ago < 2880 ? `il y a ${Math.round(ago / 60)} h` : `il y a ${Math.max(1, Math.round(ago / 1440))} j` : "";
  const tok = e.symbol ? `${e.symbol}${e.name ? ` (${e.name})` : ""}` : `${e.mint.slice(0, 4)}\u2026`;
  if (e.side === "sell") {
    return [
      `Smart money \u2014 ${e.walletLabel} VEND ${tok}`,
      `${qtyLabel(e)}${when ? `, ${when}` : ""}. Un wallet que tu suis pour ses r\xE9sultats se d\xE9charge de ce token.`,
      `C'est le signal pour relire ton plan de sortie : garde, all\xE8ge, ou sors \u2014 mais d\xE9cide \xE0 froid.`
    ].join("\n");
  }
  return [
    `Smart money \u2014 ${e.walletLabel} ach\xE8te ${tok}`,
    `${qtyLabel(e)}${when ? `, ${when}` : ""}. Ce wallet y entre : v\xE9rifie le projet avant toute id\xE9e d'imitation (achat fractionn\xE9, jamais tout d'un coup).`
  ].join("\n");
}
function smartBriefLines(events, nowMs = Date.now(), max = 4) {
  const recent = events.filter((e) => nowMs - e.atMs < 24 * 36e5);
  recent.sort((a, b) => b.atMs - a.atMs || (a.side === "sell" ? -1 : 1));
  const lines = [];
  for (const e of recent.slice(0, max)) {
    lines.push(`${e.side === "sell" ? "A vendu" : "A achet\xE9"} ${qtyLabel(e)} \u2014 ${e.walletLabel}`);
  }
  return lines;
}

// src/data/reliability.json
var reliability_default = {
  generatedAt: "2026-11-15",
  dataThrough: "2026-11-14",
  rulesVersion: 2,
  universe: {
    assets: 101,
    from: "2019-01-01",
    top: 50
  },
  entries: {
    "inv:Accumuler": {
      label: "Investisseur \xAB Accumuler \xBB",
      bias: "bull",
      horizon: 90,
      days: 52402,
      episodes: 2596,
      frequencyPct: 41.8942,
      hitPct: 48.4905,
      hitLow: 46.8865,
      hitHigh: 50.112,
      medianPct: -1.3998,
      excessMedianPct: 25e-4,
      worstMedianPct: -25.2705,
      baselineHitPct: 44.086,
      baselineMedianPct: -6.7213,
      control: {
        episodes: 1214,
        hitPct: 48.9737,
        medianPct: -0.8721,
        baselineHitPct: 41.1726
      },
      verdict: "valid\xE9"
    },
    "inv:All\xE9ger": {
      label: "Investisseur \xAB All\xE9ger \xBB",
      bias: "bear",
      horizon: 90,
      days: 24374,
      episodes: 2155,
      frequencyPct: 19.1691,
      hitPct: 29.5561,
      hitLow: 27.9686,
      hitHigh: 31.201,
      medianPct: -26.6746,
      excessMedianPct: -0.1362,
      worstMedianPct: -44.9939,
      baselineHitPct: 44.086,
      baselineMedianPct: -6.7213,
      control: {
        episodes: 1112,
        hitPct: 21.2589,
        medianPct: -30.567,
        baselineHitPct: 41.1726
      },
      verdict: "valid\xE9"
    },
    "inv:Conserver": {
      label: "Investisseur \xAB Conserver \xBB",
      bias: "neutral",
      horizon: 90,
      days: 42037,
      episodes: 4033,
      frequencyPct: 35.3166,
      hitPct: 44.4418,
      hitLow: 43.1505,
      hitHigh: 45.7238,
      medianPct: -5.4512,
      excessMedianPct: 0.0298,
      worstMedianPct: -29.9815,
      baselineHitPct: 44.086,
      baselineMedianPct: -6.7213,
      control: {
        episodes: 2228,
        hitPct: 43.9987,
        medianPct: -5.4138,
        baselineHitPct: 41.1726
      },
      verdict: "sans effet"
    },
    "inv:Prendre des profits": {
      label: "Investisseur \xAB Prendre des profits \xBB",
      bias: "bear",
      horizon: 90,
      days: 4632,
      episodes: 397,
      frequencyPct: 3.6201,
      hitPct: 67.487,
      hitLow: 63.5324,
      hitHigh: 71.2432,
      medianPct: 74.0817,
      excessMedianPct: 0,
      worstMedianPct: -25.8879,
      baselineHitPct: 44.086,
      baselineMedianPct: -6.7213,
      control: {
        episodes: 0,
        hitPct: null,
        medianPct: null,
        baselineHitPct: 41.1726
      },
      verdict: "trop peu de cas"
    },
    "plan:Achat fort@1.5": {
      label: "Plan de trade, signal \xAB Achat fort \xBB, objectif 1,5 R",
      bias: "bull",
      horizon: 30,
      days: 3607,
      episodes: 2750,
      frequencyPct: 2.819,
      hitPct: 45.1636,
      hitLow: 43.6081,
      hitHigh: 46.7287,
      medianPct: -1.0145,
      excessMedianPct: 1e-4,
      worstMedianPct: null,
      baselineHitPct: 40.2604,
      baselineMedianPct: -1.0146,
      control: {
        episodes: 1425,
        hitPct: 44.8421,
        medianPct: -1.0185,
        baselineHitPct: 37.8261
      },
      verdict: "sans effet",
      expectancyR: 0.0901
    },
    "plan:Achat fort@2": {
      label: "Plan de trade, signal \xAB Achat fort \xBB, objectif 2 R",
      bias: "bull",
      horizon: 30,
      days: 3607,
      episodes: 2750,
      frequencyPct: 2.819,
      hitPct: 39.3455,
      hitLow: 37.8242,
      hitHigh: 40.8876,
      medianPct: -1.0203,
      excessMedianPct: -3e-3,
      worstMedianPct: null,
      baselineHitPct: 35.734,
      baselineMedianPct: -1.0173,
      control: {
        episodes: 1425,
        hitPct: 39.0175,
        medianPct: -1.0239,
        baselineHitPct: 32.9752
      },
      verdict: "sans effet",
      expectancyR: 0.1255
    },
    "plan:Achat fort@3": {
      label: "Plan de trade, signal \xAB Achat fort \xBB, objectif 3 R",
      bias: "bull",
      horizon: 30,
      days: 3607,
      episodes: 2750,
      frequencyPct: 2.819,
      hitPct: 33.9636,
      hitLow: 32.4945,
      hitHigh: 35.4643,
      medianPct: -1.0236,
      excessMedianPct: -43e-4,
      worstMedianPct: null,
      baselineHitPct: 31.5509,
      baselineMedianPct: -1.0192,
      control: {
        episodes: 1425,
        hitPct: 34.2456,
        medianPct: -1.0263,
        baselineHitPct: 28.5688
      },
      verdict: "valid\xE9",
      expectancyR: 0.2338
    },
    "plan:Achat@1.5": {
      label: "Plan de trade, signal \xAB Achat \xBB, objectif 1,5 R",
      bias: "bull",
      horizon: 30,
      days: 1287,
      episodes: 1180,
      frequencyPct: 1.0059,
      hitPct: 43.0508,
      hitLow: 40.6983,
      hitHigh: 45.4352,
      medianPct: -1.0179,
      excessMedianPct: -33e-4,
      worstMedianPct: null,
      baselineHitPct: 40.2604,
      baselineMedianPct: -1.0146,
      control: {
        episodes: 638,
        hitPct: 41.6928,
        medianPct: -1.0226,
        baselineHitPct: 37.8261
      },
      verdict: "sans effet",
      expectancyR: 0.0395
    },
    "plan:Achat@2": {
      label: "Plan de trade, signal \xAB Achat \xBB, objectif 2 R",
      bias: "bull",
      horizon: 30,
      days: 1287,
      episodes: 1180,
      frequencyPct: 1.0059,
      hitPct: 38.2203,
      hitLow: 35.9228,
      hitHigh: 40.5718,
      medianPct: -1.0225,
      excessMedianPct: -52e-4,
      worstMedianPct: null,
      baselineHitPct: 35.734,
      baselineMedianPct: -1.0173,
      control: {
        episodes: 638,
        hitPct: 36.2069,
        medianPct: -1.0251,
        baselineHitPct: 32.9752
      },
      verdict: "sans effet",
      expectancyR: 0.0942
    },
    "plan:Achat@3": {
      label: "Plan de trade, signal \xAB Achat \xBB, objectif 3 R",
      bias: "bull",
      horizon: 30,
      days: 1287,
      episodes: 1180,
      frequencyPct: 1.0059,
      hitPct: 32.1186,
      hitLow: 29.9257,
      hitHigh: 34.3934,
      medianPct: -1.0253,
      excessMedianPct: -61e-4,
      worstMedianPct: null,
      baselineHitPct: 31.5509,
      baselineMedianPct: -1.0192,
      control: {
        episodes: 638,
        hitPct: 28.9969,
        medianPct: -1.0283,
        baselineHitPct: 28.5688
      },
      verdict: "sans effet",
      expectancyR: 0.1682
    },
    "plan:Neutre@1.5": {
      label: "Plan de trade, signal \xAB Neutre \xBB, objectif 1,5 R",
      bias: "bull",
      horizon: 30,
      days: 123057,
      episodes: 4252,
      frequencyPct: 96.1751,
      hitPct: 43.2839,
      hitLow: 42.0285,
      hitHigh: 44.5275,
      medianPct: -1.0137,
      excessMedianPct: 9e-4,
      worstMedianPct: null,
      baselineHitPct: 40.2604,
      baselineMedianPct: -1.0146,
      control: {
        episodes: 2289,
        hitPct: 39.3357,
        medianPct: -1.0199,
        baselineHitPct: 37.8261
      },
      verdict: "sans effet",
      expectancyR: 0.0502
    },
    "plan:Neutre@2": {
      label: "Plan de trade, signal \xAB Neutre \xBB, objectif 2 R",
      bias: "bull",
      horizon: 30,
      days: 123057,
      episodes: 4252,
      frequencyPct: 96.1751,
      hitPct: 38.2733,
      hitLow: 37.0461,
      hitHigh: 39.4976,
      medianPct: -1.0178,
      excessMedianPct: -5e-4,
      worstMedianPct: null,
      baselineHitPct: 35.734,
      baselineMedianPct: -1.0173,
      control: {
        episodes: 2289,
        hitPct: 33.8724,
        medianPct: -1.0236,
        baselineHitPct: 32.9752
      },
      verdict: "sans effet",
      expectancyR: 0.0913
    },
    "plan:Neutre@3": {
      label: "Plan de trade, signal \xAB Neutre \xBB, objectif 3 R",
      bias: "bull",
      horizon: 30,
      days: 123057,
      episodes: 4252,
      frequencyPct: 96.1751,
      hitPct: 33.545,
      hitLow: 32.3569,
      hitHigh: 34.7383,
      medianPct: -1.0208,
      excessMedianPct: -15e-4,
      worstMedianPct: null,
      baselineHitPct: 31.5509,
      baselineMedianPct: -1.0192,
      control: {
        episodes: 2289,
        hitPct: 29.2395,
        medianPct: -1.0256,
        baselineHitPct: 28.5688
      },
      verdict: "sans effet",
      expectancyR: 0.1898
    },
    "setup:breakout": {
      label: "Cassure avec volume",
      bias: "bull",
      horizon: 30,
      days: 4891,
      episodes: 3580,
      frequencyPct: 3.8249,
      hitPct: 52.2593,
      hitLow: 50.8881,
      hitHigh: 53.6336,
      medianPct: 2.2388,
      excessMedianPct: -0.0217,
      worstMedianPct: -17.2086,
      baselineHitPct: 45.5186,
      baselineMedianPct: -2.6854,
      control: {
        episodes: 1851,
        hitPct: 51.0655,
        medianPct: 0.8329,
        baselineHitPct: 43.1175
      },
      verdict: "valid\xE9"
    },
    "setup:macd": {
      label: "Relance MACD",
      bias: "bull",
      horizon: 30,
      days: 5664,
      episodes: 2317,
      frequencyPct: 4.4431,
      hitPct: 49.2055,
      hitLow: 47.495,
      hitHigh: 50.91,
      medianPct: -0.6946,
      excessMedianPct: 0.3811,
      worstMedianPct: -16.4064,
      baselineHitPct: 45.5186,
      baselineMedianPct: -2.6854,
      control: {
        episodes: 1286,
        hitPct: 45.7835,
        medianPct: -2.5809,
        baselineHitPct: 43.1175
      },
      verdict: "prometteur"
    },
    "setup:oversold": {
      label: "Survente + rebond",
      bias: "bull",
      horizon: 30,
      days: 1061,
      episodes: 844,
      frequencyPct: 0.8331,
      hitPct: 48.4449,
      hitLow: 45.6393,
      hitHigh: 51.2899,
      medianPct: -1.0744,
      excessMedianPct: 0.881,
      worstMedianPct: -15.2655,
      baselineHitPct: 45.5186,
      baselineMedianPct: -2.6854,
      control: {
        episodes: 486,
        hitPct: 44.7712,
        medianPct: -2.3908,
        baselineHitPct: 43.1175
      },
      verdict: "sans effet"
    },
    "temp:accumulation": {
      label: "Temp\xE9rature : Accumulation (Bitcoin)",
      bias: "bull",
      horizon: 365,
      days: 597,
      episodes: 64,
      frequencyPct: 27.5826,
      hitPct: 67.3367,
      hitLow: 57.0077,
      hitHigh: 75.9728,
      medianPct: 95.5513,
      excessMedianPct: 47.3919,
      worstMedianPct: -27.3742,
      baselineHitPct: 64.1833,
      baselineMedianPct: 43.8944,
      control: {
        episodes: 21,
        hitPct: 87.1429,
        medianPct: 114.1492,
        baselineHitPct: 65.7769
      },
      verdict: "valid\xE9"
    },
    "temp:capitulation": {
      label: "Temp\xE9rature : Peur extr\xEAme (Bitcoin)",
      bias: "bull",
      horizon: 365,
      days: 319,
      episodes: 13,
      frequencyPct: 14.6435,
      hitPct: 89.0282,
      hitLow: 71.7719,
      hitHigh: 98.265,
      medianPct: 58.6422,
      excessMedianPct: 75.6636,
      worstMedianPct: -19.6594,
      baselineHitPct: 64.1833,
      baselineMedianPct: 43.8944,
      control: {
        episodes: 0,
        hitPct: 100,
        medianPct: 162.145,
        baselineHitPct: 65.7769
      },
      verdict: "trop peu de cas"
    },
    "temp:chaleur": {
      label: "Temp\xE9rature : March\xE9 chaud (Bitcoin)",
      bias: "bear",
      horizon: 365,
      days: 510,
      episodes: 46,
      frequencyPct: 17.7391,
      hitPct: 53.9216,
      hitLow: 42.363,
      hitHigh: 65.8495,
      medianPct: 7.4446,
      excessMedianPct: 34.0392,
      worstMedianPct: -28.2102,
      baselineHitPct: 64.1833,
      baselineMedianPct: 43.8944,
      control: {
        episodes: 21,
        hitPct: 56.2016,
        medianPct: 16.0337,
        baselineHitPct: 65.7769
      },
      verdict: "prometteur"
    },
    "temp:euphorie": {
      label: "Temp\xE9rature : Euphorie (Bitcoin)",
      bias: "bear",
      horizon: 365,
      days: 106,
      episodes: 10,
      frequencyPct: 3.687,
      hitPct: 42.4528,
      hitLow: 19.4214,
      hitHigh: 64.838,
      medianPct: -10.7813,
      excessMedianPct: -11.8383,
      worstMedianPct: -39.9143,
      baselineHitPct: 64.1833,
      baselineMedianPct: 43.8944,
      control: {
        episodes: 0,
        hitPct: null,
        medianPct: null,
        baselineHitPct: 65.7769
      },
      verdict: "trop peu de cas"
    },
    "temp:neutre": {
      label: "Temp\xE9rature : Neutre (Bitcoin)",
      bias: "neutral",
      horizon: 365,
      days: 978,
      episodes: 87,
      frequencyPct: 36.3478,
      hitPct: 61.8609,
      hitLow: 53.2697,
      hitHigh: 70.1401,
      medianPct: 59.2219,
      excessMedianPct: 37.0194,
      worstMedianPct: -27.798,
      baselineHitPct: 64.1833,
      baselineMedianPct: 43.8944,
      control: {
        episodes: 41,
        hitPct: 61.5114,
        medianPct: 75.9449,
        baselineHitPct: 65.7769
      },
      verdict: "sans effet"
    },
    "tr:Achat": {
      label: "Trader \xAB Achat \xBB",
      bias: "bull",
      horizon: 14,
      days: 1287,
      episodes: 1180,
      frequencyPct: 1.0059,
      hitPct: 51.826,
      hitLow: 49.4702,
      hitHigh: 54.2501,
      medianPct: 1.1197,
      excessMedianPct: 0.0315,
      worstMedianPct: -11.4301,
      baselineHitPct: 46.5857,
      baselineMedianPct: -1.27,
      control: {
        episodes: 638,
        hitPct: 48.5714,
        medianPct: -0.3729,
        baselineHitPct: 44.5362
      },
      verdict: "prometteur"
    },
    "tr:Achat fort": {
      label: "Trader \xAB Achat fort \xBB",
      bias: "bull",
      horizon: 14,
      days: 3607,
      episodes: 2750,
      frequencyPct: 2.819,
      hitPct: 51.1228,
      hitLow: 49.5589,
      hitHigh: 52.6934,
      medianPct: 0.7177,
      excessMedianPct: -0.2868,
      worstMedianPct: -13.3958,
      baselineHitPct: 46.5857,
      baselineMedianPct: -1.27,
      control: {
        episodes: 1425,
        hitPct: 52.0701,
        medianPct: 1.4354,
        baselineHitPct: 44.5362
      },
      verdict: "valid\xE9"
    },
    "tr:Neutre": {
      label: "Trader \xAB Neutre \xBB",
      bias: "neutral",
      horizon: 14,
      days: 122351,
      episodes: 4236,
      frequencyPct: 96.1751,
      hitPct: 46.3968,
      hitLow: 45.1304,
      hitHigh: 47.6504,
      medianPct: -1.3316,
      excessMedianPct: 0,
      worstMedianPct: -11.4232,
      baselineHitPct: 46.5857,
      baselineMedianPct: -1.27,
      control: {
        episodes: 2273,
        hitPct: 44.2837,
        medianPct: -1.8605,
        baselineHitPct: 44.5362
      },
      verdict: "sans effet"
    }
  }
};

// src/lib/lab/reliability.ts
var VERDICTS = /* @__PURE__ */ new Set(["valid\xE9", "prometteur", "sans effet", "invers\xE9", "trop peu de cas"]);
var NUM = ["horizon", "days", "episodes", "frequencyPct", "hitPct", "hitLow", "hitHigh", "medianPct", "excessMedianPct", "baselineHitPct", "baselineMedianPct"];
var isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
var isNum = (x) => typeof x === "number" || x === null;
function validateReliability(x) {
  if (!isObj(x) || typeof x.rulesVersion !== "number" || typeof x.generatedAt !== "string" || !isObj(x.universe) || !isObj(x.entries)) return null;
  for (const e of Object.values(x.entries)) {
    if (!isObj(e) || typeof e.label !== "string" || !VERDICTS.has(e.verdict) || !isObj(e.control)) return null;
    if (NUM.some((k) => !isNum(e[k]))) return null;
  }
  return x;
}
var EMPTY = { generatedAt: "", dataThrough: "", rulesVersion: -1, universe: { assets: 0, from: "2019-01-01", top: 50 }, entries: {} };
var RELIABILITY = validateReliability(reliability_default) ?? EMPTY;
function reliabilityOf(key) {
  return RELIABILITY.entries[key] ?? null;
}
var reliabilityFromYear = () => Number(RELIABILITY.universe.from.slice(0, 4)) || 2019;
var fr0 = (x) => String(Math.round(x));
var frR = (x) => `${x >= 0 ? "+" : ""}${(Math.round(x * 100) / 100).toFixed(2).replace(".", ",")}`;
function reliabilityPhrase(e, fromYear = reliabilityFromYear()) {
  if (!e) return "Fiabilit\xE9 non mesur\xE9e.";
  if (e.verdict === "trop peu de cas") return `Pas assez de cas pour juger (${e.episodes} fois depuis ${fromYear}).`;
  if (e.expectancyR != null) return `Depuis ${fromYear} : vu ${e.episodes} fois. Esp\xE9rance ${frR(e.expectancyR)} R par trade, frais compris. Verdict : ${e.verdict}.`;
  return `Depuis ${fromYear} : vu ${e.episodes} fois. En hausse ${e.horizon} jours apr\xE8s dans ${fr0(e.hitPct)} % des cas (un jour quelconque : ${fr0(e.baselineHitPct)} %). Verdict : ${e.verdict}.`;
}

// src/lib/signals.ts
var SIGNALS_VERSION = 2;
var MIN_BARS_FOR_BUY = 200;
function labelFor(score, horizon) {
  const labels = horizon === "investor" ? ["Prendre des profits", "All\xE9ger", "Conserver", "Accumuler", "Accumuler fort"] : ["Vente forte", "Vente", "Neutre", "Achat", "Achat fort"];
  if (score >= 45) return { label: labels[4], tone: "up", strength: 2 };
  if (score >= 15) return { label: labels[3], tone: "up", strength: 1 };
  if (score > -15) return { label: labels[2], tone: "neutral", strength: 0 };
  if (score > -45) return { label: labels[1], tone: "down", strength: 1 };
  return { label: labels[0], tone: "down", strength: 2 };
}
function combine(factors, horizon, bars) {
  const usable = factors.filter((f) => Number.isFinite(f.vote));
  const wsum = usable.reduce((s, f) => s + f.weight, 0);
  const raw = usable.reduce((s, f) => s + f.vote * f.weight, 0);
  const score = wsum > 0 ? Math.round(raw / (2 * wsum) * 100) : 0;
  let l = labelFor(score, horizon);
  const confidence = bars >= 200 && usable.length >= 4 ? "haute" : bars >= 100 ? "moyenne" : "faible";
  let limitedBy;
  if (bars < MIN_BARS_FOR_BUY && l.tone === "up") {
    l = { label: horizon === "investor" ? "Conserver" : "Neutre", tone: "neutral", strength: 0 };
    limitedBy = `Seulement ${bars} jours d\u2019historique : moins de 200, donc pas de signal d\u2019achat (le score ${score > 0 ? "+" : ""}${score} est indicatif).`;
  }
  return { score, ...l, factors: usable, confidence, limitedBy };
}
var pct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} %`;
var num = (v, d = 2) => v.toFixed(d).replace(".", ",");
var isHot = (t) => t != null && t >= TEMPERATURE.warm && t < TEMPERATURE.euphoria;
var INVESTOR_TABLE = [
  {
    label: "Prendre des profits",
    tone: "down",
    strength: 2,
    when: (f) => f.temperature != null && f.temperature >= TEMPERATURE.euphoria,
    why: (f) => `Euphorie (temp\xE9rature ${Math.round(f.temperature ?? 0)}/100) : \xE9tat de risque, une tranche peut \xEAtre all\xE9g\xE9e. Trop peu de cas historiques pour mesurer sa fiabilit\xE9.`
  },
  {
    label: "All\xE9ger",
    tone: "down",
    strength: 1,
    when: (f) => f.excess || !f.isBitcoin && isHot(f.temperature),
    why: (f) => f.excess ? "Exc\xE8s (RSI hebdomadaire au-dessus de 80 ou prix \xE0 plus de 2 fois sa moyenne 200 jours) : dans l\u2019historique, la baisse qui a suivi a \xE9t\xE9 nettement plus profonde qu\u2019un jour quelconque." : `March\xE9 chaud (temp\xE9rature ${Math.round(f.temperature ?? 0)}/100) : pour une altcoin, la suite a \xE9t\xE9 nettement moins bonne qu\u2019un jour quelconque dans l\u2019historique, avec une baisse plus profonde.`
  },
  // « Accumuler fort » a manqué sa condition de sortie (+7,4 points au lieu de +8) : sa condition rejoint « Accumuler ».
  {
    label: "Accumuler",
    tone: "up",
    strength: 1,
    when: (f) => f.enoughHistory && (f.strongScore || f.temperature != null && f.temperature < TEMPERATURE.fear),
    why: (f) => f.temperature != null && f.temperature < TEMPERATURE.fear ? `Temp\xE9rature du march\xE9 sous 40 (${Math.round(f.temperature)}/100) : zone d\u2019accumulation ou de peur, valid\xE9e sur la p\xE9riode de contr\xF4le.` : "Score composite fort (\u2265 45) : tendance, valorisation et cycle align\xE9s, valid\xE9 sur la p\xE9riode de contr\xF4le."
  },
  { label: "Conserver", tone: "neutral", strength: 0, when: () => true, why: () => "Aucune condition mesur\xE9e comme fiable n\u2019est r\xE9unie : rien \xE0 faire." }
];
function investorV2(v1, temperature, bars, excess, isBitcoin) {
  const f = { strongScore: v1.score >= 45, temperature, enoughHistory: bars >= MIN_BARS_FOR_BUY, excess, isBitcoin };
  const line = INVESTOR_TABLE.find((l) => l.when(f));
  const blocked = !f.enoughHistory && line.tone === "neutral" && (v1.score >= 45 || temperature != null && temperature < TEMPERATURE.fear);
  return { ...v1, label: line.label, tone: line.tone, strength: line.strength, why: line.why(f), limitedBy: blocked ? v1.limitedBy ?? `Seulement ${bars} jours d\u2019historique : moins de 200, donc pas de signal d\u2019achat.` : void 0 };
}
function traderV2(v1, breakoutVolume) {
  if (breakoutVolume == null) return { ...v1, label: "Neutre", tone: "neutral", strength: 0, score: 0, why: "Pas de cassure valid\xE9e : aucun signal trader fiable." };
  const strong = breakoutVolume >= 2;
  const score = Math.round(Math.min(100, 40 + (breakoutVolume - 1.5) * 40));
  return { ...v1, label: strong ? "Achat fort" : "Achat", tone: "up", strength: strong ? 2 : 1, score, why: `Cassure des plus hauts 20 jours avec un volume \xD7${breakoutVolume.toFixed(1).replace(".", ",")}${strong ? " (\xD72 ou plus)" : ""} : valid\xE9e sur la p\xE9riode de contr\xF4le. Plan mesur\xE9 : stop jug\xE9 \xE0 la cl\xF4ture, objectif 3 R (esp\xE9rance positive avec les frais d\u2019une plateforme, nulle sur 2025-2026).` };
}
function analyze(candles, ctx = {}, opts = {}) {
  if (candles.length < 30) return null;
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const r = rsi(closes, 14);
  const m = macd(closes);
  const bb = bollinger(closes, 20, 2);
  const a = atr(candles, 14);
  const weekly = toWeekly(candles);
  const rw = rsi(weekly.map((w) => w.close), 14);
  const sma20 = last(s20) ?? NaN;
  const sma50 = last(s50) ?? NaN;
  const sma200 = last(s200) ?? NaN;
  const rsi14 = last(r) ?? NaN;
  const rsiWeekly = last(rw) ?? NaN;
  const mayer = Number.isFinite(sma200) && sma200 > 0 ? price / sma200 : NaN;
  const atr14 = last(a) ?? NaN;
  const atrPct = Number.isFinite(atr14) ? atr14 / price * 100 : NaN;
  const inv = [];
  if (Number.isFinite(sma200)) {
    const slope = slopePct(s200, 20);
    const above = price > sma200;
    let vote;
    let detail;
    if (above && slope > 0) {
      vote = 2;
      detail = `Prix au-dessus d'une moyenne 200 jours qui monte (${pct(slope)} sur 20 j) : tendance de fond haussi\xE8re.`;
    } else if (above) {
      vote = 1;
      detail = "Prix au-dessus de la moyenne 200 jours, mais celle-ci plafonne : tendance \xE0 confirmer.";
    } else if (slope > 0) {
      vote = 0;
      detail = "Repli sous une moyenne 200 jours encore haussi\xE8re : zone de test, surveille la r\xE9action.";
    } else {
      vote = -2;
      detail = `Prix sous une moyenne 200 jours qui baisse (${pct(slope)} sur 20 j) : tendance de fond baissi\xE8re, la patience paie.`;
    }
    inv.push({ key: "trend200", label: "Tendance de fond (MM200)", detail, vote, weight: 3 });
    let mv;
    let md;
    if (mayer < 0.8) {
      mv = 2;
      md = `Prix \xE0 ${num(mayer)}\xD7 sa moyenne 200 j : historiquement une zone \xAB sold\xE9e \xBB d'accumulation.`;
    } else if (mayer < 1) {
      mv = 1;
      md = `Prix l\xE9g\xE8rement sous sa moyenne 200 j (${num(mayer)}\xD7) : valorisation attractive.`;
    } else if (mayer < 1.5) {
      mv = 0;
      md = `Multiple de Mayer ${num(mayer)} : valorisation normale.`;
    } else if (mayer < 2) {
      mv = -1;
      md = `Multiple de Mayer ${num(mayer)} : le prix s'\xE9tire au-dessus de sa moyenne, marge de s\xE9curit\xE9 r\xE9duite.`;
    } else {
      mv = -2;
      md = `Multiple de Mayer ${num(mayer)} : surchauffe, historiquement zone de prises de profits.`;
    }
    inv.push({ key: "mayer", label: "Valorisation (multiple de Mayer)", detail: md, vote: mv, weight: 3 });
  }
  if (Number.isFinite(sma50) && Number.isFinite(sma200)) {
    const cross = lastCross(s50, s200, 20);
    let vote;
    let detail;
    if (cross?.dir === 1) {
      vote = 2;
      detail = `Croisement dor\xE9 il y a ${cross.barsAgo} j (MM50 passe au-dessus de la MM200).`;
    } else if (cross?.dir === -1) {
      vote = -2;
      detail = `Croisement de la mort il y a ${cross.barsAgo} j (MM50 passe sous la MM200).`;
    } else if (sma50 > sma200) {
      vote = 1;
      detail = "MM50 au-dessus de la MM200 : structure haussi\xE8re.";
    } else {
      vote = -1;
      detail = "MM50 sous la MM200 : structure baissi\xE8re.";
    }
    inv.push({ key: "cross", label: "Structure (MM50 / MM200)", detail, vote, weight: 2 });
  }
  if (Number.isFinite(rsiWeekly)) {
    let vote = 0;
    let detail = `RSI hebdo ${Math.round(rsiWeekly)} : zone neutre.`;
    if (rsiWeekly < 30) {
      vote = 2;
      detail = `RSI hebdo ${Math.round(rsiWeekly)} : survente rare sur ce temps long, opportunit\xE9 historique.`;
    } else if (rsiWeekly < 45) {
      vote = 1;
      detail = `RSI hebdo ${Math.round(rsiWeekly)} : momentum faible, prix plut\xF4t bas.`;
    } else if (rsiWeekly > 80) {
      vote = -2;
      detail = `RSI hebdo ${Math.round(rsiWeekly)} : euphorie, risque de correction violente.`;
    } else if (rsiWeekly > 65) {
      vote = -1;
      detail = `RSI hebdo ${Math.round(rsiWeekly)} : march\xE9 chaud.`;
    }
    inv.push({ key: "rsiw", label: "Momentum long (RSI hebdo)", detail, vote, weight: 2 });
  }
  if (ctx.athChangePct != null && Number.isFinite(ctx.athChangePct)) {
    const d = ctx.athChangePct;
    let vote = 0;
    let detail = `\xC0 ${pct(d)} de son plus haut historique.`;
    if (d <= -85) {
      vote = 0;
      detail = `\xC0 ${pct(d)} de son ATH : soit une opportunit\xE9, soit un projet en d\xE9clin. V\xE9rifie les fondamentaux avant tout.`;
    } else if (d <= -50) {
      vote = 1;
      detail = `\xC0 ${pct(d)} de son ATH : forte d\xE9cote si le projet est toujours solide.`;
    } else if (d > -15) {
      vote = -1;
      detail = `\xC0 ${pct(d)} de son ATH : peu de marge de s\xE9curit\xE9.`;
    }
    inv.push({ key: "ath", label: "Distance au plus haut (ATH)", detail, vote, weight: 1 });
  }
  if (ctx.temperature != null && Number.isFinite(ctx.temperature)) {
    const t = ctx.temperature;
    let vote = 0;
    let detail = `Temp\xE9rature du march\xE9 ${Math.round(t)}/100 : neutre.`;
    if (t < TEMPERATURE.extremeFear) {
      vote = 2;
      detail = `Temp\xE9rature ${Math.round(t)}/100 : peur extr\xEAme, les meilleures opportunit\xE9s naissent ici.`;
    } else if (t < TEMPERATURE.fear) {
      vote = 1;
      detail = `Temp\xE9rature ${Math.round(t)}/100 : climat d'accumulation.`;
    } else if (t >= TEMPERATURE.euphoria) {
      vote = -2;
      detail = `Temp\xE9rature ${Math.round(t)}/100 : euphorie g\xE9n\xE9rale, s\xE9curise des gains.`;
    } else if (t >= TEMPERATURE.warm) {
      vote = -1;
      detail = `Temp\xE9rature ${Math.round(t)}/100 : march\xE9 chaud, sois s\xE9lectif.`;
    }
    inv.push({ key: "cycle", label: "Contexte de march\xE9 (cycle)", detail, vote, weight: 2 });
  }
  const tr = [];
  if (Number.isFinite(sma20) && Number.isFinite(sma50)) {
    let vote;
    let detail;
    if (price > sma20 && sma20 > sma50) {
      vote = 2;
      detail = "Prix > MM20 > MM50 : tendance court terme haussi\xE8re bien align\xE9e.";
    } else if (price > sma20) {
      vote = 1;
      detail = "Prix repasse au-dessus de la MM20 : tentative de rebond.";
    } else if (sma20 > sma50) {
      vote = -1;
      detail = "Prix sous la MM20 dans une tendance encore haussi\xE8re : repli en cours.";
    } else {
      vote = -2;
      detail = "Prix < MM20 < MM50 : tendance court terme baissi\xE8re.";
    }
    tr.push({ key: "trend", label: "Tendance court terme", detail, vote, weight: 3 });
  }
  {
    const h0 = last(m.hist) ?? NaN;
    const h1 = last(m.hist, 1) ?? NaN;
    const line = last(m.macd) ?? NaN;
    if (Number.isFinite(h0) && Number.isFinite(h1) && Number.isFinite(line)) {
      const cross = lastCross(m.macd, m.signal, 3);
      let vote;
      let detail;
      if (cross?.dir === 1) {
        vote = line > 0 ? 2 : 1;
        detail = `Croisement haussier du MACD il y a ${cross.barsAgo} j${line > 0 ? "" : " (sous la ligne z\xE9ro : \xE0 confirmer)"}.`;
      } else if (cross?.dir === -1) {
        vote = line < 0 ? -2 : -1;
        detail = `Croisement baissier du MACD il y a ${cross.barsAgo} j${line < 0 ? "" : " (encore au-dessus de z\xE9ro)"}.`;
      } else if (line > 0 && h0 > 0) {
        vote = h0 >= h1 ? 2 : 1;
        detail = h0 >= h1 ? "MACD positif et en acc\xE9l\xE9ration." : "MACD positif, le momentum ralentit un peu.";
      } else if (line < 0 && h0 < 0) {
        vote = h0 <= h1 ? -2 : -1;
        detail = h0 <= h1 ? "MACD n\xE9gatif et en acc\xE9l\xE9ration baissi\xE8re." : "MACD n\xE9gatif, la baisse ralentit.";
      } else if (line > 0) {
        vote = 0;
        detail = "MACD positif mais sous son signal : essoufflement.";
      } else {
        vote = 0;
        detail = "MACD n\xE9gatif mais au-dessus de son signal : la pression vendeuse s\u2019att\xE9nue.";
      }
      tr.push({ key: "macd", label: "Momentum (MACD)", detail, vote, weight: 2 });
    }
  }
  if (Number.isFinite(rsi14)) {
    const downTrend = Number.isFinite(sma50) && price < sma50;
    const upTrend = Number.isFinite(sma50) && price > sma50;
    let vote = 0;
    let detail = `RSI ${Math.round(rsi14)} : ni exc\xE8s d'achat ni de vente.`;
    if (rsi14 < 30) {
      vote = downTrend ? 1 : 2;
      detail = downTrend ? `RSI ${Math.round(rsi14)} : survente, mais contre la tendance \u2014 rebond technique possible, pas encore un retournement.` : `RSI ${Math.round(rsi14)} : survente, un rebond est fr\xE9quent.`;
    } else if (rsi14 < 40) {
      vote = downTrend ? 0 : 1;
      detail = `RSI ${Math.round(rsi14)} : proche de la survente.`;
    } else if (rsi14 > 75) {
      vote = upTrend ? -1 : -2;
      detail = upTrend ? `RSI ${Math.round(rsi14)} : surachat dans une tendance forte \u2014 risque de pause ou de correction.` : `RSI ${Math.round(rsi14)} : surachat marqu\xE9, risque de correction.`;
    } else if (rsi14 > 65) {
      vote = upTrend ? 0 : -1;
      detail = `RSI ${Math.round(rsi14)} : proche du surachat.`;
    }
    tr.push({ key: "rsi", label: "Exc\xE8s (RSI 14 j)", detail, vote, weight: 1.5 });
  }
  {
    const lo = last(bb.lower) ?? NaN;
    const up = last(bb.upper) ?? NaN;
    if (Number.isFinite(lo) && Number.isFinite(up)) {
      let vote = 0;
      let detail = "Prix dans ses bandes de Bollinger.";
      if (price < lo) {
        vote = 1;
        detail = "Prix sous la bande de Bollinger basse : exc\xE8s baissier, souvent suivi d\u2019un retour vers la moyenne.";
      } else if (price > up) {
        vote = -1;
        detail = "Prix au-dessus de la bande haute : extension, attention au retour vers la moyenne.";
      }
      tr.push({ key: "bb", label: "Bandes de Bollinger", detail, vote, weight: 1 });
    }
  }
  if (candles.length > 22) {
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const prevHigh = highest(highs, 20, candles.length - 2);
    const prevLow = lowest(lows, 20, candles.length - 2);
    const vr = volumeRatio(candles, 20, opts);
    let vote = 0;
    let detail = "Pas de cassure significative des plus hauts/bas 20 jours.";
    if (price > prevHigh && vr > 1.5) {
      vote = 2;
      detail = `Cassure des plus hauts 20 j avec un volume \xD7${num(vr, 1)} : signal de force.`;
    } else if (price > prevHigh) {
      vote = 1;
      detail = "Cassure des plus hauts 20 j, mais sans volume convaincant.";
    } else if (price < prevLow && vr > 1.5) {
      vote = -2;
      detail = `Cassure des plus bas 20 j avec un volume \xD7${num(vr, 1)} : signal de faiblesse.`;
    } else if (price < prevLow) {
      vote = -1;
      detail = "Le prix enfonce ses plus bas 20 j.";
    }
    tr.push({ key: "breakout", label: "Cassure & volume", detail, vote, weight: 2 });
  }
  const investorV1 = combine(inv, "investor", candles.length);
  const traderV1 = combine(tr, "trader", candles.length);
  let breakoutVolume = null;
  if (candles.length > 22) {
    const vr = volumeRatio(candles, 20, opts);
    if (price > highest(candles.map((c) => c.high), 20, candles.length - 2) && vr >= 1.5) breakoutVolume = vr;
  }
  const excess = Number.isFinite(rsiWeekly) && rsiWeekly > 80 || Number.isFinite(mayer) && mayer > 2;
  const investor = investorV2(investorV1, ctx.temperature ?? null, candles.length, excess, !!ctx.isBitcoin);
  const trader2 = traderV2(traderV1, breakoutVolume);
  const levels = supportResistance(candles, 5, 2.5, 365);
  const supports = levels.filter((l) => l.price < price).map((l) => l.price);
  const resistances = levels.filter((l) => l.price > price).map((l) => l.price);
  const support = supports.length ? supports[supports.length - 1] : null;
  const resistance = resistances.length ? resistances[0] : null;
  let plan = null;
  if (Number.isFinite(atr14) && atr14 > 0) {
    const entry = price;
    let stop = support != null ? support - 0.5 * atr14 : price - 2 * atr14;
    stop = Math.max(stop, price - 3 * atr14);
    if (stop > price - 0.8 * atr14) stop = price - 1.5 * atr14;
    const risk = entry - stop;
    plan = {
      entry,
      stop,
      tp1: entry + 1.5 * risk,
      tp2: entry + 3 * risk,
      exitOnClose: true,
      riskPct: risk / entry * 100,
      atr: atr14,
      support,
      resistance
    };
  }
  const accumulation = Number.isFinite(sma200) ? { low: sma200 * 0.85, high: sma200 * 1.02 } : null;
  const profitZone = Number.isFinite(sma200) ? sma200 * 2 : null;
  return {
    price,
    sma20,
    sma50,
    sma200,
    rsi14,
    rsiWeekly,
    mayer,
    atrPct,
    change7d: changePct(closes, 7),
    change30d: changePct(closes, 30),
    investor,
    trader: trader2,
    plan,
    accumulation,
    profitZone,
    setups: detectSetups(candles, { s20, s50, s200, r, m, bbWidth: bb.width }, opts),
    bars: candles.length
  };
}
function detectSetups(candles, s, opts = {}) {
  const out = [];
  const n2 = candles.length;
  if (n2 < 30) return out;
  const c = candles[n2 - 1];
  const prev = candles[n2 - 2];
  const price = c.close;
  const sma50 = s.s50[n2 - 1];
  const rsi14 = s.r[n2 - 1];
  const highs = candles.map((k) => k.high);
  const vr = volumeRatio(candles, 20, opts);
  const prevHigh = highest(highs, 20, n2 - 2);
  if (price > prevHigh && vr > 1.5) out.push({ key: "breakout", label: "Cassure avec volume", bias: "bull", detail: `Plus haut 20 j cass\xE9, volume \xD7${num(vr, 1)}.` });
  if (rsi14 < 30 && price > prev.close) out.push({ key: "oversold", label: "Survente + rebond", bias: "bull", detail: `RSI ${Math.round(rsi14)} et premi\xE8re bougie verte (prometteur sur 14 jours, pas valid\xE9).` });
  const mc = lastCross(s.m.macd, s.m.signal, 3);
  if (mc?.dir === 1 && Number.isFinite(sma50) && price > sma50) out.push({ key: "macd", label: "Relance MACD", bias: "bull", detail: "MACD repasse au-dessus de son signal, prix au-dessus de la MM50 (prometteur, pas valid\xE9)." });
  return out;
}
var SETUP_KEYS = {
  breakout: "Cassure avec volume",
  oversold: "Survente + rebond",
  macd: "Relance MACD"
};

// src/runner/signals.ts
var TRACKED_LABEL = {
  "inv:All\xE9ger": "passe \xE0 \xAB All\xE9ger \xBB",
  "inv:Prendre des profits": "passe \xE0 \xAB Prendre des profits \xBB"
};
function signalKeysOf(a) {
  const keys = [];
  const inv = `inv:${a.investor}`;
  if (TRACKED_LABEL[inv]) keys.push(inv);
  for (const s of a.setups) if (reliabilityOf(`setup:${s}`)?.verdict === "valid\xE9") keys.push(`setup:${s}`);
  return keys;
}
async function computeSignals(coins, src, top = 20) {
  const all = new Map(coins.map((c) => [c.coinId, c.symbol]));
  const uni = await src.universe().catch(() => []);
  for (const u of uni.slice(0, top)) if (!all.has(u.coinId)) all.set(u.coinId, u.symbol);
  const out = {};
  for (const [coinId, symbol] of all) {
    const candles = await src.daily(coinId).catch(() => []);
    const last2 = candles[candles.length - 1];
    if (!last2) continue;
    const day = new Date(last2.time * 1e3).toISOString().slice(0, 10);
    const a = analyze(candles, { temperature: src.temperatureAt(day) ?? void 0, isBitcoin: coinId === "bitcoin" }, { closedOnly: true });
    if (!a) continue;
    out[coinId] = { symbol, keys: signalKeysOf({ investor: a.investor.label, setups: a.setups.map((s) => s.key) }) };
  }
  return out;
}
function advanceSignals(prev, today, day) {
  const events = [];
  const active = {};
  const starts = { ...prev.starts };
  for (const [coinId, { symbol, keys }] of Object.entries(today)) {
    active[coinId] = keys;
    const before = new Set(prev.active[coinId] ?? []);
    for (const k of keys) {
      if (before.has(k)) continue;
      starts[`${coinId}|${k}`] = day;
      events.push({ key: `sig:${coinId}:${k}:${day}`, coinId, symbol, signal: k, kind: "enter", episodeStart: day });
    }
    for (const k of before) {
      if (keys.includes(k)) continue;
      const start = starts[`${coinId}|${k}`] ?? day;
      delete starts[`${coinId}|${k}`];
      if (k.startsWith("inv:")) events.push({ key: `sig:${coinId}:${k}:${start}:fin`, coinId, symbol, signal: k, kind: "exit", episodeStart: start });
    }
  }
  return { state: { active, starts }, events };
}
function signalMessage(e, phrase) {
  const what = e.signal.startsWith("setup:") ? `setup \xAB ${e.signal === "setup:breakout" ? "Cassure avec volume" : e.signal.slice(6)} \xBB` : TRACKED_LABEL[e.signal] ?? e.signal;
  const head = e.kind === "enter" ? `Signal ${e.symbol.toUpperCase()} : ${what}` : `Signal ${e.symbol.toUpperCase()} : fin de \xAB ${e.signal.slice(4)} \xBB (depuis le ${e.episodeStart.slice(8, 10)}/${e.episodeStart.slice(5, 7)})`;
  return `${head}
Fiabilit\xE9 : ${phrase}`;
}

// src/lib/smartScore.ts
var SMART_MOVES_MAX = 300;
function addMoves(existing, incoming, max = SMART_MOVES_MAX) {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) if (!byId.has(m.id)) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-max);
}
var DAY = 864e5;
var GIVE_UP_DAYS = 2;
function movesFromEvents(events, priceByMint) {
  const out = [];
  for (const e of events) {
    const px = priceByMint.get(e.mint.toLowerCase());
    if (px == null || !(px > 0)) continue;
    out.push({ id: eventKey(e), walletId: e.walletId, chain: e.chain, mint: e.mint, symbol: e.symbol, side: e.side, priceUsd: px, at: new Date(e.atMs).toISOString() });
  }
  return out;
}
function judgeMoves(moves, nowMs, priceOf) {
  let changed = 0;
  const next = moves.map((m) => {
    const age = (nowMs - Date.parse(m.at)) / DAY;
    let out = m;
    for (const [h, field] of [[7, "p7"], [30, "p30"]]) {
      if (out[field] != null || age < h) continue;
      if (age >= h + GIVE_UP_DAYS) {
        out = { ...out, [field]: 0 };
        continue;
      }
      const px = priceOf(m);
      if (px != null && px > 0) out = { ...out, [field]: px };
    }
    if (out !== m) changed++;
    return out;
  });
  return { moves: next, changed };
}
function movesDue(moves, nowMs) {
  return moves.filter((m) => {
    const age = (nowMs - Date.parse(m.at)) / DAY;
    return m.p7 == null && age >= 7 || m.p30 == null && age >= 30;
  });
}

// src/lib/lab/fills.ts
var q8 = (x) => Math.round(x * 1e8) / 1e8;
function applyIntent(book, intent, marketUsd, costs, opts) {
  const none = (skip) => ({ book, fill: null, skip });
  if (!(marketUsd > 0) || !Number.isFinite(marketUsd)) return none("prix inconnu");
  if (intent.skipAbove != null && marketUsd > intent.skipAbove) return none("le prix a trop boug\xE9 depuis la cl\xF4ture");
  if (intent.skipBelow != null && marketUsd < intent.skipBelow) return none("le prix a trop boug\xE9 depuis la cl\xF4ture");
  const s = costs.spreadPct / 100;
  const f = costs.feePct / 100;
  const base = { coinId: intent.coinId, symbol: intent.symbol, name: intent.name, marketUsd, at: opts.at, reason: intent.reason, ...intent.tag ? { tag: intent.tag } : {} };
  if (intent.side === "buy") {
    const price = marketUsd * (1 + s);
    let amount;
    const sz = intent.sizing ?? { usd: 0 };
    if ("usd" in sz) amount = sz.usd;
    else {
      if (intent.stop == null || price <= intent.stop) return none("stop au-dessus du prix d\u2019achat");
      amount = Math.min(sz.riskUsd / (price - intent.stop) * price / (1 - f), sz.maxUsd);
    }
    amount = Math.min(amount, book.cashUsd);
    if (!(amount >= opts.minOrderUsd)) return none("montant trop petit");
    const fee = amount * f;
    const quantity = q8((amount - fee) / price);
    if (!(quantity > 0)) return none("montant trop petit");
    const prev = book.positions[intent.coinId];
    const target = intent.stop != null && intent.targetR != null ? price + intent.targetR * (price - intent.stop) : void 0;
    const pos2 = {
      coinId: intent.coinId,
      symbol: intent.symbol,
      name: intent.name,
      quantity: q8((prev?.quantity ?? 0) + quantity),
      costUsd: (prev?.costUsd ?? 0) + amount,
      openedOn: prev?.openedOn ?? opts.day,
      ...intent.stop != null ? { stop: intent.stop } : prev?.stop != null ? { stop: prev.stop } : {},
      ...target != null ? { target } : prev?.target != null ? { target: prev.target } : {},
      ...intent.stopOnClose ? { stopOnClose: true } : prev?.stopOnClose ? { stopOnClose: true } : {}
    };
    const fill = { ...base, side: "buy", kind: "market", quantity, priceUsd: price, feeUsd: fee, ...intent.stop != null ? { stop: intent.stop } : {}, ...target != null ? { target } : {}, ...intent.stopOnClose ? { stopOnClose: true } : {} };
    return { book: { cashUsd: book.cashUsd - amount, positions: { ...book.positions, [intent.coinId]: pos2 } }, fill, skip: null };
  }
  const pos = book.positions[intent.coinId];
  if (!pos || !(pos.quantity > 0)) return none("aucune position \xE0 vendre");
  const fraction = Math.min(1, Math.max(0, intent.fraction ?? 1));
  if (!(fraction > 0)) return none("aucune quantit\xE9 \xE0 vendre");
  return sellOut(book, pos, fraction, marketUsd, costs, { ...base, kind: "market" });
}
function sellOut(book, pos, fraction, marketUsd, costs, base) {
  const quantity = fraction >= 1 ? pos.quantity : q8(pos.quantity * fraction);
  const price = marketUsd * (1 - costs.spreadPct / 100);
  const proceeds = quantity * price;
  const fee = proceeds * (costs.feePct / 100);
  const positions = { ...book.positions };
  const left = q8(pos.quantity - quantity);
  if (left > 0) positions[pos.coinId] = { ...pos, quantity: left, costUsd: pos.costUsd * (left / pos.quantity) };
  else delete positions[pos.coinId];
  const fill = { ...base, side: "sell", quantity, priceUsd: price, feeUsd: fee };
  return { book: { cashUsd: book.cashUsd + proceeds - fee, positions }, fill, skip: null };
}
function pendingHit(kind, level, bar, opts = {}) {
  const gap = opts.gapRule !== false;
  if (kind === "stop") return gap && bar.open <= level ? bar.open : bar.low <= level ? level : null;
  if (kind === "target") return gap && bar.open >= level ? bar.open : bar.high >= level ? level : null;
  return gap && bar.open <= level ? bar.open : bar.low <= level ? level : null;
}
function settleBar(book, coinId, bar, costs, at, opts = {}) {
  const pos = book.positions[coinId];
  if (!pos) return { book, fill: null };
  const base = { coinId, symbol: pos.symbol, name: pos.name, at };
  const stopAt = pos.stop != null && !pos.stopOnClose ? pendingHit("stop", pos.stop, bar, opts) : null;
  if (stopAt != null) {
    const r = sellOut(book, pos, 1, stopAt, costs, { ...base, marketUsd: stopAt, kind: "stop", reason: "stop touch\xE9", tag: "stop" });
    return { book: r.book, fill: r.fill };
  }
  const targetAt = pos.target != null ? pendingHit("target", pos.target, bar, opts) : null;
  if (targetAt != null) {
    const r = sellOut(book, pos, 1, targetAt, costs, { ...base, marketUsd: targetAt, kind: "target", reason: "objectif atteint", tag: "target" });
    return { book: r.book, fill: r.fill };
  }
  return { book, fill: null };
}
function delist(book, coinId, lastClose, costs, at) {
  const pos = book.positions[coinId];
  if (!pos) return { book, fill: null };
  const r = sellOut(book, pos, 1, lastClose, costs, { coinId, symbol: pos.symbol, name: pos.name, at, marketUsd: lastClose, kind: "delist", reason: "paire retir\xE9e de la cotation : sold\xE9e \xE0 la derni\xE8re cl\xF4ture", tag: "delist" });
  return { book: r.book, fill: r.fill };
}

// src/lib/lab/types.ts
var COSTS = {
  exchange: { feePct: 0.1, spreadPct: 0.05 },
  app: { feePct: 0, spreadPct: 1.5 }
};

// src/lib/lab/paperBook.ts
var COST_PRESETS = { exchange: { ...COSTS.exchange }, app: { ...COSTS.app } };
var ORDER_LIFETIME_DAYS = 90;
var timeOf = (t) => t.time ?? t.date;
function bookOf(portfolio, trades) {
  let cash = portfolio.startingUsd;
  const positions = {};
  for (const t of [...trades].sort((a, b) => timeOf(a).localeCompare(timeOf(b)))) {
    const fee = t.feeUsd ?? 0;
    const p = positions[t.coinId];
    if (t.type === "buy") {
      cash -= t.quantity * t.priceUsd + fee;
      positions[t.coinId] = { coinId: t.coinId, symbol: t.symbol, name: t.name, quantity: (p?.quantity ?? 0) + t.quantity, costUsd: (p?.costUsd ?? 0) + t.quantity * t.priceUsd + fee, openedOn: p?.openedOn ?? t.date };
    } else {
      cash += t.quantity * t.priceUsd - fee;
      if (!p) continue;
      const left = Math.round((p.quantity - t.quantity) * 1e8) / 1e8;
      if (left > 0) positions[t.coinId] = { ...p, quantity: left, costUsd: p.costUsd * (left / p.quantity) };
      else delete positions[t.coinId];
    }
  }
  return { cashUsd: cash, positions };
}

// src/lib/lab/tradeCheck.ts
function tradeHits(trades, barsOf) {
  const out = [];
  for (const t of trades) {
    if (t.status !== "open" || t.stopLoss == null && t.takeProfit == null) continue;
    const long = t.side === "long";
    for (const b of barsOf(t)) {
      const stop = t.stopLoss != null && (long ? b.low <= t.stopLoss : b.high >= t.stopLoss);
      const target = t.takeProfit != null && (long ? b.high >= t.takeProfit : b.low <= t.takeProfit);
      if (stop) {
        out.push({ trade: t, kind: "stop", level: t.stopLoss, key: `trade:${t.id}:stop` });
        break;
      }
      if (target) {
        out.push({ trade: t, kind: "target", level: t.takeProfit, key: `trade:${t.id}:target` });
        break;
      }
    }
  }
  return out;
}

// src/runner/cycle.ts
var DAY_MS2 = 24 * 36e5;
var ZONE_REPEAT_MS = 7 * DAY_MS2;
function coinsOf(bundle, watch) {
  const ids = /* @__PURE__ */ new Set(["bitcoin"]);
  for (const coinId of buildPositions(watch.transactions).keys()) if (coinId) ids.add(coinId);
  for (const t of watch.paperTrades) ids.add(t.coinId);
  for (const a of watch.alerts) if (a.active && !a.triggeredAt) ids.add(a.coinId);
  const ref = (v) => {
    if (v && typeof v === "object") {
      const c = v;
      if (c.coinId) ids.add(c.coinId);
    }
  };
  const arr = (k) => Array.isArray(bundle.data[k]) ? bundle.data[k] : [];
  for (const p of arr("dcaPlans")) ref(p);
  const basket = bundle.data.basket;
  if (basket && typeof basket === "object") {
    const b = basket;
    for (const c of [...b.core ?? [], ...b.discovery ?? []]) ref(c);
  }
  return [...ids];
}
function newsCoinsOf(watch) {
  const seen = /* @__PURE__ */ new Map();
  const add = (coinId, symbol, name) => {
    if (!coinId || seen.has(coinId)) return;
    if (coinId === "bitcoin" || coinId === "ethereum" || isStable(symbol, coinId)) return;
    seen.set(coinId, { coinId, name });
  };
  for (const p of buildPositions(watch.transactions).values()) add(p.coinId, p.symbol, p.name);
  for (const a of watch.alerts) if (a.active && !a.triggeredAt) add(a.coinId, a.symbol, a.name);
  return [...seen.values()].slice(0, 12);
}
function asBundle(v) {
  if (!v || typeof v !== "object" || !v.data || !Array.isArray(v.deletions)) {
    throw new Error("Le fichier de synchronisation ne contient pas des donn\xE9es Boussole.");
  }
  return v;
}
async function runCycle(cfg, st, opts, deps, now = /* @__PURE__ */ new Date()) {
  const nowMs = now.getTime();
  const dayKey = isoDay(now);
  let state = pruneSent(st, nowMs);
  const result = { sent: 0, consumed: 0, error: null, watching: 0 };
  const send = async (text) => {
    if (opts.dry) {
      opts.onDry?.(text);
      return;
    }
    await deps.telegram(text);
  };
  const remote = await deps.fetchRemote();
  if (!remote) {
    const err = `Le fichier ${cfg.syncPath} n\u2019existe pas encore dans ${cfg.syncRepo} : active la synchronisation dans l\u2019application (R\xE9glages) et laisse-la \xE9crire une premi\xE8re fois.`;
    return { state: recordStatus(state, false, err, nowMs), result: { ...result, error: err } };
  }
  const bundle = asBundle(await unseal(remote.content, cfg.passphrase));
  const watch = watchOf(bundle);
  let working = bundle;
  let autopilotChanged = 0;
  let autopilotLines = [];
  let autopilotEvents = [];
  if (cfg.autopilotEnabled && deps.autopilot) {
    const r = await deps.autopilot(bundle, nowMs).catch(() => null);
    if (r) {
      working = r.bundle;
      autopilotChanged = r.changed;
      autopilotLines = r.briefLines;
      autopilotEvents = r.events;
    }
  }
  const onVacation = !!watch.vacationUntil && watch.vacationUntil >= dayKey;
  const priceRows = await deps.prices(coinsOf(bundle, watch));
  const priceMap = /* @__PURE__ */ new Map();
  for (const [id, p] of Object.entries(priceRows)) if (typeof p.usd === "number" && p.usd > 0) priceMap.set(id, p.usd);
  result.watching = watch.alerts.filter((a) => a.active && !a.triggeredAt).length;
  const eurPerUsd = priceRows.bitcoin?.usd && priceRows.bitcoin.eur ? priceRows.bitcoin.eur / priceRows.bitcoin.usd : 0.92;
  const cur = { currency: cfg.currency, eurPerUsd };
  const queue = [];
  for (const { alert, price } of hitAlerts(watch, priceMap)) {
    const key = alertKey(alert.id);
    if (shouldSend(state, key)) queue.push({ key, text: alertMessage(alert, price, cur), alertId: alert.id });
  }
  for (const t of hitRungs(watch, priceMap)) {
    const key = rungKey(t.coinId, t.multiple);
    if (shouldSend(state, key)) queue.push({ key, text: rungMessage(t, cur) });
  }
  const fng = await deps.fearGreed().catch(() => null);
  const temperature = await marketTemperature(deps, fng);
  if (temperature) {
    if (!state.zoneLabel) {
      if (!opts.dry) state = { ...state, zoneLabel: temperature.zone.label };
    } else if (!onVacation && state.zoneLabel !== temperature.zone.label) {
      const key = `zone:${temperature.zone.label}`;
      const last2 = state.sent[key];
      if (last2 == null || nowMs - last2 >= ZONE_REPEAT_MS) queue.push({ key, text: zoneMessage(temperature.zone, temperature.temperature, state.zoneLabel) });
    }
  }
  for (const ev of onVacation ? [] : nextMacroEvents(now, 3, 2)) {
    const key = `macro:${ev.id}`;
    if (state.sent[key] == null) {
      queue.push({ key, text: `${ev.daysTo === 0 ? "Aujourd\u2019hui" : "Demain"} : ${ev.label}
${ev.advice}` });
    }
  }
  const ratedNews = [];
  const newsAlerts = [];
  const seenNews = [];
  if (cfg.newsEnabled && !onVacation) {
    const coins = newsCoinsOf(watch);
    const fresh = coins.length ? await deps.news(coins).catch(() => []) : [];
    const candidates = fresh.filter((n2) => nowMs - n2.publishedAt < 15 * 36e5).filter((n2) => state.sent[newsKey(n2)] == null).slice(0, 8);
    const ratings = candidates.length ? await deps.aiRates(candidates).catch(() => candidates.map(() => ({ importance: 0, resume: "" }))) : [];
    const hasAi = !!cfg.mistralApiKey;
    for (const [i, n2] of candidates.entries()) {
      const r = ratings[i] ?? { importance: 0, resume: "" };
      const key = newsKey(n2);
      const important = r.importance >= 6 || !hasAi && isHotNews(n2);
      if (important && newsAlerts.length < 3) {
        newsAlerts.push({ key, text: newsMessage({ ...n2, ...r }) });
      } else {
        if (hasAi ? r.importance > 0 && r.importance < 6 : !isHotNews(n2)) seenNews.push(key);
      }
    }
    const ratedOf = new Map(candidates.map((n2, i) => [n2.url, ratings[i] ?? { importance: 0, resume: "" }]));
    for (const n2 of fresh) {
      const r = ratedOf.get(n2.url) ?? { importance: 0, resume: "" };
      ratedNews.push({ ...n2, ...r });
    }
    ratedNews.sort((a, b) => b.publishedAt - a.publishedAt);
    if (seenNews.length && !opts.dry) state = markSent(state, seenNews, nowMs);
  }
  queue.push(...newsAlerts);
  const smartRecent = [];
  const smartAlerts = [];
  const alertedKeys = /* @__PURE__ */ new Map();
  const smartCursorNext = {};
  if (cfg.smartMoneyEnabled && !onVacation && watch.smartWallets.length && deps.smartEvents) {
    const sinceOf = (id) => state.smCursor[id] ?? nowMs - 2 * 36e5;
    const sinceMs = Math.min(...watch.smartWallets.slice(0, 12).map((w) => sinceOf(w.id)));
    const evts = await deps.smartEvents(watch.smartWallets.slice(0, 12), sinceMs, nowMs).catch(() => []);
    smartRecent.push(...evts);
    const refs = refsOf({
      watched: watch.watchedTokens,
      positions: [...buildPositions(watch.transactions).values()],
      alerts: watch.alerts
    });
    const relevant = new Set(relevantEvents(evts, refs));
    for (const e of evts) {
      const key = eventKey(e);
      const isAlert = relevant.has(e) && shouldSend(state, key);
      if (isAlert && smartAlerts.length < 3) {
        smartAlerts.push({ key, text: smartMessage(e, nowMs) });
        alertedKeys.set(key, { walletId: e.walletId, atMs: e.atMs });
      } else {
        smartCursorNext[e.walletId] = Math.max(smartCursorNext[e.walletId] ?? 0, e.atMs);
      }
    }
  }
  queue.push(...smartAlerts);
  if (deps.tradeBars) {
    const open = (Array.isArray(bundle.data.trades) ? bundle.data.trades : []).filter((t) => t.status === "open" && (t.stopLoss != null || t.takeProfit != null));
    if (open.length) {
      const bars = /* @__PURE__ */ new Map();
      for (const t of open.slice(0, 20)) {
        const b = await deps.tradeBars(t.coinId, t.symbol, nowMs - 3 * 36e5, nowMs).catch(() => []);
        bars.set(t.id, b);
      }
      for (const h of tradeHits(open, (t) => bars.get(t.id) ?? [])) {
        if (!shouldSend(state, h.key)) continue;
        const what = h.kind === "stop" ? "stop touch\xE9" : "objectif atteint";
        queue.push({ key: h.key, text: `Trade ${h.trade.symbol.toUpperCase()} : ${what} (${priceLabel(h.level, cur)}).
Ouvre Boussole pour cl\xF4turer le trade dans ton journal.` });
      }
    }
  }
  let smartMovesChanged = false;
  if (cfg.smartMoneyEnabled && deps.tokenPrices) {
    const before = Array.isArray(working.data.smartMoves) ? working.data.smartMoves : [];
    const due = movesDue(before, nowMs);
    const wanted = /* @__PURE__ */ new Map();
    const want = (chain, mint) => {
      if (!chain || !mint) return;
      if (!wanted.has(chain)) wanted.set(chain, /* @__PURE__ */ new Set());
      wanted.get(chain).add(mint);
    };
    for (const e of smartRecent) want(e.chain, e.mint);
    for (const m of due) want(m.chain, m.mint);
    if (wanted.size) {
      const prices = /* @__PURE__ */ new Map();
      for (const [chain, mints] of wanted) {
        const got = await deps.tokenPrices(chain, [...mints]).catch(() => /* @__PURE__ */ new Map());
        for (const [k, v] of got) prices.set(k.toLowerCase(), v);
      }
      const stamp = new Date(nowMs).toISOString();
      const added = addMoves(before, movesFromEvents(smartRecent, prices).map((m) => ({ ...m, updatedAt: stamp })));
      const judged = judgeMoves(added, nowMs, (m) => m.mint ? prices.get(m.mint.toLowerCase()) ?? null : null);
      const next = judged.moves.map((m, i) => m !== added[i] ? { ...m, updatedAt: stamp } : m);
      if (next.length !== before.length || next.some((m, i) => m !== before[i])) {
        working = { ...working, data: { ...working.data, smartMoves: next } };
        smartMovesChanged = true;
      }
    }
  }
  const utcDay = now.toISOString().slice(0, 10);
  if (cfg.signalAlertsEnabled && deps.signals && state.signals?.day !== utcDay && now.getUTCHours() * 60 + now.getUTCMinutes() >= 10) {
    const watchIds = Array.isArray(bundle.data.watchlist) ? bundle.data.watchlist : [];
    const coins = /* @__PURE__ */ new Map();
    for (const p of buildPositions(watch.transactions).values()) if (p.coinId && p.quantity > 0) coins.set(p.coinId, p.symbol);
    for (const id of watchIds) if (!coins.has(id)) coins.set(id, id);
    const today = await deps.signals([...coins].map(([coinId, symbol]) => ({ coinId, symbol }))).catch(() => null);
    if (today) {
      const r = advanceSignals({ active: state.signals?.active ?? {}, starts: state.signals?.starts ?? {} }, today, utcDay);
      if (state.signals && !onVacation) {
        let n2 = 0;
        for (const e of r.events) {
          if (n2 >= 3 || !shouldSend(state, e.key)) continue;
          queue.push({ key: e.key, text: signalMessage(e, reliabilityPhrase(reliabilityOf(e.signal))) });
          n2++;
        }
      }
      if (!opts.dry) state = { ...state, signals: { day: utcDay, ...r.state } };
    }
  }
  if (cfg.autopilotTelegram && !onVacation) {
    for (const e of autopilotEvents) if (shouldSend(state, e.key)) queue.push(e);
  }
  const consumedIds = [];
  const quiet = inQuietWindow(cfg.quietStart, cfg.quietEnd, now);
  if (quiet && queue.length && !opts.dry) {
    state = holdQuiet(state, queue, nowMs);
    queue.length = 0;
  }
  if (!quiet && Object.keys(state.quietQueue).length && !opts.dry) {
    const held = Object.entries(state.quietQueue);
    const digest = quietMessage(held.map(([, v]) => v), cfg.timeZone);
    try {
      await send(digest);
      const heldKeys = new Set(held.map(([k]) => k));
      const heldIds = held.flatMap(([, v]) => v.alertId ? [v.alertId] : []);
      state = markSent(state, [...heldKeys], nowMs);
      state = dropQuiet(state, [...heldKeys]);
      const lastZone = [...held].reverse().find(([k]) => k.startsWith("zone:"));
      if (lastZone && temperature && state.zoneLabel !== temperature.zone.label && lastZone[1].text.includes(temperature.zone.label)) {
        state = { ...state, zoneLabel: temperature.zone.label };
      }
      result.sent++;
      consumedIds.push(...heldIds);
      for (let i = queue.length - 1; i >= 0; i--) if (heldKeys.has(queue[i].key)) queue.splice(i, 1);
    } catch (e) {
      result.error = e instanceof Error ? e.message : String(e);
    }
  }
  for (const m of queue) {
    if (opts.dry) {
      opts.onDry?.(m.text);
      continue;
    }
    try {
      await deps.telegram(m.text);
      state = markSent(state, [m.key], nowMs);
      result.sent++;
      if (m.alertId) consumedIds.push(m.alertId);
      if (alertedKeys.has(m.key)) {
        const a = alertedKeys.get(m.key);
        state = { ...state, smCursor: { ...state.smCursor, [a.walletId]: Math.max(state.smCursor[a.walletId] ?? 0, a.atMs) } };
      }
      if (m.key.startsWith("zone:") && temperature && temperature.zone.label !== state.zoneLabel) {
        state = { ...state, zoneLabel: temperature.zone.label };
      }
    } catch (e) {
      result.error = e instanceof Error ? e.message : String(e);
      break;
    }
  }
  if (Object.keys(smartCursorNext).length && !opts.dry) {
    const smCursor = { ...state.smCursor };
    let moved = false;
    for (const [id, at] of Object.entries(smartCursorNext)) {
      if (at > (smCursor[id] ?? 0)) {
        smCursor[id] = at;
        moved = true;
      }
    }
    if (moved) state = { ...state, smCursor };
  }
  if ((consumedIds.length || autopilotChanged || smartMovesChanged) && !opts.dry) {
    try {
      const next = consumedIds.length ? consumeAlerts(working, consumedIds, now.toISOString()) : working;
      const sealed = await seal({ ...next, device: cfg.device, savedAt: now.toISOString() }, cfg.passphrase);
      await deps.pushRemote(sealed, remote.sha);
      result.consumed = consumedIds.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.error = result.error ?? (msg === CONFLICT ? "l\u2019autre appareil vient d\u2019\xE9crire la synchronisation : l\u2019\xE9criture passera au prochain cycle" : msg);
    }
  }
  for (const slot of slotsOfDay(cfg, now)) {
    if (slot.id === "matin" && !cfg.briefEnabled) continue;
    if (!(opts.forceBrief && slot.id === "matin") && slot.atMs != null && nowMs < slot.atMs) continue;
    if (!(opts.forceBrief && slot.id === "matin") && state.lastBriefSlot[slot.id] === dayKey) continue;
    let emergingLines;
    if (slot.id === "matin" && cfg.emergingEnabled && deps.emerging) {
      emergingLines = await deps.emerging(watch.smartWallets).catch(() => []);
    }
    const brief = buildBrief({
      now,
      bundle,
      prices: priceRows,
      fng,
      currency: cfg.currency,
      syncSavedAt: bundle.savedAt ?? null,
      syncDevice: bundle.device ?? null,
      temperature: temperature ? { value: temperature.temperature, zoneLabel: temperature.zone.label } : null,
      cycleMetrics: temperature ? { mvrv: temperature.mvrv, stableShare: temperature.stableShare, halvingDaysToNext: temperature.halvingDaysToNext } : null,
      slot: slot.id,
      news: ratedNews.slice(0, 6),
      smart: smartBriefLines(smartRecent, nowMs),
      emerging: emergingLines,
      vacationUntil: onVacation ? watch.vacationUntil : null,
      autopilots: autopilotLines
    });
    try {
      await send(brief);
      if (!opts.dry) state = { ...state, lastBriefSlot: { ...state.lastBriefSlot, [slot.id]: dayKey } };
    } catch (e) {
      result.error = result.error ?? (e instanceof Error ? e.message : String(e));
    }
  }
  state = recordStatus(state, result.error == null, result.error, nowMs);
  return { state, result };
}
function newsMessage(n2, now = /* @__PURE__ */ new Date()) {
  const age = Math.max(0, now.getTime() - n2.publishedAt);
  const ago = age < 36e5 ? `il y a ${Math.max(1, Math.round(age / 6e4))} min` : age < 24 * 36e5 ? `il y a ${Math.round(age / 36e5)} h` : `il y a ${Math.round(age / 864e5)} jours`;
  const lines = [`Presse \u2014 ${n2.coinName}`, `\xAB ${n2.title} \xBB${n2.source ? ` (${n2.source}, ${ago})` : ` (${ago})`}`];
  if (n2.resume) lines.push(n2.resume.replace(/\s+/g, " ").trim().slice(0, 600));
  return lines.join("\n");
}
async function marketTemperature(deps, fng) {
  const btcDaily = await deps.btcDaily().catch(() => null);
  if (!btcDaily) return null;
  const funding = await deps.funding().catch(() => null);
  const [mvrv, stableShare] = await Promise.all([
    deps.mvrv().catch(() => null),
    deps.stableShare().catch(() => null)
  ]);
  const r = computeCycle({ btcDaily, fng: fng?.value, fundingRate: funding ?? void 0, mvrv: mvrv ?? void 0, stableShare: stableShare ?? void 0 });
  return r ? { temperature: r.temperature, zone: { key: r.zone.key, label: r.zone.label, action: r.zone.action }, mvrv, stableShare, halvingDaysToNext: r.halving.daysToNext } : null;
}

// src/runner/market.ts
var TIMEOUT_MS2 = 2e4;
async function getJson(url, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS2);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: ctrl.signal });
    if (!res.ok) {
      if (res.status === 429) throw new Error("CoinGecko : limite de requ\xEAtes atteinte (ajoute une cl\xE9 \xAB Demo \xBB gratuite dans la configuration).");
      throw new Error(`CoinGecko a r\xE9pondu ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
async function fetchBtcDaily() {
  try {
    const res = await fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=500", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS2) });
    if (!res.ok) return null;
    const raw = await res.json();
    return raw.map((k) => ({ time: Math.round(k[0] / 1e3), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]) })).filter((c) => Number.isFinite(c.close));
  } catch {
    return null;
  }
}
async function fetchBtcFunding() {
  try {
    const res = await fetch("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(1e4) });
    if (!res.ok) return null;
    const r = await res.json();
    const v = Number(r.lastFundingRate);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
async function fetchPrices(ids, coingeckoKey) {
  const uniq = [...new Set(ids)].filter(Boolean).slice(0, 90);
  if (!uniq.length) return {};
  const headers = {};
  if (coingeckoKey) headers["x-cg-demo-api-key"] = coingeckoKey;
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(uniq.join(","))}&vs_currencies=usd,eur&include_24h_change=true`;
  const raw = await getJson(url, headers);
  const out = {};
  for (const [id, p] of Object.entries(raw)) {
    if (!p || typeof p !== "object") continue;
    const change = typeof p.usd_24h_change === "number" ? p.usd_24h_change : p.eur_24h_change;
    out[id] = { usd: typeof p.usd === "number" ? p.usd : void 0, eur: typeof p.eur === "number" ? p.eur : void 0, change: typeof change === "number" ? change : void 0 };
  }
  return out;
}
async function fetchFearGreed() {
  try {
    const raw = await getJson("https://api.alternative.me/fng/?limit=1&format=json", {});
    const d = raw.data?.[0];
    if (!d || d.value == null) return null;
    const value = Number(d.value);
    if (!Number.isFinite(value)) return null;
    const LABELS = { "Extreme Fear": "Peur extr\xEAme", Fear: "Peur", Neutral: "Neutre", Greed: "Avidit\xE9", "Extreme Greed": "Avidit\xE9 extr\xEAme" };
    return { value, label: LABELS[d.value_classification ?? ""] ?? d.value_classification ?? "" };
  } catch {
    return null;
  }
}
async function fetchMvrv() {
  try {
    const res = await fetch("https://bitcoin-data.com/v1/mvrv/zscore", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15e3) });
    if (!res.ok) return null;
    const r = await res.json();
    const v = Number(r.mvrv);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
async function fetchStablecoinShare(coingeckoKey) {
  try {
    const headers = {};
    if (coingeckoKey) headers["x-cg-demo-api-key"] = coingeckoKey;
    const [stableRes, globalRes] = await Promise.all([
      fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=stablecoins&order=market_cap_desc&per_page=100&page=1`, { headers: { ...headers, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS2) }),
      fetch(`https://api.coingecko.com/api/v3/global`, { headers: { ...headers, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS2) })
    ]);
    if (!stableRes.ok || !globalRes.ok) return null;
    const stables = await stableRes.json();
    const global2 = await globalRes.json();
    const cap = stables.reduce((sum, c) => sum + (Number(c.market_cap) || 0), 0);
    const total = global2.data?.total_market_cap?.usd ?? 0;
    if (!(cap > 0) || !(total > 0) || cap > total) return null;
    return cap / total * 100;
  } catch {
    return null;
  }
}

// src/runner/telegram.ts
async function post(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) {
    const why = j.description ? ` : ${j.description}` : "";
    if (/chat not found/i.test(why)) throw new Error("Telegram : conversation introuvable \u2014 envoie un message \xE0 ton bot, puis relance avec --discover.");
    throw new Error(`Telegram a refus\xE9 ${method}${why || ` (r\xE9ponse ${res.status})`}.`);
  }
  return j.result;
}
async function sendMessage(token, chatId, text) {
  if (text.length > 4096) text = `${text.slice(0, 4090)}
\u2026`;
  await post(token, "sendMessage", { chat_id: chatId, text });
}
async function recentChats(token) {
  const r = await post(token, "getUpdates", { timeout: 0, limit: 20 });
  const seen = /* @__PURE__ */ new Map();
  for (const u of r ?? []) {
    const c = u.message?.chat;
    if (!c || c.type !== "private") continue;
    const key = String(c.id);
    seen.set(key, { chatId: key, title: c.first_name ?? c.title ?? "", date: u.message?.date ?? 0 });
  }
  return [...seen.values()].sort((a, b) => b.date - a.date);
}

// src/api/http.ts
var HttpError = class extends Error {
  status;
  host;
  constructor(status, host, message) {
    super(message);
    this.status = status;
    this.host = host;
  }
};
var MIN_INTERVAL_MS = {
  "api.coingecko.com": 4500,
  "api.geckoterminal.com": 2100,
  "api.dexscreener.com": 250,
  "api.gopluslabs.io": 1200,
  "api.rugcheck.xyz": 700,
  "lite-api.jup.ag": 300,
  "mempool.space": 300,
  "yields.llama.fi": 150,
  "api.crypto.com": 300
};
var coingeckoHasKey = false;
var lastCall = /* @__PURE__ */ new Map();
var chains = /* @__PURE__ */ new Map();
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function intervalFor(host) {
  if (host === "api.coingecko.com" && coingeckoHasKey) return 2100;
  return MIN_INTERVAL_MS[host] ?? 0;
}
async function throttle(host) {
  const interval = intervalFor(host);
  if (!interval) return;
  const prev = chains.get(host) ?? Promise.resolve();
  const mine = prev.then(async () => {
    const wait = (lastCall.get(host) ?? 0) + interval - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall.set(host, Date.now());
  });
  chains.set(host, mine.catch(() => void 0));
  await mine;
}
function friendly(status, host) {
  if (status === 429) {
    if (host.includes("coingecko")) return "CoinGecko limite le nombre de requ\xEAtes. Patiente une minute ou ajoute une cl\xE9 \xAB Demo \xBB gratuite dans R\xE9glages.";
    return `Trop de requ\xEAtes vers ${host}. R\xE9essaie dans un instant.`;
  }
  if (status === 401 || status === 403) return `Acc\xE8s refus\xE9 par ${host}.`;
  if (status === 404) return `Donn\xE9e introuvable sur ${host}.`;
  if (status >= 500) return `${host} est momentan\xE9ment indisponible.`;
  return `Erreur ${status} sur ${host}.`;
}
function retryPlan(status, retryAfter, attempt, maxRetries) {
  if (attempt >= maxRetries) return { retry: false, waitMs: 0 };
  if (status === 429) {
    if (attempt >= 1) return { retry: false, waitMs: 0 };
    const ra = Number(retryAfter);
    return { retry: true, waitMs: Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1e3, 8e3) : 5e3 };
  }
  if (status === null) return { retry: true, waitMs: 800 * 2 ** attempt };
  if (status >= 500) return { retry: true, waitMs: 1200 * 2 ** attempt };
  return { retry: false, waitMs: 0 };
}
async function request(url, opts = {}) {
  const host = new URL(url).host;
  const retries = opts.retries ?? 2;
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle(host);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25e3);
    const onAbort = () => ctrl.abort();
    opts.signal?.addEventListener("abort", onAbort);
    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: { Accept: "application/json", ...opts.headers ?? {} },
        body: opts.body,
        signal: ctrl.signal
      });
      if (res.status === 429 || res.status >= 500) {
        const plan = retryPlan(res.status, res.headers.get("retry-after"), attempt, retries);
        if (plan.retry) {
          await sleep(plan.waitMs);
          continue;
        }
      }
      if (!res.ok) throw new HttpError(res.status, host, friendly(res.status, host));
      return res;
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError) throw e;
      if (opts.signal?.aborted) throw e;
      const plan = retryPlan(null, null, attempt, retries);
      if (plan.retry) {
        await sleep(plan.waitMs);
        continue;
      }
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }
  if (lastErr instanceof Error && lastErr.name === "AbortError") throw new Error(`D\xE9lai d\xE9pass\xE9 en contactant ${host}.`);
  throw lastErr instanceof Error ? lastErr : new Error(`Impossible de joindre ${host}.`);
}
async function getJson2(url, opts = {}) {
  const res = await request(url, opts);
  return await res.json();
}
async function postJson(url, body, opts = {}) {
  const res = await request(url, {
    ...opts,
    method: "POST",
    headers: { "Content-Type": "application/json", ...opts.headers ?? {} },
    body: JSON.stringify(body)
  });
  return await res.json();
}

// src/api/smartmoney.ts
var SOL_RPCS = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"];
var BS_HEADERS = { "User-Agent": "BoussoleCrypto/1.0 (+https://github.com/Nikola17/boussole-crypto)" };
var BLOCKSCOUT = { eth: "https://eth.blockscout.com", base: "https://base.blockscout.com" };
async function solRpc(method, params) {
  let lastErr;
  for (const rpc of SOL_RPCS) {
    try {
      const r = await postJson(rpc, { jsonrpc: "2.0", id: 1, method, params }, { timeoutMs: 2e4, retries: 1 });
      if (r.error) throw new Error(r.error.message);
      return r.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("RPC Solana indisponible");
}
var MAX_TX = 6;
async function solanaMintInfos(mints) {
  const out = /* @__PURE__ */ new Map();
  if (!mints.length) return out;
  try {
    const r = await solRpc("getMultipleAccounts", [mints.slice(0, 100), { encoding: "jsonParsed" }]);
    for (const [i, acc] of (r?.value ?? []).entries()) {
      const info = acc?.data?.parsed?.info;
      if (info?.symbol) out.set(mints[i], { symbol: info.symbol, name: info.name ?? null });
    }
  } catch {
  }
  return out;
}
async function solanaEvents(wallet, sinceMs, nowMs) {
  const sigs = await solRpc("getSignaturesForAddress", [wallet.address, { limit: 20 }]);
  const fresh = sigs.filter((s) => !s.err && s.blockTime != null && s.blockTime * 1e3 > sinceMs && s.blockTime * 1e3 <= nowMs).slice(0, MAX_TX);
  if (!fresh.length) return [];
  const deltas = [];
  for (const s of fresh) {
    const tx = await solRpc("getTransaction", [s.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]).catch(() => null);
    if (!tx) continue;
    tx.signature = s.signature;
    tx.blockTime = s.blockTime ?? null;
    deltas.push(...solanaDeltas(tx, wallet.address));
  }
  if (!deltas.length) return [];
  const infos = await solanaMintInfos([...new Set(deltas.map((d) => d.mint))]);
  return deltas.map((d) => {
    const info = infos.get(d.mint) ?? { symbol: null, name: null };
    return {
      walletId: wallet.id,
      walletLabel: wallet.label,
      chain: "solana",
      side: d.delta > 0 ? "buy" : "sell",
      mint: d.mint,
      symbol: info.symbol,
      name: info.name,
      uiAmount: Math.abs(d.delta),
      txHash: d.hash,
      atMs: d.atMs
    };
  }).sort((a, b) => b.atMs - a.atMs);
}
async function blockscoutTransfers(chain, address, maxPages = 2) {
  const base = BLOCKSCOUT[chain];
  const rows = [];
  let params = {};
  for (let page = 0; page < maxPages && params; page++) {
    const url = new URL(`${base}/api/v2/addresses/${address}/token-transfers`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const r = await getJson2(url.toString(), { headers: BS_HEADERS, timeoutMs: 2e4, retries: 1 });
    const items = r.items ?? [];
    if (!items.length) break;
    rows.push(...items);
    params = r.next_page_params ? Object.fromEntries(Object.entries(r.next_page_params).map(([k, v]) => [k, String(v)])) : null;
    const oldest = items[items.length - 1]?.timestamp ? Date.parse(items[items.length - 1].timestamp) : Number.NaN;
    if (!Number.isNaN(oldest)) params = oldest < Date.now() - 14 * 24 * 36e5 ? null : params;
  }
  return rows;
}
async function evmEvents(wallet, sinceMs) {
  if (wallet.chain !== "eth" && wallet.chain !== "base") return [];
  const rows = await blockscoutTransfers(wallet.chain, wallet.address);
  const recent = rows.filter((it) => it.timestamp && Date.parse(it.timestamp) >= sinceMs);
  if (!recent.length && !rows.length) return [];
  return evmDeltas(recent, wallet).map((d) => ({
    walletId: wallet.id,
    walletLabel: wallet.label,
    chain: wallet.chain,
    side: d.delta > 0 ? "buy" : "sell",
    mint: d.mint,
    symbol: d.symbol,
    name: d.name,
    uiAmount: Math.abs(d.delta),
    txHash: d.hash,
    atMs: d.atMs
  })).sort((a, b) => b.atMs - a.atMs);
}
async function fetchWalletEvents(wallet, sinceMs, nowMs = Date.now()) {
  try {
    if (wallet.chain === "solana") return await solanaEvents(wallet, sinceMs, nowMs);
    return await evmEvents(wallet, sinceMs);
  } catch {
    return [];
  }
}
async function fetchAllWalletEvents(wallets, sinceMs, nowMs = Date.now()) {
  const all = await Promise.all(wallets.slice(0, 12).map((w) => fetchWalletEvents(w, sinceMs, nowMs)));
  return all.flat().sort((a, b) => b.atMs - a.atMs);
}
var SOL_TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];
async function walletHoldings(wallet, mints) {
  const wanted = new Set(mints.map((m) => m.toLowerCase()));
  const held = /* @__PURE__ */ new Set();
  if (!wanted.size) return held;
  if (wallet.chain === "solana") {
    for (const program of SOL_TOKEN_PROGRAMS) {
      try {
        const r = await solRpc("getTokenAccountsByOwner", [wallet.address, { programId: program }, { encoding: "jsonParsed" }]);
        for (const a of r?.value ?? []) {
          const mint = a.account.data.parsed.info.mint.toLowerCase();
          if (wanted.has(mint)) held.add(mint);
        }
      } catch {
      }
    }
    return held;
  }
  const base = BLOCKSCOUT[wallet.chain];
  if (!base) return held;
  try {
    const r = await getJson2(`${base}/api/v2/addresses/${wallet.address}/token-balances`, { headers: BS_HEADERS, timeoutMs: 2e4, retries: 1 });
    for (const it of r.items ?? []) {
      const a = it.token?.address?.toLowerCase();
      if (a && wanted.has(a) && it.value && BigInt(it.value) > 0n) held.add(a);
    }
  } catch {
  }
  return held;
}

// src/api/dex.ts
var NETWORKS = [
  { key: "solana", label: "Solana", dexscreener: "solana", goplusChainId: null },
  { key: "base", label: "Base", dexscreener: "base", goplusChainId: "8453" },
  { key: "eth", label: "Ethereum", dexscreener: "ethereum", goplusChainId: "1" },
  { key: "bsc", label: "BNB Chain", dexscreener: "bsc", goplusChainId: "56" },
  { key: "arbitrum", label: "Arbitrum", dexscreener: "arbitrum", goplusChainId: "42161" }
];
function networkByKey(key) {
  return NETWORKS.find((n2) => n2.key === key || n2.dexscreener === key);
}
var MAJORS = /* @__PURE__ */ new Set(["SOL", "WSOL", "WETH", "ETH", "USDC", "USDT", "WBNB", "BNB", "DAI", "CBBTC", "WBTC", "USDS", "USDE", "FDUSD", "USD1"]);
var n = (v) => {
  if (v == null || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
function parsePools(json, source) {
  const tokens = /* @__PURE__ */ new Map();
  for (const t of json.included ?? []) tokens.set(t.id, t);
  const out = [];
  for (const p of json.data) {
    const a = p.attributes;
    const baseId = p.relationships?.base_token?.data?.id ?? "";
    const tok = tokens.get(baseId);
    const network = p.relationships?.network?.data?.id ?? baseId.split("_")[0];
    const symbol = tok?.attributes.symbol ?? a.name.split(" / ")[0];
    if (MAJORS.has(symbol.toUpperCase())) continue;
    const h24 = a.transactions?.h24 ?? {};
    const created = a.pool_created_at;
    out.push({
      id: p.id,
      network,
      poolAddress: a.address,
      dex: p.relationships?.dex?.data?.id ?? "",
      name: a.name,
      tokenAddress: tok?.attributes.address ?? baseId.slice(network.length + 1),
      tokenSymbol: symbol,
      tokenName: tok?.attributes.name ?? symbol,
      tokenImage: tok?.attributes.image_url && tok.attributes.image_url !== "missing.png" ? tok.attributes.image_url : void 0,
      coingeckoId: tok?.attributes.coingecko_coin_id ?? null,
      priceUsd: n(a.base_token_price_usd) ?? 0,
      fdvUsd: n(a.fdv_usd),
      mcapUsd: n(a.market_cap_usd),
      liquidityUsd: n(a.reserve_in_usd) ?? 0,
      volume24h: n(a.volume_usd?.h24) ?? 0,
      change1h: n(a.price_change_percentage?.h1),
      change6h: n(a.price_change_percentage?.h6),
      change24h: n(a.price_change_percentage?.h24),
      buys24h: h24.buys ?? 0,
      sells24h: h24.sells ?? 0,
      buyers24h: h24.buyers ?? null,
      sellers24h: h24.sellers ?? null,
      createdAt: created,
      ageHours: created ? (Date.now() - new Date(created).getTime()) / 36e5 : NaN,
      source
    });
  }
  return out;
}
var GT = "https://api.geckoterminal.com/api/v2";
async function getNewPools(network, page = 1) {
  const json = await getJson2(`${GT}/networks/${network}/new_pools?include=base_token&page=${page}`);
  return parsePools(json, "new");
}
async function getTokenPairs(dexChain, addresses) {
  const map = /* @__PURE__ */ new Map();
  for (let i = 0; i < addresses.length; i += 30) {
    const chunk = addresses.slice(i, i + 30);
    const pairs = await getJson2(`https://api.dexscreener.com/tokens/v1/${dexChain}/${chunk.join(",")}`);
    for (const p of pairs) {
      const key = p.baseToken.address.toLowerCase();
      const cur = map.get(key);
      if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) map.set(key, p);
    }
  }
  return map;
}

// src/api/security.ts
var on = (v) => v === "1";
var LP_LOCKED_DANGER_PCT = 30;
var LP_LOCKED_OK_PCT = 80;
function finalize(flags, top10, holders, sources, opts = {}) {
  let score = 100;
  for (const f of flags) score -= f.severity === "danger" ? 35 : f.severity === "warn" ? 12 : 0;
  score = Math.max(0, score);
  const hasDanger = flags.some((f) => f.severity === "danger");
  const hasWarn = flags.some((f) => f.severity === "warn");
  let verdict;
  if (hasDanger || score < 40) verdict = "Danger";
  else if (opts.insufficient) verdict = "Donn\xE9es insuffisantes";
  else if (hasWarn || opts.partial || score < 75) verdict = "Prudence";
  else verdict = "Plut\xF4t sain";
  return { score, verdict, flags, top10HoldersPct: top10, holders, sources };
}
var EVM_KEY_FIELDS = ["is_honeypot", "is_open_source", "buy_tax", "sell_tax", "is_mintable", "owner_change_balance", "hidden_owner", "cannot_sell_all"];
var known = (v) => v !== void 0 && v !== null && v !== "";
function evmReportFrom(response, address) {
  const addr = address.toLowerCase();
  const d = response?.result?.[addr];
  if (!d) throw new Error("GoPlus ne conna\xEEt pas encore ce token (trop r\xE9cent ?).");
  const flags = [];
  const knownFields = EVM_KEY_FIELDS.filter((k) => known(d[k])).length;
  const insufficient = response?.code !== 1 || !known(d.is_honeypot) || !known(d.is_open_source) || knownFields < 6;
  if (insufficient) flags.push({ label: `Analyse incompl\xE8te : ${knownFields} contr\xF4les sur ${EVM_KEY_FIELDS.length} ont pu \xEAtre faits`, severity: "warn", detail: "GoPlus n\u2019a pas renvoy\xE9 assez d\u2019informations sur ce contrat. N\u2019en d\xE9duis rien de rassurant." });
  if (on(d.is_honeypot)) flags.push({ label: "Honeypot : impossible de revendre", severity: "danger" });
  if (on(d.cannot_sell_all)) flags.push({ label: "Impossible de tout revendre", severity: "danger" });
  const buyTax = Number(d.buy_tax ?? 0) * 100;
  const sellTax = Number(d.sell_tax ?? 0) * 100;
  if (sellTax > 10 || buyTax > 10) flags.push({ label: `Taxes \xE9lev\xE9es (achat ${buyTax.toFixed(0)} %, vente ${sellTax.toFixed(0)} %)`, severity: sellTax > 25 ? "danger" : "warn" });
  else if (sellTax > 0 || buyTax > 0) flags.push({ label: `Taxes : achat ${buyTax.toFixed(1)} %, vente ${sellTax.toFixed(1)} %`, severity: "warn" });
  if (on(d.is_mintable)) flags.push({ label: "Le cr\xE9ateur peut cr\xE9er de nouveaux tokens", severity: "warn" });
  if (on(d.owner_change_balance)) flags.push({ label: "Le propri\xE9taire peut modifier les soldes", severity: "danger" });
  if (on(d.hidden_owner)) flags.push({ label: "Propri\xE9taire cach\xE9", severity: "danger" });
  if (on(d.can_take_back_ownership)) flags.push({ label: "Le contr\xF4le du contrat peut \xEAtre repris", severity: "warn" });
  if (on(d.transfer_pausable)) flags.push({ label: "Les transferts peuvent \xEAtre suspendus", severity: "warn" });
  if (on(d.is_blacklisted)) flags.push({ label: "Liste noire d\u2019adresses possible", severity: "warn" });
  if (on(d.slippage_modifiable)) flags.push({ label: "Taxes modifiables par le propri\xE9taire", severity: "warn" });
  if (on(d.trading_cooldown)) flags.push({ label: "D\xE9lai impos\xE9 entre deux transactions", severity: "warn" });
  if (on(d.is_proxy)) flags.push({ label: "Contrat proxy (code modifiable)", severity: "warn" });
  if (on(d.honeypot_with_same_creator)) flags.push({ label: "Historique du cr\xE9ateur : il a d\xE9j\xE0 d\xE9ploy\xE9 un honeypot", severity: "danger", detail: "Le cr\xE9ateur de ce contrat a un ant\xE9c\xE9dent : un de ses tokens pr\xE9c\xE9dents emp\xEAchait de revendre." });
  const creatorPct = Number(d.creator_percent ?? Number.NaN);
  if (Number.isFinite(creatorPct)) {
    if (creatorPct >= 15) flags.push({ label: `Le cr\xE9ateur d\xE9tient ${creatorPct.toFixed(1)} % de l'offre`, severity: creatorPct >= 25 ? "danger" : "warn", detail: "Il peut casser le prix en vendant d\u2019un seul coup." });
  }
  const ownerPct = Number(d.owner_percent ?? Number.NaN);
  if (Number.isFinite(ownerPct)) {
    if (ownerPct >= 15) flags.push({ label: `Le propri\xE9taire du contrat d\xE9tient ${ownerPct.toFixed(1)} % de l'offre`, severity: ownerPct >= 25 ? "danger" : "warn" });
    else if (ownerPct > 0) flags.push({ label: `Le propri\xE9taire du contrat d\xE9tient ${ownerPct.toFixed(1)} % de l'offre`, severity: "ok" });
  }
  if (d.is_open_source === "0") flags.push({ label: "Code source non v\xE9rifi\xE9", severity: "danger" });
  const holders = d.holders ?? [];
  const top10 = holders.slice(0, 10).filter((h) => !h.is_locked && !(h.tag ?? "").toLowerCase().includes("burn")).reduce((s, h) => s + Number(h.percent || 0) * 100, 0);
  if (top10 > 50) flags.push({ label: `Top 10 d\xE9tenteurs : ${top10.toFixed(0)} % de l\u2019offre`, severity: "danger" });
  else if (top10 > 30) flags.push({ label: `Top 10 d\xE9tenteurs : ${top10.toFixed(0)} % de l\u2019offre`, severity: "warn" });
  const lp = d.lp_holders ?? [];
  if (lp.length) {
    const lockedPct = lp.filter((h) => h.is_locked || /burn|dead|null/i.test(h.tag ?? "")).reduce((s, h) => s + Number(h.percent || 0) * 100, 0);
    if (lockedPct < LP_LOCKED_DANGER_PCT) flags.push({ label: `Liquidit\xE9 verrouill\xE9e/br\xFBl\xE9e : ${lockedPct.toFixed(0)} % seulement`, severity: "danger", detail: "Le cr\xE9ateur peut retirer presque toute la liquidit\xE9 d\u2019un coup." });
    else if (lockedPct < 50) flags.push({ label: `Liquidit\xE9 verrouill\xE9e/br\xFBl\xE9e : ${lockedPct.toFixed(0)} % seulement`, severity: "warn" });
    else flags.push({ label: `Liquidit\xE9 verrouill\xE9e/br\xFBl\xE9e : ${lockedPct.toFixed(0)} %`, severity: "ok" });
  }
  if (!insufficient && !flags.some((f) => f.severity !== "ok")) flags.push({ label: "Aucun pi\xE8ge classique d\xE9tect\xE9", severity: "ok" });
  return finalize(flags, holders.length ? top10 : null, d.holder_count ? Number(d.holder_count) : null, ["GoPlus Security"], { insufficient });
}
async function scanEvm(chainId, address) {
  const addr = address.toLowerCase();
  const r = await getJson2(
    `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${addr}`
  );
  return evmReportFrom(r, addr);
}
function solanaReportFrom(gp, rug) {
  const flags = [];
  const sources = [];
  let top10 = null;
  if (gp) {
    sources.push("GoPlus Security");
    if (on(gp.mintable?.status)) flags.push({ label: "Autorit\xE9 de mint active : offre illimit\xE9e possible", severity: "danger" });
    if (on(gp.freezable?.status)) flags.push({ label: "Autorit\xE9 de gel active : tes tokens peuvent \xEAtre bloqu\xE9s", severity: "danger" });
    if (on(gp.balance_mutable_authority?.status)) flags.push({ label: "Les soldes peuvent \xEAtre modifi\xE9s", severity: "danger" });
    if (on(gp.closable?.status)) flags.push({ label: "Le compte du token peut \xEAtre ferm\xE9", severity: "warn" });
    if (on(gp.metadata_mutable?.status)) flags.push({ label: "M\xE9tadonn\xE9es modifiables", severity: "warn" });
    if (on(gp.non_transferable)) flags.push({ label: "Token non transf\xE9rable", severity: "danger" });
    const holders = gp.holders ?? [];
    if (holders.length) {
      top10 = holders.slice(0, 10).filter((h) => !h.is_locked).reduce((s, h) => s + Number(h.percent || 0) * 100, 0);
      if (top10 > 50) flags.push({ label: `Top 10 d\xE9tenteurs : ${top10.toFixed(0)} %`, severity: "danger" });
      else if (top10 > 30) flags.push({ label: `Top 10 d\xE9tenteurs : ${top10.toFixed(0)} %`, severity: "warn" });
    }
  }
  if (rug) {
    sources.push("RugCheck");
    for (const risk of rug.risks ?? []) {
      const sev = risk.level === "danger" ? "danger" : "warn";
      if (!flags.some((f) => f.label.toLowerCase().includes(risk.name.toLowerCase().slice(0, 8)))) {
        flags.push({ label: risk.name, severity: sev, detail: risk.description });
      }
    }
    if (rug.lpLockedPct != null) {
      const p = rug.lpLockedPct;
      flags.push({
        label: `Liquidit\xE9 verrouill\xE9e : ${p.toFixed(0)} %`,
        severity: p >= LP_LOCKED_OK_PCT ? "ok" : p >= LP_LOCKED_DANGER_PCT ? "warn" : "danger",
        detail: p < LP_LOCKED_DANGER_PCT ? "Le cr\xE9ateur peut retirer presque toute la liquidit\xE9 d\u2019un coup." : void 0
      });
    }
  }
  if (!sources.length) throw new Error("Scan indisponible pour ce token pour le moment.");
  const partial = sources.length < 2;
  if (partial) flags.push({ label: `Une seule source a r\xE9pondu (${sources[0]}) : analyse incompl\xE8te`, severity: "warn" });
  if (!partial && !flags.some((f) => f.severity !== "ok")) flags.push({ label: "Aucun pi\xE8ge classique d\xE9tect\xE9", severity: "ok" });
  return finalize(flags, top10, null, sources, { partial });
}
async function scanSolana(mint) {
  let gp = null;
  let rug = null;
  try {
    const r = await getJson2(`https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${mint}`, { retries: 1 });
    gp = r.result?.[mint] ?? Object.values(r.result ?? {})[0] ?? null;
  } catch {
  }
  try {
    rug = await getJson2(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, { retries: 1 });
  } catch {
  }
  return solanaReportFrom(gp, rug);
}

// src/lib/emerging.ts
var EMERGING_RULES = {
  /** Plus de 7 jours : ce n'est plus une émergente, c'est une position du DEX ordinaire. */
  maxAgeHours: 7 * 24,
  /** Moins de 25 k $ de liquidité : impossible de sortir sans casser le prix. */
  minLiquidityUsd: 25e3,
  /** Moins de 75 k $ échangés en 24 h : personne n'y est, ou pas naturellement. */
  minVolumeUsd: 75e3,
  /** Les achats doivent dominer les ventes de 15 % au moins. */
  buyPressure: 1.15
};
var within = (v, min, max) => Math.max(0, Math.min(100, (v - min) / (max - min) * 100));
function emergingCandidates(pools, max = 8) {
  const out = [];
  for (const p of pools) {
    if (p.network !== "solana" && p.network !== "base") continue;
    if (isStable(p.tokenSymbol) || isWrappedOrStaked(p.tokenSymbol, p.tokenName)) continue;
    if (p.ageHours > EMERGING_RULES.maxAgeHours) continue;
    if (p.liquidityUsd < EMERGING_RULES.minLiquidityUsd) continue;
    if (p.volume24h < EMERGING_RULES.minVolumeUsd) continue;
    const total = p.buys24h + p.sells24h;
    if (total < 40) continue;
    const buyShare = p.buys24h / total;
    if (p.buys24h < p.sells24h * EMERGING_RULES.buyPressure) continue;
    if ((p.change24h ?? 0) < 5) continue;
    const reasons = [];
    reasons.push(`${p.ageHours < 24 ? `${Math.round(p.ageHours)} h` : `${Math.round(p.ageHours / 24)} j`} d'\xE2ge`);
    reasons.push(`${Math.round(buyShare * 100)} % d'achats (24 h)`);
    if (p.change24h != null && p.change24h > 30 && p.change24h < 400) reasons.push(`+${Math.round(p.change24h)} % sur 24 h`);
    const activity = within(p.volume24h / Math.max(1, p.liquidityUsd), 0.5, 4);
    const pressure = (buyShare - 0.5) / 0.5 * 100;
    const freshness = within(EMERGING_RULES.maxAgeHours - p.ageHours, 0, EMERGING_RULES.maxAgeHours - 24);
    const traction = Math.round(0.45 * activity + 0.35 * Math.max(0, Math.min(100, pressure)) + 0.2 * freshness);
    out.push({ pool: p, traction, reasons });
  }
  return out.sort((a, b) => b.traction - a.traction || b.pool.volume24h - a.pool.volume24h).slice(0, max);
}
function emergingLine(c, extra) {
  const p = c.pool;
  const net = p.network === "solana" ? "Solana" : "Base";
  const vol = p.volume24h >= 1e6 ? `${(p.volume24h / 1e6).toFixed(1)} M $` : `${Math.round(p.volume24h / 1e3)} k $`;
  const parts = [`${p.tokenSymbol.toUpperCase()} (${net}, ${c.reasons[0]}, vol ${vol}, ${c.reasons[1]}`];
  if (extra?.security) parts[0] += `, ${extra.security}`;
  let out = parts[0] + ")";
  if (extra?.wallets?.length) out += ` \u2014 wallet suivi : ${extra.wallets.join(", ")}`;
  return out;
}

// src/runner/ai.ts
var TIMEOUT_MS3 = 25e3;
function newsPrompt(items) {
  const lines = items.map((i, n2) => `${n2 + 1}. [${i.coinName}] ${i.title} (${i.source}) \u2014 ${i.summaryText}`).join("\n");
  return [
    "Tu es analyste crypto pour un investisseur particulier fran\xE7ais. Chaque entr\xE9e ci-dessous est une actualit\xE9 r\xE9elle.",
    "Pour CHAQUE entr\xE9e, note son importance pour un d\xE9tenteur de cette crypto :",
    "- 1-3 : bruit, promo, opinion sans cons\xE9quence ;",
    "- 4-5 : information utile mais sans effets directs attendus ;",
    "- 6-7 : \xE0 conna\xEEtre (partenariat, Graham r\xE9glementaire, produit, adoption) ;",
    "- 8-10 : peut bouger le prix ou la s\xE9curit\xE9 (hack, proc\xE8s, interdiction, listing majeur, ETF\u2026).",
    "R\xE9ponds UNIQUEMENT un tableau JSON (bloc ```json), une entr\xE9e par actu dans l\u2019ordre :",
    '[{"n": 1, "importance": 6, "resume": "R\xE9sum\xE9 en 3 phrases courtes en fran\xE7ais : ce qui s\u2019est pass\xE9, pourquoi c\u2019est important, ce que le d\xE9tenteur peut faire."}]',
    "",
    lines
  ].join("\n");
}
function parseNewsRatings(text, n2) {
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/i) ?? [null, text];
  const candidate = block[1] ?? "";
  const arr = candidate.slice(candidate.indexOf("["), candidate.lastIndexOf("]") + 1);
  try {
    const raw = JSON.parse(arr);
    const out = [];
    for (let i = 0; i < n2; i++) {
      const r = raw.find((x) => Number(x.n) === i + 1) ?? raw[i];
      const importance = Number(r?.importance);
      out.push({ importance: Number.isFinite(importance) ? Math.max(0, Math.min(10, importance)) : 0, resume: typeof r?.resume === "string" ? r.resume.trim() : "" });
    }
    return out;
  } catch {
    return Array.from({ length: n2 }, () => ({ importance: 0, resume: "" }));
  }
}
async function rateNews(apiKey, model, items) {
  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: newsPrompt(items.slice(0, 8)) }], temperature: 0.2 }),
      signal: AbortSignal.timeout(TIMEOUT_MS3)
    });
    if (!res.ok) return Array.from({ length: items.length }, () => ({ importance: 0, resume: "" }));
    const j = await res.json();
    const text = j.choices?.[0]?.message?.content ?? "";
    return parseNewsRatings(text, items.length);
  } catch {
    return Array.from({ length: items.length }, () => ({ importance: 0, resume: "" }));
  }
}

// src/lib/lab/clock.ts
function offsetMs(ms, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms));
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second")) - Math.floor(ms / 1e3) * 1e3;
}
function execInstant(day, hour, timeZone) {
  const [y, m, d] = day.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, hour);
  let t = naive - offsetMs(naive, timeZone);
  t = naive - offsetMs(t, timeZone);
  return t;
}
function decisionDay(execMs) {
  return new Date(Math.floor(execMs / 864e5) * 864e5 - 864e5).toISOString().slice(0, 10);
}
function localDay(ms, timeZone) {
  return new Date(ms + offsetMs(ms, timeZone)).toISOString().slice(0, 10);
}
function addDays(day, n2) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n2 * 864e5).toISOString().slice(0, 10);
}
function isoWeek(day) {
  const d = /* @__PURE__ */ new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3);
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 864e5 - 3 + (jan4.getUTCDay() + 6) % 7) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// src/lib/lab/autoState.ts
function autoState(portfolio, logs, closeOf) {
  let cash = portfolio.startingUsd;
  const positions = {};
  const lastFill = {};
  const lastPrice = {};
  let peak = portfolio.startingUsd;
  let trough = portfolio.startingUsd;
  for (const l of [...logs].filter((x) => x.portfolioId === portfolio.id).sort((a, b) => a.day.localeCompare(b.day))) {
    cash += l.depositUsd;
    for (const f of l.fills) {
      lastPrice[f.coinId] = f.marketUsd;
      if (f.tag) {
        lastFill[f.tag] = l.day;
        lastFill[`${f.tag}|${f.coinId}`] = l.day;
      }
      const p = positions[f.coinId];
      if (f.side === "buy") {
        const amount = f.quantity * f.priceUsd + f.feeUsd;
        cash -= amount;
        positions[f.coinId] = {
          coinId: f.coinId,
          symbol: f.symbol,
          name: f.name,
          quantity: Math.round(((p?.quantity ?? 0) + f.quantity) * 1e8) / 1e8,
          costUsd: (p?.costUsd ?? 0) + amount,
          openedOn: p?.openedOn ?? l.day,
          ...f.stop != null ? { stop: f.stop } : p?.stop != null ? { stop: p.stop } : {},
          ...f.target != null ? { target: f.target } : p?.target != null ? { target: p.target } : {},
          ...f.stopOnClose || p?.stopOnClose ? { stopOnClose: true } : {}
        };
      } else {
        cash += f.quantity * f.priceUsd - f.feeUsd;
        if (!p) continue;
        const left = Math.round((p.quantity - f.quantity) * 1e8) / 1e8;
        if (left > 0) positions[f.coinId] = { ...p, quantity: left, costUsd: p.costUsd * (left / p.quantity) };
        else delete positions[f.coinId];
      }
    }
    if (closeOf) {
      let value = cash;
      for (const pos of Object.values(positions)) value += pos.quantity * (closeOf(pos.coinId, l.day) ?? lastPrice[pos.coinId] ?? 0);
      if (value >= peak) {
        peak = value;
        trough = value;
      } else trough = Math.min(trough, value);
    }
  }
  return { cashUsd: cash, positions, peakEquityUsd: peak, minSincePeakUsd: trough, lastFill };
}
var content = (l) => JSON.stringify({ ...l, updatedAt: void 0, by: void 0 });
function sameDayLog(a, b) {
  return content(a) === content(b);
}
function mergeDayLogs(existing, incoming) {
  const byId = new Map(existing.map((l) => [l.id, l]));
  const changed = [];
  for (const l of incoming) {
    const old = byId.get(l.id);
    if (old && sameDayLog(old, l)) continue;
    byId.set(l.id, l);
    changed.push(l);
  }
  return { days: changed.length ? [...byId.values()] : existing, changed };
}
function effectiveCursor(portfolio, logs) {
  let c = portfolio.cursorDay ?? "";
  for (const l of logs) if (l.portfolioId === portfolio.id && l.day > c) c = l.day;
  return c;
}

// src/lib/gems.ts
var DEFAULT_SMALLCAP_FILTER = { minCap: 5e6, maxCap: 5e8, minVolume: 3e5 };
function isSmallCapCandidate(c, f) {
  if (!(c.marketCap >= f.minCap && c.marketCap <= f.maxCap)) return false;
  if (!(c.volume24h >= f.minVolume)) return false;
  if (isStable(c.symbol, c.id) || isWrappedOrStaked(c.symbol, c.name, c.id) || isGold(c.symbol)) return false;
  if (looksLikeNonGem(c.name, c.symbol)) return false;
  if (c.change7d != null && c.change30d != null && Math.abs(c.change7d) < 1.5 && Math.abs(c.change30d) < 3) return false;
  if (c.change30d != null && c.change30d < -40) return false;
  return true;
}
function looksLikeNonGem(name, symbol) {
  return /\busd\b|dollar|\beur\b|euro|coinvertible|tokenized|xstock|\(ondo|backed |\bcorporation\b|\binc\.?$|\bstock\b|treasury|\bgold\b/i.test(name) || /^(usd|eur)/i.test(symbol);
}
function scoreSmallCap(c) {
  const flags = [];
  const volRatio = c.marketCap > 0 ? c.volume24h / c.marketCap : 0;
  let sVol = piecewise(volRatio, [[0.02, 0], [0.08, 40], [0.2, 80], [0.4, 100]]);
  if (volRatio > 1.5) {
    sVol = 40;
    flags.push({ label: "Volume anormal (possible wash trading)", tone: "warn" });
  } else if (volRatio >= 0.2) flags.push({ label: "Forte activit\xE9", tone: "good" });
  const c7 = c.change7d ?? 0;
  const c30 = c.change30d ?? 0;
  let sMom = piecewise(c30, [[-30, 0], [0, 35], [25, 75], [80, 100], [200, 70], [400, 30]]) * 0.6 + piecewise(c7, [[-15, 0], [0, 40], [15, 85], [40, 100], [FOMO_7D_PCT, 70], [100, 30]]) * 0.4;
  if (c30 > 200 || c7 > FOMO_7D_PCT) flags.push({ label: `D\xE9j\xE0 fortement mont\xE9 (+${FOMO_7D_PCT} % en 7 jours ou plus) \u2014 risque FOMO`, tone: "warn" });
  else if (c30 > 15 && c7 > 0) flags.push({ label: "Momentum sain", tone: "good" });
  sMom = clamp(sMom, 0, 100);
  let sDil = 60;
  if (c.fdv && c.marketCap > 0) {
    const r = c.fdv / c.marketCap;
    sDil = piecewise(r, [[1, 100], [1.5, 80], [2, 55], [3, 25], [5, 0]]);
    if (r <= 1.3) flags.push({ label: "Faible dilution future", tone: "good" });
    else if (r >= 3) flags.push({ label: `FDV ${r.toFixed(1).replace(".", ",")}\xD7 la capi : gros d\xE9blocages \xE0 venir`, tone: "bad" });
  }
  const sSize = piecewise(c.marketCap, [[5e6, 60], [15e6, 90], [6e7, 100], [15e7, 85], [5e8, 50]]);
  let sAth = 50;
  if (c.athChangePct != null) {
    if (c.athChangePct < -90) {
      sAth = 25;
      flags.push({ label: "\xC0 plus de -90 % de son ATH", tone: "warn" });
    } else if (c.athChangePct < -60 && c30 > 0) {
      sAth = 75;
      flags.push({ label: "Rebond depuis une forte d\xE9cote", tone: "good" });
    } else if (c.athChangePct > -10) {
      sAth = 70;
      flags.push({ label: "Proche de ses plus hauts (d\xE9couverte de prix)", tone: "good" });
    }
  }
  let score = sVol * 0.25 + sMom * 0.3 + sDil * 0.25 + sSize * 0.1 + sAth * 0.1;
  if (c.trending) {
    score += 6;
    flags.push({ label: "Tendance sur CoinGecko", tone: "good" });
  }
  return { score: Math.round(clamp(score, 0, 100)), flags };
}

// src/lib/discovery.ts
var MIDCAP_FILTER = { minCap: 5e6, maxCap: Infinity, minVolume: 3e5 };
function autoDiscoveryCandidates(rows, opts) {
  const max = opts.max ?? 5;
  const seen = /* @__PURE__ */ new Set();
  return rows.filter((c) => isSmallCapCandidate(c, opts.filter ?? DEFAULT_SMALLCAP_FILTER)).filter((c) => !opts.excluded.has(c.id) && !opts.excludedSymbols.has(c.symbol.toUpperCase())).map((c) => ({ c, s: scoreSmallCap(c) })).sort((a, b) => b.s.score - a.s.score).map(({ c, s }) => ({ coin: { coinId: c.id, symbol: c.symbol, name: c.name }, score: s.score, reason: `${opts.label ?? "P\xE9pite du scan"}, score ${s.score}/100` })).filter((p) => seen.has(p.coin.coinId) ? false : (seen.add(p.coin.coinId), true)).slice(0, max);
}

// src/lib/autoBasket.ts
var AUTO_BASKET_VERSION = 1;
var AUTO_BASE_TOP = 20;
var AUTO_MAX_LINES = 3;
var AUTO_MIN_INVESTOR_SCORE = -15;
var round2 = (x) => Math.round(x * 100) / 100;
var usdc = (x) => `${String(round2(x)).replace(".", ",")} USDC`;
var pct2 = (x) => `${String(Math.round(x * 10) / 10).replace(".", ",")} %`;
function topBaseUniverse(rows, top = AUTO_BASE_TOP) {
  return rows.filter((r) => !isStable(r.symbol, r.id) && !isWrappedOrStaked(r.symbol, r.name, r.id) && !isGold(r.symbol)).filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)).slice(0, top);
}
var DEFAULT_ANCHOR_PCT = 70;
var BASE_MODE_LABEL = {
  top3: "Trois meilleurs scores",
  cap: "Pond\xE9r\xE9e par la capitalisation",
  anchor: "Ancre Bitcoin et Ethereum",
  equal: "Parts \xE9gales sur le top 20",
  btc: "Bitcoin seul"
};
function split(picks, maxLines, amount, minOrder, kind, reasonOf) {
  const min = Math.max(minOrder, 0.01);
  const n2 = Math.min(Math.max(0, Math.floor(maxLines)), Math.floor((amount + 1e-9) / min), picks.length);
  if (n2 <= 0) return [];
  const each = Math.floor(amount / n2 * 100) / 100;
  return picks.slice(0, n2).map((c, i) => ({
    coinId: c.coin.coinId,
    symbol: c.coin.symbol,
    name: c.coin.name,
    image: c.coin.image,
    usd: i === 0 ? round2(amount - each * (n2 - 1)) : each,
    kind,
    reason: reasonOf(c)
  }));
}
function splitWeighted(picks, maxLines, amount, minOrder, kind, reasonOf) {
  const min = Math.max(minOrder, 0.01);
  let list3 = picks.filter((c) => (c.weight ?? 0) > 0).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, Math.max(0, Math.floor(maxLines)));
  const total = () => list3.reduce((s, c) => s + (c.weight ?? 0), 0);
  while (list3.length && amount * (list3[list3.length - 1].weight ?? 0) / total() < min - 1e-9) list3 = list3.slice(0, -1);
  if (!list3.length) return [];
  const W = total();
  const shares = list3.map((c) => Math.floor(amount * (c.weight ?? 0) / W * 100) / 100);
  shares[0] = round2(amount - shares.slice(1).reduce((s, x) => s + x, 0));
  return list3.map((c, i) => ({ coinId: c.coin.coinId, symbol: c.coin.symbol, name: c.coin.name, image: c.coin.image, usd: shares[i], kind, reason: reasonOf(c) }));
}
var signed = (s) => `${s > 0 ? "+" : s < 0 ? "\u2212" : ""}${Math.abs(s)}`;
function planAutoBasket(s, ctx) {
  const notes = [];
  const warnings = [];
  const excluded = [];
  const amount = Math.max(0, s.amountUsd);
  const basePart = Math.max(0, Math.min(100, s.basePct)) / 100;
  const t = ctx.temperature;
  const mult = t == null ? 1 : temperatureMultiplier(t);
  const factor = discoveryTemperatureFactor(t);
  const baseWanted = amount * basePart * mult;
  const discWanted = amount * (1 - basePart) * factor;
  const total = ctx.totalValueUsd;
  if (t != null) notes.push(`Temp\xE9rature du march\xE9 ${Math.round(t)}/100 : base \xD7${String(mult).replace(".", ",")}.`);
  else warnings.push("Temp\xE9rature du march\xE9 indisponible : les montants ne sont pas modul\xE9s (\xD71). Rev\xE9rifie quand la connexion revient.");
  if (basePart < 1 && factor === 0) notes.push("March\xE9 tr\xE8s chaud : aucune d\xE9couverte aujourd\u2019hui, sa part reste en r\xE9serve.");
  else if (basePart < 1 && factor < 1) notes.push("March\xE9 chaud : la part d\xE9couverte est r\xE9duite de moiti\xE9, le reste va en r\xE9serve.");
  const screen = (list3, side) => {
    const ok = [];
    for (const c of list3) {
      const sym = c.coin.symbol.toUpperCase();
      if (c.cdc === "unknown") excluded.push({ symbol: sym, reason: "absente de la liste Crypto.com" });
      else if (c.change7d != null && c.change7d > FOMO_7D_PCT) excluded.push({ symbol: sym, reason: `+${Math.round(c.change7d)} % en 7 jours (FOMO)` });
      else if (side === "base" && c.score != null && c.score <= AUTO_MIN_INVESTOR_SCORE) excluded.push({ symbol: sym, reason: `score investisseur ${signed(c.score)} (bas)` });
      else if (side === "discovery" && total >= 20 * amount && total > 0 && c.heldUsd / total * 100 >= ctx.maxPerGemPct) excluded.push({ symbol: sym, reason: `plafond de ${pct2(ctx.maxPerGemPct)} par p\xE9pite atteint` });
      else ok.push(c);
    }
    return ok.sort((a, b) => (b.score ?? -999) - (a.score ?? -999) || (a.rank ?? Infinity) - (b.rank ?? Infinity) || b.heldUsd - a.heldUsd);
  };
  const keepOpen = (list3, canOpen, label) => {
    if (canOpen) return list3;
    const held = list3.filter((c) => c.heldUsd > 0);
    if (held.length < list3.length) notes.push(`${label} : ton maximum de lignes est atteint, seules les cryptos que tu d\xE9tiens d\xE9j\xE0 sont renforc\xE9es.`);
    return held;
  };
  const pool = [];
  const remember = (list3, side) => {
    for (const c of list3.slice(0, 8)) pool.push({ coin: c.coin, side, score: c.score, rank: c.rank, change7d: c.change7d, heldUsd: c.heldUsd });
  };
  let discOrders = [];
  if (discWanted > 5e-3 && s.maxDiscoveryLines > 0) {
    const discPool = keepOpen(screen(ctx.discovery, "discovery"), ctx.canOpenDiscovery, "D\xE9couverte");
    remember(discPool, "discovery");
    discOrders = split(discPool, Math.min(AUTO_MAX_LINES, s.maxDiscoveryLines), discWanted, s.minOrderUsd, "discovery", (c) => `D\xE9couverte \xB7 score du scan ${c.score ?? "\u2014"}/100${c.heldUsd > 0 ? " \xB7 tu en d\xE9tiens d\xE9j\xE0" : ""}`);
    if (!discOrders.length) notes.push(discWanted < Math.max(s.minOrderUsd, 0.01) ? `Part d\xE9couverte (${usdc(discWanted)}) sous le minimum de ${usdc(s.minOrderUsd)} : elle revient \xE0 la base.` : "Aucune d\xE9couverte ne passe les r\xE8gles aujourd\u2019hui : le montant revient \xE0 la base.");
  } else if (discWanted > 5e-3) notes.push("Aucune ligne d\xE9couverte demand\xE9e : le montant revient \xE0 la base.");
  const discSpent = discOrders.reduce((sum, o) => sum + o.usd, 0);
  let base = baseWanted + Math.max(0, discWanted - discSpent);
  const extra = base + discSpent - amount;
  if (extra > 5e-3) {
    const allowed = Math.min(extra, Math.max(0, s.reserveUsd));
    if (allowed < extra) {
      base -= extra - allowed;
      notes.push(`R\xE9serve insuffisante (${usdc(s.reserveUsd)}) : la base est limit\xE9e pour ne pas d\xE9passer le budget.`);
    } else notes.push(`March\xE9 qui a peur : ${usdc(extra)} puis\xE9s dans ta r\xE9serve.`);
  }
  let baseOrders = [];
  const mode = s.baseMode ?? "top3";
  if (base > 5e-3) {
    const reasonOf = (c) => {
      const sig = c.score != null ? ` \xB7 score investisseur ${signed(c.score)}` : " \xB7 score indisponible";
      return `${c.rank != null ? `Rang ${c.rank} (20 premi\xE8res hors stablecoins)` : "20 premi\xE8res hors stablecoins"}${sig}${c.heldUsd > 0 ? " \xB7 tu en d\xE9tiens d\xE9j\xE0" : ""}`;
    };
    const pick = (id) => ctx.base.find((c) => c.coin.coinId === id && c.cdc !== "unknown");
    const one = (c, usd, reason) => ({ coinId: c.coin.coinId, symbol: c.coin.symbol, name: c.coin.name, image: c.coin.image, usd: round2(usd), kind: "core", reason });
    const basePool = keepOpen(screen(ctx.base, "base"), ctx.canOpenBase, "Base");
    remember(basePool, "core");
    if (mode === "btc") {
      const btc = pick("bitcoin");
      if (btc && base >= Math.max(s.minOrderUsd, 0.01)) baseOrders = [one(btc, base, "Bitcoin seul (r\xE8gle de la base)")];
    } else if (mode === "anchor") {
      const share = Math.max(0, Math.min(100, s.anchorPct ?? DEFAULT_ANCHOR_PCT)) / 100;
      const btc = pick("bitcoin");
      const eth = pick("ethereum");
      let anchored = base * share;
      const rest = split(basePool.filter((c) => c.coin.coinId !== "bitcoin" && c.coin.coinId !== "ethereum"), Math.min(AUTO_MAX_LINES, s.maxBaseLines), round2(base - anchored), s.minOrderUsd, "core", reasonOf);
      if (!rest.length) anchored = base;
      const why = `Ancre Bitcoin et Ethereum (${Math.round(share * 100)} % de la base)`;
      const btcUsd = eth ? round2(anchored * 0.75) : round2(anchored);
      const anchor = [btc && btcUsd >= s.minOrderUsd ? one(btc, btcUsd, why) : null, eth && anchored - btcUsd >= s.minOrderUsd ? one(eth, anchored - btcUsd, why) : null].filter((x) => !!x);
      baseOrders = [...anchor, ...rest];
    } else if (mode === "cap") {
      baseOrders = splitWeighted(basePool, AUTO_BASE_TOP, base, s.minOrderUsd, "core", reasonOf);
    } else if (mode === "equal") {
      baseOrders = split(basePool, AUTO_BASE_TOP, base, s.minOrderUsd, "core", reasonOf);
    } else {
      baseOrders = split(basePool, Math.min(AUTO_MAX_LINES, s.maxBaseLines), base, s.minOrderUsd, "core", reasonOf);
    }
    if (!baseOrders.length) notes.push(base < Math.max(s.minOrderUsd, 0.01) ? `Part base (${usdc(base)}) sous le minimum de ${usdc(s.minOrderUsd)} : mise en r\xE9serve.` : "Aucune crypto du top 20 ne passe les r\xE8gles aujourd\u2019hui : le montant part en r\xE9serve.");
  }
  const orders = [...baseOrders, ...discOrders];
  if (orders.length > 1) notes.push(mode === "top3" || mode === "equal" ? "Le montant de chaque c\xF4t\xE9 est partag\xE9 \xE0 parts \xE9gales entre les cryptos retenues." : `Base : r\xE8gle \xAB ${BASE_MODE_LABEL[mode]} \xBB.`);
  const invest = round2(orders.reduce((sum, o) => sum + o.usd, 0));
  return { baseUsd: amount, investUsd: invest, reserveDeltaUsd: round2(amount - invest), multiplier: mult, discoveryShare: 1 - basePart, orders, notes, warnings, excluded, pool };
}
var toSmallCapInput = (m) => ({
  id: m.id,
  symbol: m.symbol,
  name: m.name,
  marketCap: m.market_cap,
  fdv: m.fully_diluted_valuation,
  volume24h: m.total_volume,
  change7d: m.price_change_percentage_7d_in_currency ?? null,
  change30d: m.price_change_percentage_30d_in_currency ?? null,
  athChangePct: m.ath_change_percentage,
  rank: m.market_cap_rank
});
function autoBaseUniverse(markets2) {
  return topBaseUniverse(markets2.map((m) => ({ id: m.id, symbol: m.symbol, name: m.name, image: m.image, rank: m.market_cap_rank })), AUTO_BASE_TOP);
}
function autoDiscoveryPicks(markets2, smallCaps, source, base) {
  const opts = { excluded: new Set(base.map((c) => c.id)), excludedSymbols: new Set(base.map((c) => c.symbol.toUpperCase())), max: 8 };
  const gems = source !== "mid" && smallCaps ? autoDiscoveryCandidates(smallCaps.map(toSmallCapInput), { ...opts, label: "P\xE9pite du scan" }) : [];
  const mids = source !== "gems" ? autoDiscoveryCandidates(markets2.filter((m) => (m.market_cap_rank ?? 0) > AUTO_BASE_TOP).map(toSmallCapInput), { ...opts, filter: MIDCAP_FILTER, label: "Milieu de classement" }) : [];
  const seen = /* @__PURE__ */ new Set();
  return [...gems, ...mids].sort((a, b) => b.score - a.score).filter((p) => seen.has(p.coin.coinId) ? false : (seen.add(p.coin.coinId), true)).slice(0, 8);
}
function buildAutoBasketPlan(i) {
  const base = autoBaseUniverse(i.markets);
  const picks = autoDiscoveryPicks(i.markets, i.smallCaps, i.basket.discoverySource ?? "both", base);
  const imageOf = (id) => i.markets.find((m) => m.id === id)?.image ?? i.smallCaps?.find((m) => m.id === id)?.image;
  const cand = (coin, rank, score) => ({
    coin,
    rank,
    score,
    change7d: i.change7d[coin.coinId] ?? null,
    heldUsd: i.heldUsd[coin.coinId] ?? 0,
    cdc: i.cdc ? i.cdc[coin.coinId] ?? "unknown" : null
  });
  const b = i.basket;
  return planAutoBasket(
    { amountUsd: b.amountUsd, basePct: b.basePct ?? 70, maxBaseLines: b.maxBaseLines ?? 3, maxDiscoveryLines: b.maxDiscoveryLines ?? 3, minOrderUsd: b.minOrderUsd, reserveUsd: b.reserveUsd, baseMode: b.baseMode, anchorPct: b.anchorPct },
    {
      temperature: i.temperature,
      totalValueUsd: i.totalValueUsd,
      maxPerGemPct: i.rules.maxPerGemPct,
      base: base.map((c) => ({ ...cand({ coinId: c.id, symbol: c.symbol, name: c.name, image: c.image }, c.rank, i.scores[c.id] ?? null), weight: i.weights?.[c.id] ?? i.markets.find((m) => m.id === c.id)?.market_cap ?? 0 })),
      discovery: picks.map((p) => cand({ ...p.coin, image: imageOf(p.coin.coinId) }, null, p.score)),
      canOpenBase: i.linesOpen < i.rules.maxLines,
      canOpenDiscovery: i.discoveryLinesOpen < i.rules.maxDiscoveryLines
    }
  );
}

// src/lib/lab/strategies/dcaBtc.ts
var dcaBtc = {
  id: "dca-btc",
  version: 1,
  label: "DCA Bitcoin simple",
  describe: "\xC0 chaque \xE9ch\xE9ance, tout le montant en Bitcoin. C\u2019est la r\xE9f\xE9rence : une strat\xE9gie qui ne fait pas mieux ne m\xE9rite pas d\u2019\xEAtre suivie.",
  defaults: { amountUsd: 25, daysOfWeek: [2, 5] },
  uses: [],
  replayable: true,
  kind: "deposits",
  deposit: (ctx, p) => ctx.scheduled(p.daysOfWeek) ? p.amountUsd : 0,
  decide: (ctx, p) => ctx.scheduled(p.daysOfWeek) ? [{ coinId: "bitcoin", symbol: "btc", name: "Bitcoin", side: "buy", sizing: { usd: p.amountUsd }, reason: "\xC9ch\xE9ance : Bitcoin, sans modulation", tag: "dca" }] : []
};

// src/lib/lab/strategies/investisseur.ts
var fr = (x) => String(x).replace(".", ",");
var daysBetween2 = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
var investisseur = {
  id: "investisseur",
  version: 1,
  label: "Investisseur (temp\xE9rature)",
  describe: "Bitcoin et Ethereum, \xE9ch\xE9ance modul\xE9e par la temp\xE9rature du march\xE9 ; une tranche all\xE9g\xE9e en euphorie.",
  defaults: { amountUsd: 25, daysOfWeek: [2, 5], btcPct: 75, trimPct: 7.5, trimMinDays: 30, multTable: "actuelle" },
  uses: ["cycle"],
  replayable: true,
  kind: "deposits",
  deposit: (ctx, p) => ctx.scheduled(p.daysOfWeek) ? p.amountUsd : 0,
  decide: (ctx, p) => {
    const t = ctx.temperature;
    const out = [];
    if (t != null && t >= 80) {
      const last2 = ctx.portfolio.lastFillOn("trim");
      if (last2 == null || daysBetween2(last2, ctx.execDay) >= p.trimMinDays) {
        for (const pos of ctx.portfolio.positions) {
          out.push({ coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: "sell", fraction: p.trimPct / 100, tag: "trim", reason: `Euphorie (${Math.round(t)}/100) : une tranche de ${fr(p.trimPct)} %` });
        }
      }
    }
    if (!ctx.scheduled(p.daysOfWeek)) return out;
    const mult = t == null ? 1 : temperatureMultiplier(t, TEMP_TABLES[p.multTable] ?? TEMP_TABLES.actuelle);
    const budget = Math.min(p.amountUsd * mult, ctx.portfolio.cashUsd);
    const reason = t == null ? "Temp\xE9rature indisponible : \xE9ch\xE9ance \xD71" : `Temp\xE9rature ${Math.round(t)}/100 : \xE9ch\xE9ance \xD7${fr(mult)}`;
    const btc = Math.round(budget * p.btcPct) / 100;
    out.push({ coinId: "bitcoin", symbol: "btc", name: "Bitcoin", side: "buy", sizing: { usd: btc }, reason, tag: "dca" });
    out.push({ coinId: "ethereum", symbol: "eth", name: "Ethereum", side: "buy", sizing: { usd: Math.round((budget - btc) * 100) / 100 }, reason, tag: "dca" });
    return out;
  }
};

// src/lib/lab/stats.ts
function median(xs) {
  return quantile(xs, 0.5);
}
function quantile(xs, q) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = Math.min(1, Math.max(0, q)) * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function bootstrapMeans(xs, draws, seed) {
  if (!xs.length) return [];
  const rnd = mulberry32(seed);
  const out = [];
  for (let d = 0; d < draws; d++) {
    let sum = 0;
    for (let i = 0; i < xs.length; i++) sum += xs[Math.floor(rnd() * xs.length)];
    out.push(sum / xs.length);
  }
  return out.sort((a, b) => a - b);
}

// src/lib/profile.ts
var ARCHETYPES = {
  Prudent: {
    target: { btc: 50, eth: 20, large: 10, mid: 0, small: 0, stable: 20 },
    rules: { maxPerGemPct: 1, maxPerAltPct: 5, cashReservePct: 20, riskPerTradePct: 0.5, maxLines: 8, minLinePct: 2, maxDiscoveryLines: 2 },
    pitch: "Tu veux surtout prot\xE9ger ton capital. C\u0153ur Bitcoin/Ethereum, DCA r\xE9gulier, tr\xE8s peu de paris sp\xE9culatifs."
  },
  \u00C9quilibr\u00E9: {
    target: { btc: 45, eth: 20, large: 15, mid: 5, small: 5, stable: 10 },
    rules: { maxPerGemPct: 2, maxPerAltPct: 8, cashReservePct: 10, riskPerTradePct: 1, maxLines: 12, minLinePct: 1, maxDiscoveryLines: 5 },
    pitch: "Croissance raisonnable : un socle solide BTC/ETH et une petite poche pour les opportunit\xE9s."
  },
  Dynamique: {
    target: { btc: 35, eth: 20, large: 20, mid: 10, small: 10, stable: 5 },
    rules: { maxPerGemPct: 3, maxPerAltPct: 10, cashReservePct: 5, riskPerTradePct: 1.5, maxLines: 15, minLinePct: 1, maxDiscoveryLines: 5 },
    pitch: "Tu acceptes une forte volatilit\xE9 pour viser plus haut. Les altcoins prennent une vraie place."
  },
  Audacieux: {
    target: { btc: 25, eth: 15, large: 20, mid: 15, small: 20, stable: 5 },
    rules: { maxPerGemPct: 5, maxPerAltPct: 15, cashReservePct: 5, riskPerTradePct: 2, maxLines: 20, minLinePct: 1, maxDiscoveryLines: 5 },
    pitch: "Chasseur de multiplicateurs. Tu dois \xEAtre pr\xEAt \xE0 voir -80 % sur une partie du portefeuille."
  },
  // Les règles de docs/STRATEGIE.md : un socle BTC/ETH à 85 %, une petite poche d'altcoins, DCA modulé, peu de lignes.
  "Ma strat\xE9gie": {
    target: { btc: 65, eth: 20, large: 6, mid: 4, small: 5, stable: 0 },
    rules: { maxPerGemPct: 3, maxPerAltPct: 5, cashReservePct: 5, riskPerTradePct: 1, maxLines: 12, minLinePct: 1, maxDiscoveryLines: 5 },
    pitch: "Ta strat\xE9gie : un socle Bitcoin/Ethereum \xE0 85 %, 15 % d\u2019altcoins au plus, un DCA modul\xE9 par la temp\xE9rature du march\xE9 et peu de lignes. Un exc\xE8s de Bitcoin se corrige en orientant le DCA, jamais en vendant."
  }
};
function rulesOf(p) {
  return { ...ARCHETYPES[p.archetype]?.rules, ...p.rules };
}

// src/lib/lab/strategies/dcaBoussole.ts
var pseudoRow = (u) => ({
  id: u.coinId,
  symbol: u.symbol,
  name: u.name,
  image: "",
  current_price: 0,
  market_cap: 0,
  market_cap_rank: u.rank,
  fully_diluted_valuation: null,
  total_volume: 0,
  high_24h: null,
  low_24h: null,
  price_change_percentage_24h: null,
  circulating_supply: null,
  total_supply: null,
  max_supply: null,
  ath: 0,
  ath_change_percentage: 0,
  ath_date: "",
  last_updated: ""
});
var dcaBoussole = {
  id: "dca-boussole",
  version: 1,
  label: "DCA Boussole",
  describe: "Le panier automatique de Boussole : jusqu\u2019\xE0 3 cryptos du top 20 et 3 d\xE9couvertes \xE0 chaque \xE9ch\xE9ance, montant modul\xE9 par la temp\xE9rature, r\xE9serve et r\xE8gles du panier.",
  defaults: { amountUsd: 25, daysOfWeek: [2, 5], basePct: 70, maxBaseLines: 3, maxDiscoveryLines: 3, discoverySource: "both", minOrderUsd: 5, baseMode: "top3", anchorPct: 70 },
  uses: ["signals", "cycle", "autoBasket"],
  replayable: false,
  kind: "deposits",
  deposit: (ctx, p) => ctx.scheduled(p.daysOfWeek) ? p.amountUsd : 0,
  decide: (ctx, p) => {
    if (!ctx.scheduled(p.daysOfWeek)) return [];
    const live = ctx.live;
    const markets2 = live?.markets ?? ctx.universe.map(pseudoRow);
    const scores = {};
    const change7d = {};
    const weights = {};
    for (const u of ctx.universe) {
      const cs = ctx.candles(u.coinId);
      if (!cs.length) continue;
      if (!live) weights[u.coinId] = median(cs.slice(-30).map((c) => c.volume));
      change7d[u.coinId] = cs.length > 7 ? (cs[cs.length - 1].close / cs[cs.length - 8].close - 1) * 100 : null;
      const a = cs.length >= 30 ? analyze(cs, { temperature: ctx.temperature ?? void 0, isBitcoin: u.coinId === "bitcoin" }, { closedOnly: true }) : null;
      if (a) scores[u.coinId] = a.investor.score;
    }
    const heldUsd = {};
    for (const pos of ctx.portfolio.positions) {
      const cs = ctx.candles(pos.coinId);
      heldUsd[pos.coinId] = pos.quantity * (cs[cs.length - 1]?.close ?? 0);
    }
    const baseIds = new Set(ctx.universe.map((u) => u.coinId));
    const known2 = ctx.universe.length > 0 && ctx.universe.every((u) => u.available != null);
    const plan = buildAutoBasketPlan({
      basket: {
        amountUsd: p.amountUsd,
        basePct: live ? p.basePct : 100,
        maxBaseLines: p.maxBaseLines,
        maxDiscoveryLines: p.maxDiscoveryLines,
        minOrderUsd: p.minOrderUsd,
        reserveUsd: Math.max(0, ctx.portfolio.cashUsd - p.amountUsd),
        discoverySource: p.discoverySource,
        baseMode: p.baseMode,
        anchorPct: p.anchorPct
      },
      weights: live ? void 0 : weights,
      markets: markets2,
      smallCaps: live?.smallCaps ?? null,
      scores,
      change7d,
      cdc: known2 ? Object.fromEntries(ctx.universe.map((u) => [u.coinId, u.available ? "app" : "unknown"])) : null,
      temperature: ctx.temperature,
      heldUsd,
      totalValueUsd: ctx.portfolio.equityUsd,
      rules: live?.rules ?? ARCHETYPES["Ma strat\xE9gie"].rules,
      linesOpen: ctx.portfolio.positions.length,
      discoveryLinesOpen: ctx.portfolio.positions.filter((x) => !baseIds.has(x.coinId)).length
    });
    return plan.orders.map((o) => ({ coinId: o.coinId, symbol: o.symbol, name: o.name, side: "buy", sizing: { usd: o.usd }, reason: o.reason, tag: "dca" }));
  }
};

// src/lib/lab/universe.ts
var dayOf = (timeSec) => new Date(timeSec * 1e3).toISOString().slice(0, 10);

// src/lib/lab/events.ts
var PLAN_TARGETS = [1.5, 2, 3];
var INV = ["Accumuler fort", "Accumuler", "Conserver", "All\xE9ger", "Prendre des profits"];
var INV_BIAS = ["bull", "bull", "neutral", "bear", "bear"];
var TR = ["Achat fort", "Achat", "Neutre", "Vente", "Vente forte"];
var SETUP_BIAS = { pullback: "bull", golden: "bull", breakout: "bull", squeeze: "neutral", oversold: "bull", macd: "bull", death: "bear", breakdown: "bear", overbought: "bear" };
var ZONES = [["capitulation", "Peur extr\xEAme", "bull"], ["accumulation", "Accumulation", "bull"], ["neutre", "Neutre", "neutral"], ["chaleur", "March\xE9 chaud", "bear"], ["euphorie", "Euphorie", "bear"]];
var SIGNAL_KEYS = [
  ...INV.map((l, i) => ({ key: `inv:${l}`, label: `Investisseur \xAB ${l} \xBB`, bias: INV_BIAS[i], horizon: 90, horizons: [30, 90, 180, 365] })),
  ...TR.map((l, i) => ({ key: `tr:${l}`, label: `Trader \xAB ${l} \xBB`, bias: INV_BIAS[i], horizon: 14, horizons: [7, 14, 30] })),
  ...Object.entries(SETUP_KEYS).map(([k, l]) => ({ key: `setup:${k}`, label: l, bias: SETUP_BIAS[k] ?? "neutral", horizon: 30, horizons: [7, 14, 30] })),
  ...ZONES.map(([k, l, b]) => ({ key: `temp:${k}`, label: `Temp\xE9rature : ${l} (Bitcoin)`, bias: b, horizon: 365, horizons: [90, 180, 365] })),
  ...TR.flatMap((l) => PLAN_TARGETS.map((r) => ({ key: `plan:${l}@${r}`, label: `Plan de trade, signal \xAB ${l} \xBB, objectif ${String(r).replace(".", ",")} R`, bias: "bull", horizon: 30, horizons: [30] })))
];

// src/lib/lab/strategies/trader.ts
function validatedBullSetups() {
  return SIGNAL_KEYS.filter((k) => k.key.startsWith("setup:") && k.bias === "bull").filter((k) => ["valid\xE9", "prometteur"].includes(reliabilityOf(k.key)?.verdict ?? "")).map((k) => k.key.slice("setup:".length));
}
var daysBetween3 = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
var signed2 = (x) => `${x > 0 ? "+" : ""}${x}`;
var trader = {
  id: "trader",
  version: 2,
  label: "Trader (setups avec stop)",
  describe: "Entre sur les seuls setups valid\xE9s par le banc d\u2019essai ; stop jug\xE9 \xE0 la cl\xF4ture, objectif \xE0 3 R (le plan le mieux mesur\xE9) ; risque 1 % par trade, 5 positions au plus, pause apr\xE8s \u221220 %.",
  defaults: { riskPct: 1, maxPositions: 5, maxPositionPct: 20, targetR: 3, maxHoldDays: 30, cooldownDays: 5, maxChasePct: 3, regime: false, pauseDrawdownPct: 20, onlyAvailable: true, setups: validatedBullSetups() },
  uses: ["signals"],
  replayable: true,
  kind: "trades",
  deposit: () => 0,
  decide: (ctx, p) => {
    const out = [];
    const pf = ctx.portfolio;
    const analysisOf = (coinId) => {
      const cs = ctx.candles(coinId);
      return cs.length >= 30 ? analyze(cs, { temperature: ctx.temperature ?? void 0, isBitcoin: coinId === "bitcoin" }, { closedOnly: true }) : null;
    };
    for (const pos of pf.positions) {
      const cs = ctx.candles(pos.coinId);
      if (pos.stopOnClose && pos.stop != null && cs.length && cs[cs.length - 1].close <= pos.stop) {
        out.push({ coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: "sell", fraction: 1, tag: "stop", reason: "Cl\xF4ture sous le stop : sortie" });
        continue;
      }
      if (daysBetween3(pos.openedOn, ctx.execDay) >= p.maxHoldDays) {
        out.push({ coinId: pos.coinId, symbol: pos.symbol, name: pos.name, side: "sell", fraction: 1, tag: "time-exit", reason: `Dur\xE9e maximale atteinte (${p.maxHoldDays} jours)` });
      }
    }
    const paused = pf.minSincePeakUsd <= pf.peakEquityUsd * (1 - p.pauseDrawdownPct / 100) && pf.equityUsd < pf.peakEquityUsd * (1 - p.pauseDrawdownPct / 200);
    if (paused || p.regime && ctx.btcAboveSma200 !== true || !p.setups.length) return out;
    const held = new Set(pf.positions.map((x) => x.coinId));
    let slots = p.maxPositions - pf.positions.length;
    let cash = pf.cashUsd;
    const candidates = ctx.universe.filter((u) => !held.has(u.coinId) && !(p.onlyAvailable && u.available === false)).filter((u) => {
      const last2 = pf.lastFillOn("stop", u.coinId);
      return last2 == null || daysBetween3(last2, ctx.execDay) >= p.cooldownDays;
    }).map((u) => ({ u, a: analysisOf(u.coinId) })).filter((x) => x.a && x.a.trader.tone === "up" && x.a.plan && x.a.setups.some((s) => p.setups.includes(s.key))).sort((x, y) => y.a.trader.score - x.a.trader.score || (x.u.rank ?? Infinity) - (y.u.rank ?? Infinity));
    for (const { u, a } of candidates) {
      if (slots <= 0 || cash < 1) break;
      const setup = a.setups.find((s) => p.setups.includes(s.key));
      const c = a.price;
      const stop = a.plan.stop;
      const maxUsd = Math.min(pf.equityUsd * (p.maxPositionPct / 100), cash);
      const riskUsd = pf.equityUsd * (p.riskPct / 100);
      out.push({
        coinId: u.coinId,
        symbol: u.symbol,
        name: u.name,
        side: "buy",
        sizing: { riskUsd, maxUsd },
        stop,
        targetR: p.targetR,
        stopOnClose: true,
        skipAbove: c * (1 + p.maxChasePct / 100),
        skipBelow: stop,
        tag: `setup:${setup.key}`,
        reason: `${SETUP_KEYS[setup.key] ?? setup.label} \xB7 signal trader \xAB ${a.trader.label} \xBB (${signed2(a.trader.score)})`
      });
      cash -= Math.min(maxUsd, riskUsd / Math.max(c - stop, 1e-9) * c);
      slots--;
    }
    return out;
  }
};

// src/lib/lab/strategies/index.ts
var STRATEGIES = {
  [dcaBtc.id]: dcaBtc,
  [investisseur.id]: investisseur,
  [dcaBoussole.id]: dcaBoussole,
  [trader.id]: trader
};
var COMPONENT_VERSION = { signals: SIGNALS_VERSION, cycle: CYCLE_VERSION, autoBasket: AUTO_BASKET_VERSION };
function rulesFingerprint(s) {
  return [`${s.id}@${s.version}`, ...s.uses.map((u) => `${u}${COMPONENT_VERSION[u]}`)].join("+");
}

// src/lib/lab/autopilot.ts
var HOUR = 36e5;
var dayOf2 = (c) => new Date(c.time * 1e3).toISOString().slice(0, 10);
var NO_DEVICE = "aucun appareil n\u2019a tourn\xE9 ce jour-l\xE0";
function needsArchive(p, strategies = STRATEGIES) {
  if (p.kind !== "auto") return false;
  const s = p.strategyId ? strategies[p.strategyId] : void 0;
  return !s || rulesFingerprint(s) !== p.rules;
}
var toPaperFill = (f) => ({
  coinId: f.coinId,
  symbol: f.symbol,
  name: f.name,
  side: f.side,
  kind: f.kind === "limit" ? "market" : f.kind,
  quantity: f.quantity,
  marketUsd: f.marketUsd,
  priceUsd: f.priceUsd,
  feeUsd: f.feeUsd,
  at: f.at,
  reason: f.reason,
  ...f.tag ? { tag: f.tag } : {},
  ...f.stop != null ? { stop: f.stop } : {},
  ...f.target != null ? { target: f.target } : {},
  ...f.stopOnClose ? { stopOnClose: true } : {}
});
async function tickAutopilot(p, logs, nowMs, src, device, strategies = STRATEGIES) {
  const strategy = p.strategyId ? strategies[p.strategyId] : void 0;
  if (p.kind !== "auto" || !strategy || p.paused || p.archived || needsArchive(p, strategies)) return { portfolio: p, changed: [], events: [] };
  const tz = p.timeZone ?? "Europe/Paris";
  const hour = p.executionHour ?? 8;
  const params = { ...strategy.defaults, ...p.params ?? {} };
  const costs = { feePct: p.costs.feePct, spreadPct: p.costs.spreadPct };
  const X = (day) => execInstant(day, hour, tz);
  const dayOfInstant = (ms) => {
    const d = localDay(ms, tz);
    return ms >= X(d) ? d : addDays(d, -1);
  };
  let portfolio = { ...p };
  const byDay = new Map(logs.filter((l) => l.portfolioId === p.id).map((l) => [l.day, l]));
  const changedDays = /* @__PURE__ */ new Set();
  const events = [];
  const logFor = (day) => byDay.get(day) ?? { id: `${p.id}:${day}`, portfolioId: p.id, day, decidedOn: addDays(day, -1), rules: p.rules ?? "", depositUsd: 0, fills: [], skipped: [], by: device };
  const save = (l) => {
    byDay.set(l.day, { ...l, by: device });
    changedDays.add(l.day);
  };
  const allLogs = () => [...byDay.values()];
  const dailyCache = /* @__PURE__ */ new Map();
  const daily = async (coinId) => {
    if (!dailyCache.has(coinId)) dailyCache.set(coinId, await src.daily(coinId));
    return dailyCache.get(coinId);
  };
  const upTo = (cs, day) => {
    let j = cs.length - 1;
    while (j >= 0 && dayOf2(cs[j]) > day) j--;
    return cs.slice(Math.max(0, j - 399), j + 1);
  };
  const closeOn = (cs, day) => {
    if (!cs) return null;
    const w = upTo(cs, day);
    return w.length ? w[w.length - 1].close : null;
  };
  const settle = async (fromMs, toMs) => {
    if (toMs <= fromMs) return;
    const st = autoState(portfolio, allLogs());
    const watched = Object.values(st.positions).filter((x) => x.stop != null || x.target != null);
    if (!watched.length) return;
    const bars = [];
    for (const pos of watched) for (const c of await src.hourly(pos.coinId, fromMs, toMs)) if (c.time * 1e3 >= fromMs && c.time * 1e3 + HOUR <= toMs) bars.push({ coinId: pos.coinId, c });
    bars.sort((a, b) => a.c.time - b.c.time || a.coinId.localeCompare(b.coinId));
    let book = { cashUsd: st.cashUsd, positions: st.positions };
    for (const { coinId, c } of bars) {
      const at = new Date(c.time * 1e3).toISOString();
      const r = settleBar(book, coinId, c, costs, at);
      if (!r.fill) continue;
      book = r.book;
      const day = dayOfInstant(c.time * 1e3);
      const l = logFor(day);
      const fill = toPaperFill(r.fill);
      save({ ...l, fills: [...l.fills, fill] });
      events.push({ kind: r.fill.kind === "target" ? "target" : "stop", day, fill });
    }
  };
  const cursor = effectiveCursor(p, logs) || localDay(nowMs, tz);
  let settledFrom = p.settledTo ? Date.parse(p.settledTo) : X(cursor);
  const today = localDay(nowMs, tz);
  const pending = [];
  for (let E = addDays(cursor, 1); E <= today && X(E) <= nowMs; E = addDays(E, 1)) pending.push(E);
  const scheduledOf = (E) => strategy.deposit({ execDay: E, scheduled: (dw) => dw.includes(((/* @__PURE__ */ new Date(`${E}T00:00:00Z`)).getUTCDay() + 6) % 7 + 1) }, params) > 0;
  const lastScheduled = strategy.replayable ? null : [...pending].reverse().find(scheduledOf) ?? null;
  for (const E of pending) {
    const xE = X(E);
    const D = decisionDay(xE);
    const scheduled = (dw) => dw.includes(((/* @__PURE__ */ new Date(`${E}T00:00:00Z`)).getUTCDay() + 6) % 7 + 1);
    await settle(settledFrom, xE);
    if (isoWeek(E) !== portfolio.universeWeek || !portfolio.universe) {
      const u = await src.universe();
      if (u.length) portfolio = { ...portfolio, universe: u.map((x) => ({ ...x })), universeWeek: isoWeek(E) };
    }
    const universe = (portfolio.universe ?? []).map((x) => ({ coinId: x.coinId, symbol: x.symbol, name: x.name, rank: x.rank, available: x.available ?? null }));
    const st0 = autoState(portfolio, allLogs());
    const coins = [.../* @__PURE__ */ new Set([...universe.map((u) => u.coinId), ...Object.keys(st0.positions), "bitcoin"])];
    for (const c of coins) await daily(c);
    const st = autoState(portfolio, allLogs(), (coinId, day) => closeOn(dailyCache.get(coinId), day));
    const btc = upTo(dailyCache.get("bitcoin") ?? [], D);
    const s200 = sma(btc.map((c) => c.close), 200);
    const btcAbove = btc.length && Number.isFinite(s200[s200.length - 1]) ? btc[btc.length - 1].close > s200[s200.length - 1] : null;
    const equity = st.cashUsd + Object.values(st.positions).reduce((sum, x) => sum + x.quantity * (closeOn(dailyCache.get(x.coinId), D) ?? 0), 0);
    let book = { cashUsd: st.cashUsd, positions: st.positions };
    const fills = [];
    const skipped = [];
    let lateDays;
    for (const pos of Object.values(st.positions)) {
      const cs = dailyCache.get(pos.coinId);
      const last2 = cs?.[cs.length - 1];
      if (last2 && dayOf2(last2) < D) {
        const r = delist(book, pos.coinId, last2.close, costs, new Date(xE).toISOString());
        book = r.book;
        if (r.fill) fills.push(toPaperFill(r.fill));
      }
    }
    const deposit = strategy.deposit({ execDay: E, scheduled }, params);
    book = { ...book, cashUsd: book.cashUsd + deposit };
    let intents = [];
    let execAt = xE;
    if (!strategy.replayable && E !== lastScheduled) {
      if (deposit > 0) skipped.push({ symbol: "\u2014", why: NO_DEVICE });
    } else {
      const live = strategy.replayable ? void 0 : await src.live();
      if (!strategy.replayable && !live) break;
      if (!strategy.replayable && E < today) {
        lateDays = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${E}T00:00:00Z`)) / 864e5);
        execAt = Math.floor(nowMs / HOUR) * HOUR - HOUR;
      }
      const ctx = {
        decidedOn: D,
        execDay: E,
        scheduled,
        universe,
        candles: (coinId) => upTo(dailyCache.get(coinId) ?? [], D),
        temperature: src.temperatureAt(D),
        btcAboveSma200: btcAbove,
        portfolio: {
          cashUsd: book.cashUsd,
          equityUsd: equity + deposit,
          peakEquityUsd: Math.max(st.peakEquityUsd, equity + deposit),
          minSincePeakUsd: Math.min(st.minSincePeakUsd, equity + deposit),
          positions: Object.values(book.positions),
          lastFillOn: (tag2, coinId) => st.lastFill[coinId ? `${tag2}|${coinId}` : tag2] ?? null
        },
        ...live ? { live } : {}
      };
      intents = strategy.decide(ctx, params);
    }
    let missing = false;
    const fillsBefore = fills.length;
    for (const intent of intents) {
      const bars = await src.hourly(intent.coinId, execAt, execAt + HOUR);
      const bar = bars.find((c) => c.time * 1e3 <= execAt && execAt < c.time * 1e3 + HOUR);
      if (!bar) {
        missing = true;
        break;
      }
      const r = applyIntent(book, intent, bar.open, costs, { at: new Date(execAt).toISOString(), day: E, minOrderUsd: 5 });
      if (r.skip) {
        skipped.push({ symbol: intent.symbol.toUpperCase(), why: r.skip });
        continue;
      }
      book = r.book;
      if (r.fill) fills.push(toPaperFill(r.fill));
    }
    if (missing) {
      fills.length = fillsBefore;
      break;
    }
    const prev = byDay.get(E);
    if (deposit > 0 || fills.length || skipped.length || prev) {
      const base = prev ?? logFor(E);
      save({ ...base, decidedOn: D, rules: p.rules ?? "", depositUsd: deposit, fills: [...prev?.fills.filter((f) => f.kind === "stop" || f.kind === "target") ?? [], ...fills], skipped, ...lateDays != null ? { lateDays } : {} });
      if (fills.length || skipped.length) events.push({ kind: "orders", day: E, fills, skipped, ...lateDays != null ? { lateDays } : {} });
    }
    portfolio = { ...portfolio, cursorDay: E };
    settledFrom = xE;
  }
  const lastClosed = Math.floor(nowMs / HOUR) * HOUR;
  await settle(settledFrom, lastClosed);
  if (lastClosed > settledFrom) settledFrom = lastClosed;
  portfolio = { ...portfolio, settledTo: new Date(settledFrom).toISOString() };
  const changed = [...changedDays].sort().map((d) => byDay.get(d));
  return { portfolio, changed, events };
}

// src/lib/lab/settle.ts
var HOUR2 = 36e5;
var ceilHour = (ms) => Math.ceil(ms / HOUR2) * HOUR2;
function settleOrders({ portfolio, orders, trades, hourly, nowMs }) {
  const costs = { feePct: portfolio.costs.feePct, spreadPct: portfolio.costs.spreadPct };
  const open = new Map(orders.filter((o) => o.portfolioId === portfolio.id && o.status === "open").map((o) => [o.id, { ...o }]));
  const known2 = new Set(trades.map((t) => t.id));
  const changed = /* @__PURE__ */ new Map();
  const newTrades = [];
  const allTrades = () => [...trades, ...newTrades];
  const coins = new Set([...open.values()].map((o) => o.coinId));
  const bars = [...hourly.entries()].filter(([c]) => coins.has(c)).flatMap(([coinId, cs]) => cs.filter((c) => c.time * 1e3 + HOUR2 <= nowMs).map((c) => ({ coinId, c }))).sort((a, b) => a.c.time - b.c.time || a.coinId.localeCompare(b.coinId));
  const close = (o, status, at) => {
    open.delete(o.id);
    changed.set(o.id, { ...o, status, ...at ? { filledAt: at } : {} });
  };
  for (const { coinId, c } of bars) {
    const startMs = c.time * 1e3;
    const at = new Date(startMs).toISOString();
    for (const o of [...open.values()].filter((x) => x.coinId === coinId).sort((a, b) => (a.type === "stop" ? -1 : b.type === "stop" ? 1 : 0) || a.id.localeCompare(b.id))) {
      if (!open.has(o.id) || startMs < ceilHour(Date.parse(o.createdAt))) continue;
      if (startMs >= Date.parse(o.expiresAt)) {
        close(o, "expired");
        continue;
      }
      const kind = o.side === "buy" ? "limitBuy" : o.type === "stop" ? "stop" : "target";
      const hit = pendingHit(kind, o.price, c);
      if (hit == null) continue;
      const id = `fill:${o.id}`;
      if (known2.has(id)) {
        close(o, "filled", at);
        continue;
      }
      const book = bookOf(portfolio, allTrades());
      let r;
      if (o.side === "buy") {
        r = applyIntent(book, { coinId, symbol: o.symbol, name: o.name, side: "buy", sizing: { usd: o.usd ?? (o.quantity ?? 0) * o.price }, reason: "Ordre limite" }, hit, costs, { at, day: at.slice(0, 10), minOrderUsd: 1 });
      } else {
        const held = book.positions[coinId]?.quantity ?? 0;
        if (!(held > 0)) {
          close(o, "cancelled");
          continue;
        }
        r = applyIntent(book, { coinId, symbol: o.symbol, name: o.name, side: "sell", fraction: o.quantity != null ? Math.min(1, o.quantity / held) : 1, reason: o.type === "stop" ? "Stop touch\xE9" : "Objectif atteint" }, hit, costs, { at, day: at.slice(0, 10), minOrderUsd: 0 });
      }
      if (!r.fill) {
        close(o, "cancelled");
        continue;
      }
      newTrades.push({
        id,
        coinId,
        symbol: o.symbol,
        name: o.name,
        date: at.slice(0, 10),
        time: at,
        type: o.side,
        quantity: r.fill.quantity,
        priceUsd: r.fill.priceUsd,
        feeUsd: r.fill.feeUsd,
        portfolioId: portfolio.id,
        orderType: o.type,
        orderId: o.id,
        marketUsd: hit,
        reason: r.fill.reason
      });
      known2.add(id);
      close(o, "filled", at);
      if (o.ocoGroup) {
        for (const x of [...open.values()]) if (x.ocoGroup === o.ocoGroup) close(x, "cancelled");
      }
      if (o.side === "buy" && (o.attachStop != null || o.attachTarget != null)) {
        const createdAt = new Date(startMs + HOUR2).toISOString();
        const expiresAt = new Date(startMs + HOUR2 + ORDER_LIFETIME_DAYS * 864e5).toISOString();
        const base = { portfolioId: portfolio.id, coinId, symbol: o.symbol, name: o.name, side: "sell", ocoGroup: id, createdAt, expiresAt, status: "open" };
        const attached = [];
        if (o.attachStop != null) attached.push({ ...base, id: `${o.id}:stop`, type: "stop", price: o.attachStop });
        if (o.attachTarget != null) attached.push({ ...base, id: `${o.id}:target`, type: "target", price: o.attachTarget });
        for (const a of attached) {
          open.set(a.id, a);
          changed.set(a.id, a);
        }
      }
    }
  }
  for (const o of [...open.values()]) if (Date.parse(o.expiresAt) <= nowMs) close(o, "expired");
  return { trades: newTrades, orders: [...changed.values()] };
}

// src/data/strategies-bench.json
var strategies_bench_default = {
  generatedAt: "2026-11-15",
  dataThrough: "2026-11-14",
  entries: {
    "dca-btc": {
      rules: "dca-btc@1",
      runs: [
        {
          fill: "nextOpen",
          costs: "exchange",
          twrPct: 1577.7087,
          twrPerYearPct: 43.0493,
          maxDrawdownPct: -76.6335,
          referenceTwrPct: 1577.7087,
          trades: 0,
          expectancyR: null,
          windows: {
            "30": {
              p10: -17.4621,
              p50: 2.37,
              p90: 31.002
            },
            "60": {
              p10: -23.73,
              p50: 5.5633,
              p90: 51.9429
            },
            "90": {
              p10: -26.3844,
              p50: 8.2162,
              p90: 68.4291
            },
            "180": {
              p10: -38.2733,
              p50: 18.1068,
              p90: 143.5906
            },
            "365": {
              p10: -43.2149,
              p50: 43.8363,
              p90: 281.0449
            }
          }
        },
        {
          fill: "nextOpen",
          costs: "app",
          twrPct: 1476.2391,
          twrPerYearPct: 41.9208,
          maxDrawdownPct: -76.6714,
          referenceTwrPct: 1476.2386,
          trades: 0,
          expectancyR: null,
          windows: {
            "30": {
              p10: -17.51,
              p50: 2.3609,
              p90: 30.911
            },
            "60": {
              p10: -23.7355,
              p50: 5.4802,
              p90: 51.6569
            },
            "90": {
              p10: -26.4124,
              p50: 7.9954,
              p90: 68.2972
            },
            "180": {
              p10: -38.3604,
              p50: 17.8632,
              p90: 143.0307
            },
            "365": {
              p10: -43.2378,
              p50: 43.4192,
              p90: 279.288
            }
          }
        },
        {
          fill: "nextClose",
          costs: "exchange",
          twrPct: 1542.9495,
          twrPerYearPct: 42.6696,
          maxDrawdownPct: -76.6136,
          referenceTwrPct: 1577.7087,
          trades: 0,
          expectancyR: null,
          windows: {
            "30": {
              p10: -17.4524,
              p50: 2.3694,
              p90: 30.762
            },
            "60": {
              p10: -23.7078,
              p50: 5.5615,
              p90: 51.6737
            },
            "90": {
              p10: -26.3424,
              p50: 8.1299,
              p90: 68.2575
            },
            "180": {
              p10: -38.2795,
              p50: 18.0146,
              p90: 143.4217
            },
            "365": {
              p10: -43.2093,
              p50: 43.6758,
              p90: 280.8679
            }
          }
        },
        {
          fill: "nextClose",
          costs: "app",
          twrPct: 1442.8957,
          twrPerYearPct: 41.5361,
          maxDrawdownPct: -76.6517,
          referenceTwrPct: 1476.2386,
          trades: 0,
          expectancyR: null,
          windows: {
            "30": {
              p10: -17.5033,
              p50: 2.3601,
              p90: 30.502
            },
            "60": {
              p10: -23.7346,
              p50: 5.453,
              p90: 51.4824
            },
            "90": {
              p10: -26.4046,
              p50: 7.9269,
              p90: 68.2207
            },
            "180": {
              p10: -38.3057,
              p50: 17.7475,
              p90: 142.9494
            },
            "365": {
              p10: -43.2323,
              p50: 43.2173,
              p90: 279.1818
            }
          }
        }
      ]
    },
    investisseur: {
      rules: "investisseur@1+cycle1",
      runs: [
        {
          fill: "nextOpen",
          costs: "exchange",
          twrPct: 1561.7947,
          twrPerYearPct: 42.8763,
          maxDrawdownPct: -65.3815,
          referenceTwrPct: 1577.7087,
          trades: 12,
          expectancyR: null,
          windows: {
            "30": {
              p10: -15.1035,
              p50: 2.3694,
              p90: 27.6153
            },
            "60": {
              p10: -20.5799,
              p50: 5.3938,
              p90: 44.2879
            },
            "90": {
              p10: -22.4044,
              p50: 7.4018,
              p90: 56.922
            },
            "180": {
              p10: -32.3171,
              p50: 16.6394,
              p90: 123.5907
            },
            "365": {
              p10: -35.0157,
              p50: 36.6084,
              p90: 337.8936
            }
          }
        },
        {
          fill: "nextOpen",
          costs: "app",
          twrPct: 1454.8113,
          twrPerYearPct: 41.6744,
          maxDrawdownPct: -65.567,
          referenceTwrPct: 1476.2386,
          trades: 12,
          expectancyR: null,
          windows: {
            "30": {
              p10: -15.1881,
              p50: 2.3672,
              p90: 27.5158
            },
            "60": {
              p10: -20.6257,
              p50: 5.2717,
              p90: 44.0964
            },
            "90": {
              p10: -22.5472,
              p50: 7.36,
              p90: 56.7978
            },
            "180": {
              p10: -32.4742,
              p50: 16.5476,
              p90: 122.5685
            },
            "365": {
              p10: -35.1582,
              p50: 35.5631,
              p90: 335.556
            }
          }
        },
        {
          fill: "nextClose",
          costs: "exchange",
          twrPct: 1547.4777,
          twrPerYearPct: 42.7195,
          maxDrawdownPct: -65.2029,
          referenceTwrPct: 1577.7087,
          trades: 12,
          expectancyR: null,
          windows: {
            "30": {
              p10: -15.0133,
              p50: 2.3644,
              p90: 27.2785
            },
            "60": {
              p10: -20.511,
              p50: 5.3922,
              p90: 44.0001
            },
            "90": {
              p10: -22.2757,
              p50: 7.6089,
              p90: 56.7471
            },
            "180": {
              p10: -32.2524,
              p50: 16.6492,
              p90: 123.4977
            },
            "365": {
              p10: -34.9504,
              p50: 36.6022,
              p90: 338.6621
            }
          }
        },
        {
          fill: "nextClose",
          costs: "app",
          twrPct: 1440.3132,
          twrPerYearPct: 41.506,
          maxDrawdownPct: -65.3899,
          referenceTwrPct: 1476.2386,
          trades: 12,
          expectancyR: null,
          windows: {
            "30": {
              p10: -15.0935,
              p50: 2.3569,
              p90: 27.2851
            },
            "60": {
              p10: -20.5575,
              p50: 5.2308,
              p90: 43.8014
            },
            "90": {
              p10: -22.4302,
              p50: 7.4058,
              p90: 56.6131
            },
            "180": {
              p10: -32.3539,
              p50: 16.526,
              p90: 122.525
            },
            "365": {
              p10: -35.0547,
              p50: 35.7287,
              p90: 336.5452
            }
          }
        }
      ]
    },
    "dca-boussole": {
      rules: "dca-boussole@1+signals2+cycle1+autoBasket1",
      runs: [
        {
          fill: "nextOpen",
          costs: "exchange",
          twrPct: 1095.324,
          twrPerYearPct: 37.0231,
          maxDrawdownPct: -77.6388,
          referenceTwrPct: 1577.7087,
          trades: 2,
          expectancyR: null,
          windows: {
            "30": {
              p10: -19.6735,
              p50: 1.7893,
              p90: 33.3182
            },
            "60": {
              p10: -26.0946,
              p50: 4.1581,
              p90: 56.921
            },
            "90": {
              p10: -28.4503,
              p50: 3.1996,
              p90: 71.493
            },
            "180": {
              p10: -39.0704,
              p50: 9.0078,
              p90: 117.856
            },
            "365": {
              p10: -45.0088,
              p50: 20.1794,
              p90: 536.8646
            }
          }
        },
        {
          fill: "nextOpen",
          costs: "app",
          twrPct: 1020.8393,
          twrPerYearPct: 35.9084,
          maxDrawdownPct: -77.6739,
          referenceTwrPct: 1476.2386,
          trades: 2,
          expectancyR: null,
          windows: {
            "30": {
              p10: -19.7719,
              p50: 1.7538,
              p90: 33.1933
            },
            "60": {
              p10: -26.1493,
              p50: 4.1212,
              p90: 56.5786
            },
            "90": {
              p10: -28.4819,
              p50: 3.1821,
              p90: 70.9723
            },
            "180": {
              p10: -39.2264,
              p50: 8.7309,
              p90: 117.1653
            },
            "365": {
              p10: -45.4571,
              p50: 19.9194,
              p90: 534.2384
            }
          }
        },
        {
          fill: "nextClose",
          costs: "exchange",
          twrPct: 1042.7087,
          twrPerYearPct: 36.2423,
          maxDrawdownPct: -77.5869,
          referenceTwrPct: 1577.7087,
          trades: 2,
          expectancyR: null,
          windows: {
            "30": {
              p10: -19.638,
              p50: 1.7886,
              p90: 33.0107
            },
            "60": {
              p10: -25.9971,
              p50: 4.1299,
              p90: 56.5795
            },
            "90": {
              p10: -28.4298,
              p50: 3.2327,
              p90: 71.0456
            },
            "180": {
              p10: -39.0616,
              p50: 8.9968,
              p90: 117.393
            },
            "365": {
              p10: -45.1072,
              p50: 20.1055,
              p90: 535.054
            }
          }
        },
        {
          fill: "nextClose",
          costs: "app",
          twrPct: 970.6784,
          twrPerYearPct: 35.1207,
          maxDrawdownPct: -77.6224,
          referenceTwrPct: 1476.2386,
          trades: 2,
          expectancyR: null,
          windows: {
            "30": {
              p10: -19.713,
              p50: 1.7486,
              p90: 32.919
            },
            "60": {
              p10: -26.0644,
              p50: 4.1189,
              p90: 56.2873
            },
            "90": {
              p10: -28.5657,
              p50: 3.1816,
              p90: 70.2969
            },
            "180": {
              p10: -39.2085,
              p50: 8.7812,
              p90: 117.0712
            },
            "365": {
              p10: -45.5119,
              p50: 19.8183,
              p90: 531.2529
            }
          }
        }
      ]
    },
    trader: {
      rules: "trader@2+signals2",
      runs: [
        {
          fill: "nextOpen",
          costs: "exchange",
          twrPct: 14.7679,
          twrPerYearPct: 1.7641,
          maxDrawdownPct: -21.1173,
          referenceTwrPct: 1589.4294,
          trades: 68,
          expectancyR: 0.257,
          windows: {
            "30": {
              p10: 0,
              p50: 0,
              p90: 0
            },
            "60": {
              p10: 0,
              p50: 0,
              p90: 0
            },
            "90": {
              p10: 0,
              p50: 0,
              p90: 0
            },
            "180": {
              p10: 0,
              p50: 0,
              p90: 0
            },
            "365": {
              p10: -1.6629,
              p50: 0,
              p90: 0
            }
          }
        },
        {
          fill: "nextOpen",
          costs: "app",
          twrPct: 5.4503,
          twrPerYearPct: 0.676,
          maxDrawdownPct: -21.2986,
          referenceTwrPct: 1589.4294,
          trades: 62,
          expectancyR: 0.1312,
          windows: {
            "30": {
              p10: 0,
              p50: 0,
              p90: 0
            },
            "60": {
              p10: 0,
              p50: 0,
              p90: 0
            },
            "90": {
              p10: 0,
              p50: 0,
              p90: 0
            },
            "180": {
              p10: 0,
              p50: 0,
              p90: 0
            },
            "365": {
              p10: -2.8459,
              p50: 0,
              p90: 0
            }
          }
        },
        {
          fill: "nextClose",
          costs: "exchange",
          twrPct: 8.5327,
          twrPerYearPct: 1.045,
          maxDrawdownPct: -20.3492,
          referenceTwrPct: 1589.4294,
          trades: 51,
          expectancyR: 0.4139,
          windows: {
            "30": {
              p10: 0,
              p50: 0,
              p90: 0
            },
            "60": {
              p10: 0,
              p50: 0,
              p90: 0
            },
            "90": {
              p10: 0,
              p50: 0,
              p90: 0
            },
            "180": {
              p10: 0,
              p50: 0,
              p90: 0
            },
            "365": {
              p10: 0,
              p50: 0,
              p90: 0
            }
          }
        },
        {
          fill: "nextClose",
          costs: "app",
          twrPct: 3.1846,
          twrPerYearPct: 0.3988,
          maxDrawdownPct: -23.1198,
          referenceTwrPct: 1589.4294,
          trades: 51,
          expectancyR: 0.1794,
          windows: {
            "30": {
              p10: 0,
              p50: 0,
              p90: 0
            },
            "60": {
              p10: 0,
              p50: 0,
              p90: 0
            },
            "90": {
              p10: 0,
              p50: 0,
              p90: 0
            },
            "180": {
              p10: 0,
              p50: 0,
              p90: 0
            },
            "365": {
              p10: 0,
              p50: 0,
              p90: 0
            }
          }
        }
      ]
    }
  }
};

// src/lib/lab/autoView.ts
var addDay = (d) => new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
function autoEquitySeries(p, logs, closes, from, to) {
  const sorted = logs.filter((l) => l.portfolioId === p.id).sort((a, b) => a.day.localeCompare(b.day));
  let cash = p.startingUsd;
  const qty = /* @__PURE__ */ new Map();
  const last2 = /* @__PURE__ */ new Map();
  let k = 0;
  const out = [];
  for (let day = sorted.length && sorted[0].day < from ? sorted[0].day : from; day <= to; day = addDay(day)) {
    let flow = 0;
    while (k < sorted.length && sorted[k].day <= day) {
      const l = sorted[k++];
      cash += l.depositUsd;
      flow += l.depositUsd;
      for (const f of l.fills) {
        last2.set(f.coinId, f.marketUsd);
        if (f.side === "buy") {
          cash -= f.quantity * f.priceUsd + f.feeUsd;
          qty.set(f.coinId, (qty.get(f.coinId) ?? 0) + f.quantity);
        } else {
          cash += f.quantity * f.priceUsd - f.feeUsd;
          qty.set(f.coinId, Math.max(0, (qty.get(f.coinId) ?? 0) - f.quantity));
        }
      }
    }
    let value = cash;
    for (const [coinId, q] of qty) {
      const c = closes.get(coinId)?.get(day);
      if (c != null) last2.set(coinId, c);
      value += q * (last2.get(coinId) ?? 0);
    }
    if (day >= from) out.push({ day, valueUsd: Math.round(value * 1e8) / 1e8, cashUsd: cash, flowUsd: flow });
  }
  return out;
}
function dcaReferenceFromCloses(flows, btc, costs) {
  const byDay = /* @__PURE__ */ new Map();
  for (const f of flows) byDay.set(f.day, (byDay.get(f.day) ?? 0) + f.usd);
  const days = [...btc.keys()].sort().filter((d) => d >= ([...byDay.keys()].sort()[0] ?? "9999"));
  let qty = 0;
  let last2 = 0;
  return days.map((day) => {
    const px = btc.get(day) ?? last2;
    last2 = px;
    const usd = byDay.get(day) ?? 0;
    if (usd > 0 && px > 0) qty += usd * (1 - costs.feePct / 100) / (px * (1 + costs.spreadPct / 100));
    return { day, valueUsd: Math.round(qty * px * 1e8) / 1e8, cashUsd: 0, flowUsd: usd };
  });
}
function logsToFills(logs) {
  return [...logs].sort((a, b) => a.day.localeCompare(b.day)).flatMap((l) => l.fills.map((f) => ({ ...f })));
}
function benchP10(strategyId, days) {
  const run = strategies_bench_default.entries[strategyId]?.runs.find((r) => r.fill === "nextOpen" && r.costs === "exchange");
  if (!run) return null;
  const L = [365, 180, 90, 60, 30].find((x) => x <= days && run.windows[String(x)]);
  return L ? run.windows[String(L)].p10 : null;
}

// src/lib/lab/metrics.ts
function twr(series) {
  let idx = 1;
  for (let t = 1; t < series.length; t++) {
    const base = series[t - 1].valueUsd + series[t].flowUsd;
    if (base > 0) idx *= series[t].valueUsd / base;
  }
  return idx - 1;
}
function twrIndex(series) {
  const out = [1];
  for (let t = 1; t < series.length; t++) {
    const base = series[t - 1].valueUsd + series[t].flowUsd;
    out.push(out[t - 1] * (base > 0 ? series[t].valueUsd / base : 1));
  }
  return out;
}
function maxDrawdownPct(series) {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of twrIndex(series)) {
    peak = Math.max(peak, v);
    mdd = Math.min(mdd, v / peak - 1);
  }
  return mdd * 100;
}
function closedTrades(fills) {
  const lots = /* @__PURE__ */ new Map();
  const out = [];
  for (const f of fills) {
    const list3 = lots.get(f.coinId) ?? [];
    lots.set(f.coinId, list3);
    if (f.side === "buy") {
      if (!(f.quantity > 0)) continue;
      list3.push({ qty: f.quantity, costPerUnit: (f.quantity * f.priceUsd + f.feeUsd) / f.quantity, at: f.at, riskPerUnit: f.stop != null ? f.priceUsd - f.stop : null, feePerUnit: f.feeUsd / f.quantity });
      continue;
    }
    let left = f.quantity;
    let cost = 0;
    let risk = 0;
    let fees = f.feeUsd;
    let openedAt = "";
    while (left > 1e-12 && list3.length) {
      const lot = list3[0];
      const q = Math.min(lot.qty, left);
      if (!openedAt) openedAt = lot.at;
      cost += q * lot.costPerUnit;
      fees += q * lot.feePerUnit;
      risk = risk == null || lot.riskPerUnit == null || !(lot.riskPerUnit > 0) ? null : risk + q * lot.riskPerUnit;
      lot.qty -= q;
      left -= q;
      if (lot.qty <= 1e-12) list3.shift();
    }
    if (!openedAt) continue;
    const proceeds = (f.quantity - left) * f.priceUsd - f.feeUsd;
    const pnl = proceeds - cost;
    out.push({ coinId: f.coinId, openedAt, closedAt: f.at, costUsd: cost, proceedsUsd: proceeds, pnlUsd: pnl, pnlPct: cost > 0 ? pnl / cost * 100 : 0, r: risk != null && risk > 0 ? pnl / risk : null, feesUsd: fees });
  }
  return out;
}
function tradeStatsOf(trades) {
  const wins = trades.filter((t) => t.pnlUsd > 0);
  const losses = trades.filter((t) => t.pnlUsd <= 0);
  const mean = (xs) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
  const rs = trades.map((t) => t.r).filter((r) => r != null);
  const lossSum = -losses.reduce((s, t) => s + t.pnlUsd, 0);
  let streak = 0;
  let maxLosingStreak = 0;
  for (const t of trades) {
    streak = t.pnlUsd <= 0 ? streak + 1 : 0;
    maxLosingStreak = Math.max(maxLosingStreak, streak);
  }
  return {
    n: trades.length,
    winRatePct: trades.length ? wins.length / trades.length * 100 : 0,
    avgWinPct: mean(wins.map((t) => t.pnlPct)),
    avgLossPct: mean(losses.map((t) => t.pnlPct)),
    expectancyPct: mean(trades.map((t) => t.pnlPct)),
    expectancyR: rs.length ? mean(rs) : null,
    profitFactor: lossSum > 0 ? wins.reduce((s, t) => s + t.pnlUsd, 0) / lossSum : null,
    maxLosingStreak,
    feesUsd: trades.reduce((s, t) => s + t.feesUsd, 0)
  };
}

// src/lib/lab/trust.ts
var DEFAULT_TRUST_RULES = { minDays: 90, minTrades: 30, minDeposits: 20, maxDrawdownPct: 25, maxExtraDrawdownPts: 5, bootstrapDraws: 2e3, minWindowWinPct: 60, withdrawGapPts: 10, copyPct: 5, copyPctTrusted: 15 };
var pct1 = (x) => `${x > 0 ? "+" : ""}${x.toFixed(1).replace(".", ",")} %`;
var r2 = (x) => `${x > 0 ? "+" : ""}${x.toFixed(2).replace(".", ",")} R`;
var dm = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
function alignedIndexes(a, b) {
  const bd = new Map(b.map((p, i) => [p.day, i]));
  const ia = [];
  const ib = [];
  let va = 1;
  let vb = 1;
  let prevA = null;
  let prevB = null;
  for (const p of a) {
    const j = bd.get(p.day);
    if (j == null) continue;
    const q = b[j];
    if (prevA && prevB) {
      const baseA = prevA.valueUsd + p.flowUsd;
      const baseB = prevB.valueUsd + q.flowUsd;
      if (baseA > 0) va *= p.valueUsd / baseA;
      if (baseB > 0) vb *= q.valueUsd / baseB;
    }
    ia.push(va);
    ib.push(vb);
    prevA = p;
    prevB = q;
  }
  return [ia, ib];
}
function recentGapPts(live, ref, days = 60) {
  if (!ref || live.length < days) return null;
  const [a, b] = alignedIndexes(live.slice(-days - 1), ref);
  if (a.length < 2) return null;
  return (a[a.length - 1] / a[0] - b[b.length - 1] / b[0]) * 100;
}
function trustVerdict(i, rules = DEFAULT_TRUST_RULES) {
  const days = i.live.length;
  const perf = twr(i.live) * 100;
  const mdd = maxDrawdownPct(i.live);
  const criteria = [];
  const c1 = days >= rules.minDays;
  criteria.push({ id: "C1", ok: c1, text: `Dur\xE9e en direct : ${days} jour${days > 1 ? "s" : ""} sur ${rules.minDays}` });
  let c2;
  let c3;
  let c4;
  let c5;
  let sampleText;
  if (i.kind === "trades") {
    const closed = closedTrades(i.fills);
    const st = tradeStatsOf(closed);
    const rs = closed.map((t) => t.r).filter((r) => r != null);
    const values = rs.length === closed.length && rs.length ? rs : closed.map((t) => t.pnlPct);
    const exp = rs.length === closed.length && rs.length ? st.expectancyR ?? 0 : st.expectancyPct;
    c2 = closed.length >= rules.minTrades;
    sampleText = `${closed.length} trades sur ${rules.minTrades}`;
    criteria.push({ id: "C2", ok: c2, text: `Trades clos : ${closed.length} sur ${rules.minTrades}` });
    c3 = perf > 0 && exp > 0;
    criteria.push({ id: "C3", ok: c3, text: `Performance ${pct1(perf)}, esp\xE9rance ${rs.length === closed.length && rs.length ? r2(exp) : pct1(exp)} par trade` });
    c4 = mdd >= -rules.maxDrawdownPct;
    criteria.push({ id: "C4", ok: c4, text: `Baisse maximale ${pct1(mdd)} (limite \u2212${rules.maxDrawdownPct} %)` });
    const p5 = values.length >= 2 ? quantile(bootstrapMeans(values, rules.bootstrapDraws, hashSeed(i.seed)), 0.05) : NaN;
    c5 = Number.isFinite(p5) && p5 > 0;
    criteria.push({ id: "C5", ok: values.length >= 2 ? c5 : null, text: c5 ? "Esp\xE9rance positive m\xEAme dans le pire des cas plausibles (bootstrap)" : "Esp\xE9rance : marge d\u2019erreur trop large pour conclure" });
  } else {
    const deposits = i.live.filter((p) => p.flowUsd > 0).length;
    c2 = deposits >= rules.minDeposits;
    sampleText = `${deposits} \xE9ch\xE9ances sur ${rules.minDeposits}`;
    criteria.push({ id: "C2", ok: c2, text: `\xC9ch\xE9ances : ${deposits} sur ${rules.minDeposits}` });
    const refPerf = i.reference ? twr(i.reference) * 100 : null;
    c3 = refPerf != null && perf > refPerf;
    criteria.push({ id: "C3", ok: refPerf == null ? null : c3, text: refPerf == null ? "R\xE9f\xE9rence indisponible" : `Performance ${pct1(perf)} contre ${pct1(refPerf)} pour le DCA Bitcoin simple` });
    const refDd = i.reference ? maxDrawdownPct(i.reference) : null;
    c4 = refDd != null && mdd >= refDd - rules.maxExtraDrawdownPts;
    criteria.push({ id: "C4", ok: refDd == null ? null : c4, text: `Baisse maximale ${pct1(mdd)}${refDd != null ? ` (r\xE9f\xE9rence ${pct1(refDd)}, marge ${rules.maxExtraDrawdownPts} points)` : ""}` });
    let wins = 0;
    let windows = 0;
    if (i.reference) {
      const [a, b] = alignedIndexes(i.live, i.reference);
      for (let s = 0; s + 30 < a.length; s++) {
        windows++;
        if (a[s + 30] / a[s] > b[s + 30] / b[s]) wins++;
      }
    }
    c5 = windows > 0 && wins / windows * 100 >= rules.minWindowWinPct;
    criteria.push({ id: "C5", ok: windows > 0 ? c5 : null, text: windows ? `Bat la r\xE9f\xE9rence sur ${Math.round(wins / windows * 100)} % des p\xE9riodes de 30 jours (seuil ${rules.minWindowWinPct} %)` : "Pas encore de p\xE9riode de 30 jours" });
  }
  const c6 = i.bench ? perf >= i.bench.p10 : null;
  criteria.push({ id: "C6", ok: c6, text: i.bench ? `Conforme \xE0 l\u2019historique : ${pct1(perf)} pour un 10\u1D49 centile \xE0 ${pct1(i.bench.p10)}` : "Pas de r\xE9f\xE9rence historique pour cette dur\xE9e" });
  const wasTrusted = i.previous && (i.previous.level === "encourageant" || i.previous.level === "fiable" || i.previous.level === "retir\xE9e");
  const gap = recentGapPts(i.live, i.reference);
  const ddBreached = i.kind === "trades" ? !c4 : i.reference ? !c4 : false;
  if (wasTrusted && (ddBreached || gap != null && gap <= -rules.withdrawGapPts)) {
    const on2 = i.previous?.level === "retir\xE9e" && i.previous.withdrawnOn ? i.previous.withdrawnOn : i.today ?? i.live[i.live.length - 1]?.day ?? "";
    const why = ddBreached ? "baisse maximale d\xE9pass\xE9e" : `${Math.round(-gap)} points de retard sur la r\xE9f\xE9rence en 60 jours`;
    return { level: "retir\xE9e", headline: `Confiance retir\xE9e le ${dm(on2)} : ${why}.`, criteria, copyPct: null, withdrawnOn: on2 };
  }
  if (!c1 || !c2) return { level: "observation", headline: `En observation : jour ${days} sur ${rules.minDays}, ${sampleText}. Ne copie pas encore.`, criteria, copyPct: null };
  if (!c3 || !c4) return { level: "insuffisant", headline: `Ne fait pas mieux que ${i.kind === "trades" ? "de rester en cash" : "le DCA Bitcoin simple"}. \xC0 ne pas copier.`, criteria, copyPct: null };
  if (!c5 || c6 !== true) return { level: "encourageant", headline: "R\xE9sultats positifs, mais ce peut encore \xEAtre de la chance.", criteria, copyPct: rules.copyPct };
  return { level: "fiable", headline: "Fiable jusqu\u2019ici. Le verdict se recalcule chaque jour.", criteria, copyPct: rules.copyPctTrusted };
}

// src/runner/autopilot.ts
var LEVEL = { observation: "en observation", insuffisant: "insuffisant", encourageant: "encourageant", fiable: "fiable jusqu\u2019ici", "retir\xE9e": "confiance retir\xE9e" };
var fr2 = (x, d = 2) => x.toFixed(d).replace(".", ",").replace(/,00$/, "");
var pct3 = (x) => `${x >= 0 ? "+" : ""}${x.toFixed(1).replace(".", ",")} %`;
var dm2 = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
var list2 = (b, k) => Array.isArray(b.data[k]) ? b.data[k] : [];
function fillLine(f) {
  const head = `${f.side === "buy" ? "ACHAT" : "VENTE"} ${f.symbol.toUpperCase()} : ${f.side === "buy" ? `${fr2(f.quantity * f.priceUsd + f.feeUsd)} USDC` : "toute la position"} \xE0 \u2248 ${fmtPrice(f.marketUsd, "USD")} \u2014 ${f.reason}`;
  const legs = [f.stop != null ? `stop ${fmtPrice(f.stop, "USD")} (${pct3((f.stop / f.marketUsd - 1) * 100)})` : "", f.target != null ? `objectif ${fmtPrice(f.target, "USD")} (${pct3((f.target / f.marketUsd - 1) * 100)})` : ""].filter(Boolean);
  return legs.length ? `${head}
  ${legs.join(", ")}` : head;
}
async function summary(p, logs, src, today) {
  const s = p.strategyId ? STRATEGIES[p.strategyId] : void 0;
  if (!s) return { value: null, perf: null, verdict: null };
  const coins = [.../* @__PURE__ */ new Set(["bitcoin", ...logs.flatMap((l) => l.fills.map((f) => f.coinId))])];
  const closes = /* @__PURE__ */ new Map();
  for (const c of coins) closes.set(c, new Map((await src.daily(c)).map((k) => [new Date(k.time * 1e3).toISOString().slice(0, 10), k.close])));
  const from = p.liveSince ?? p.createdAt.slice(0, 10);
  if (from > today) return { value: null, perf: null, verdict: null };
  const series = autoEquitySeries(p, logs, closes, from, today);
  const btc = closes.get("bitcoin");
  const reference = btc && s.kind === "deposits" ? dcaReferenceFromCloses(series.filter((x) => x.flowUsd > 0).map((x) => ({ day: x.day, usd: x.flowUsd })), btc, p.costs) : null;
  const p10 = benchP10(s.id, series.length);
  const verdict = s.id === "dca-btc" ? null : trustVerdict({ kind: s.kind, seed: p.id, live: series, fills: logsToFills(logs), reference, bench: p10 != null ? { p10 } : null, today });
  return { value: series[series.length - 1]?.valueUsd ?? null, perf: series.length > 1 ? twr(series) * 100 : null, verdict };
}
async function runAutopilots(bundle, src, nowMs, device) {
  const now = new Date(nowMs).toISOString();
  const today = now.slice(0, 10);
  let portfolios = list2(bundle, "paperPortfolios");
  let days = list2(bundle, "paperDays");
  let trades = list2(bundle, "paperTrades");
  let orders = list2(bundle, "paperOrders");
  let changed = 0;
  const events = [];
  const briefLines = [];
  for (const p of portfolios.filter((x) => x.kind === "auto" && !x.archived && !x.paused)) {
    if (needsArchive(p)) continue;
    const mine = days.filter((l) => l.portfolioId === p.id);
    const r = await tickAutopilot(p, mine, nowMs, src, device);
    const merged = mergeDayLogs(days, r.changed.map((l) => ({ ...l, updatedAt: now })));
    if (merged.changed.length) {
      days = merged.days;
      changed += merged.changed.length;
    }
    if (r.portfolio.cursorDay !== p.cursorDay || r.portfolio.settledTo !== p.settledTo || r.portfolio.universeWeek !== p.universeWeek) {
      portfolios = portfolios.map((x) => x.id === p.id ? { ...r.portfolio, updatedAt: now } : x);
      changed++;
    }
    const sum = await summary(r.portfolio, days.filter((l) => l.portfolioId === p.id), src, today);
    const confidence = sum.verdict ? `Confiance : ${sum.verdict.headline}` : "Portefeuille de r\xE9f\xE9rence.";
    for (const e of r.events) {
      if (e.kind === "orders") {
        const lines = [`Autopilote \xAB ${p.name} \xBB \u2014 ordres du ${dm2(e.day)} (papier)${e.lateDays ? `, ex\xE9cut\xE9s avec ${e.lateDays} jour${e.lateDays > 1 ? "s" : ""} de retard` : ""}`, ...e.fills.map(fillLine), ...e.skipped.filter((x) => x.symbol !== "\u2014").map((x) => `${x.symbol} \xE9cart\xE9e : ${x.why}`), confidence];
        if (e.fills.length) events.push({ key: `auto:${p.id}:${e.day}`, text: lines.join("\n") });
      } else {
        events.push({ key: `auto:${p.id}:${e.fill.at}`, text: `Autopilote \xAB ${p.name} \xBB : ${e.kind === "stop" ? "stop touch\xE9" : "objectif atteint"} sur ${e.fill.symbol.toUpperCase()} \xE0 ${fmtPrice(e.fill.marketUsd, "USD")} (papier).` });
      }
    }
    briefLines.push(`${p.name} : ${sum.value != null ? `${fr2(sum.value)} USDC` : "d\xE9marre bient\xF4t"}${sum.perf != null ? ` (${pct3(sum.perf)})` : ""} \u2014 ${sum.verdict ? LEVEL[sum.verdict.level] : "r\xE9f\xE9rence"}`);
  }
  const open = orders.filter((o) => o.status === "open");
  if (open.length) {
    const hourly = /* @__PURE__ */ new Map();
    for (const coinId of [...new Set(open.map((o) => o.coinId))]) {
      const from = Math.min(...open.filter((o) => o.coinId === coinId).map((o) => Date.parse(o.createdAt)));
      hourly.set(coinId, await src.hourly(coinId, from, nowMs));
    }
    for (const p of portfolios.filter((x) => x.kind === "manual" && !x.archived)) {
      const r = settleOrders({ portfolio: p, orders, trades: trades.filter((t) => t.portfolioId === p.id), hourly, nowMs });
      if (!r.trades.length && !r.orders.length) continue;
      const known2 = new Set(trades.map((t) => t.id));
      const fresh = r.trades.filter((t) => !known2.has(t.id)).map((t) => ({ ...t, updatedAt: now }));
      trades = [...fresh, ...trades];
      const upd = new Map(r.orders.map((o) => [o.id, { ...o, updatedAt: now }]));
      orders = [...orders.filter((o) => !upd.has(o.id)), ...upd.values()];
      changed += fresh.length + upd.size;
      for (const t of fresh) events.push({ key: `paper:${t.id}`, text: `Papier \xAB ${p.name} \xBB : ordre ${t.orderType === "stop" ? "stop" : t.orderType === "target" ? "objectif" : "limite"} ex\xE9cut\xE9 \u2014 ${t.type === "buy" ? "achat" : "vente"} de ${t.symbol.toUpperCase()} \xE0 ${fmtPrice(t.marketUsd ?? t.priceUsd, "USD")}.` });
    }
  }
  return { bundle: changed ? { ...bundle, data: { ...bundle.data, paperPortfolios: portfolios, paperDays: days, paperTrades: trades, paperOrders: orders } } : bundle, changed, events, briefLines };
}

// src/api/binance.ts
var BASE = "https://data-api.binance.vision/api/v3";
function toCandle(k) {
  return { time: Math.floor(k[0] / 1e3), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[7], ...k[10] != null ? { takerBuyQuote: +k[10] } : {} };
}
var klineCache = /* @__PURE__ */ new Map();
var KLINE_TTL = { "1h": 2 * 6e4, "4h": 5 * 6e4, "1d": 10 * 6e4, "1w": 30 * 6e4 };
async function getKlines(symbol, interval = "1d", limit = 500, startTime) {
  const key = `${symbol}|${interval}|${startTime ?? ""}`;
  const hit = klineCache.get(key);
  if (hit && Date.now() - hit.at < KLINE_TTL[interval]) {
    const cached2 = await hit.data;
    if (cached2.length >= Math.min(limit, 1e3) || startTime) return cached2.slice(-limit);
  }
  const u = new URL(`${BASE}/klines`);
  u.searchParams.set("symbol", symbol);
  u.searchParams.set("interval", interval);
  u.searchParams.set("limit", String(Math.min(limit, 1e3)));
  if (startTime) u.searchParams.set("startTime", String(startTime));
  const data = getJson2(u.toString(), { timeoutMs: 2e4 }).then((raw) => raw.map(toCandle));
  klineCache.set(key, { at: Date.now(), data });
  try {
    return await data;
  } catch (e) {
    klineCache.delete(key);
    throw e;
  }
}
async function getDailyHistory(symbol, startMs) {
  const out = [];
  let cursor = startMs;
  for (let i = 0; i < 12; i++) {
    const chunk = await getKlines(symbol, "1d", 1e3, cursor);
    if (!chunk.length) break;
    out.push(...chunk);
    if (chunk.length < 1e3) break;
    cursor = (chunk[chunk.length - 1].time + 86400) * 1e3;
  }
  return out;
}
var priceCache = null;
async function getAllPrices() {
  if (priceCache && Date.now() - priceCache.at < 5 * 6e4) return priceCache.map;
  const raw = await getJson2(`${BASE}/ticker/price`, { timeoutMs: 2e4 });
  const map = /* @__PURE__ */ new Map();
  for (const r of raw) map.set(r.symbol, +r.price);
  priceCache = { at: Date.now(), map };
  return map;
}
var SYMBOL_OVERRIDES = {
  "binance-peg-ethereum": "ETHUSDT"
};
function binanceSymbolFor(coin, prices) {
  const sym = SYMBOL_OVERRIDES[coin.id] ?? `${coin.symbol.toUpperCase()}USDT`;
  const p = prices.get(sym);
  if (!p || !coin.priceUsd) return null;
  const diff = Math.abs(p - coin.priceUsd) / coin.priceUsd;
  return diff < 0.05 ? sym : null;
}

// src/api/cryptocom.ts
var import_core = __toESM(require_index_cjs(), 1);
function parseInstruments(json) {
  const list3 = json?.result?.data ?? [];
  const set = /* @__PURE__ */ new Set();
  for (const i of list3) if (i.inst_type === "CCY_PAIR" && i.tradable !== false && i.base_ccy) set.add(i.base_ccy.toUpperCase());
  return [...set].sort();
}

// src/lib/lab/pairs.ts
var HOUR3 = 36e5;
function pairOf(coin, prices, priceUsd) {
  if (coin.coinId === "bitcoin") return "BTCUSDT";
  if (coin.coinId === "ethereum") return "ETHUSDT";
  if (priceUsd) return binanceSymbolFor({ id: coin.coinId, symbol: coin.symbol, priceUsd }, prices);
  const sym = `${coin.symbol.toUpperCase()}USDT`;
  return prices.has(sym) ? sym : null;
}
async function hourlyBetween(symbol, fromMs, toMs = Infinity) {
  const out = [];
  let cursor = Math.floor(fromMs / HOUR3) * HOUR3;
  for (let page = 0; page < 12 && cursor < toMs; page++) {
    const chunk = await getKlines(symbol, "1h", 1e3, cursor);
    if (!chunk.length) break;
    out.push(...chunk);
    cursor = (chunk[chunk.length - 1].time + 3600) * 1e3;
    if (chunk.length < 1e3) break;
  }
  return out.filter((c) => c.time * 1e3 < toMs);
}

// src/lib/lab/replayTemp.ts
var addDays2 = (day, n2) => new Date(Date.parse(`${day}T00:00:00Z`) + n2 * 864e5).toISOString().slice(0, 10);
function tempAtIndex(btc, i, fngByDay, mvrvByDay) {
  if (i < 199) return null;
  const day = dayOf(btc[i].time);
  const r = computeCycle({ btcDaily: btc.slice(Math.max(0, i - 1499), i + 1), fng: fngByDay.get(day), mvrv: mvrvByDay.get(addDays2(day, -7)) });
  return r ? r.temperature : null;
}
function temperatureSeries(btc, fngByDay, mvrvByDay) {
  const out = /* @__PURE__ */ new Map();
  for (let i = 199; i < btc.length; i++) {
    const t = tempAtIndex(btc, i, fngByDay, mvrvByDay);
    if (t != null) out.set(dayOf(btc[i].time), t);
  }
  return out;
}

// src/runner/autopilotSources.ts
var H = 36e5;
var memo = /* @__PURE__ */ new Map();
async function cached(key, ttlMs, load) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await load();
  memo.set(key, { at: Date.now(), value });
  return value;
}
async function getJson3(url, headers = {}) {
  const r = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(2e4) });
  if (!r.ok) throw new Error(`${new URL(url).host} a r\xE9pondu ${r.status}`);
  return await r.json();
}
var markets = (key, page) => getJson3(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&price_change_percentage=7d,30d`, key ? { "x-cg-demo-api-key": key } : {});
async function runnerAutopilotSources(coingeckoKey, rules) {
  const top = await cached("markets", 24 * H, () => markets(coingeckoKey, 1));
  const prices = await getAllPrices();
  const symbolOf = (coinId) => {
    const m = top.find((x) => x.id === coinId);
    return pairOf({ coinId, symbol: m?.symbol ?? coinId }, prices, m?.current_price ?? null);
  };
  const daily = (sym) => cached(`daily:${sym}`, 6 * H, async () => {
    const cs = await getDailyHistory(sym, Date.UTC(2017, 7, 17));
    const last2 = cs[cs.length - 1];
    return last2 && last2.time + 86400 > Date.now() / 1e3 ? cs.slice(0, -1) : cs;
  });
  const temps = await cached("temps", 6 * H, async () => {
    const btc = await daily("BTCUSDT");
    const fngRows = await getJson3("https://api.alternative.me/fng/?limit=0&format=json").then((r) => r.data).catch(() => []);
    const mvrvRows = await getJson3("https://bitcoin-data.com/v1/mvrv").catch(() => []);
    const fng = new Map(fngRows.map((x) => [new Date(Number(x.timestamp) * 1e3).toISOString().slice(0, 10), Number(x.value)]));
    const mvrv = new Map(mvrvRows.filter((x) => Number(x.mvrv) > 0).map((x) => [x.d, Number(x.mvrv)]));
    return temperatureSeries(btc, fng, mvrv);
  });
  const available = await cached("cdc", 6 * H, () => getJson3("https://api.crypto.com/exchange/v1/public/get-instruments").then(parseInstruments).catch(() => null));
  return {
    daily: async (coinId) => {
      const s = symbolOf(coinId);
      return s ? daily(s) : [];
    },
    hourly: async (coinId, fromMs, toMs) => {
      const s = symbolOf(coinId);
      return s ? hourlyBetween(s, fromMs, toMs) : [];
    },
    temperatureAt: (day) => temps.get(day) ?? null,
    universe: async () => autoBaseUniverse(top).map((u) => ({ coinId: u.id, symbol: u.symbol, name: u.name, rank: u.rank, available: available ? available.includes(u.symbol.toUpperCase()) : null })),
    live: async () => {
      const smallCaps = await cached("smallcaps", 24 * H, async () => {
        const pages = await Promise.allSettled([2, 3, 4, 5].map((p) => markets(coingeckoKey, p)));
        const ok = pages.flatMap((p) => p.status === "fulfilled" ? p.value : []);
        return ok.length ? ok : null;
      });
      return { markets: top, smallCaps, rules };
    }
  };
}

// src/runner/main.ts
var log = (msg) => {
  const when = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19);
  process.stdout.write(`${when} ${msg}
`);
};
var sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
function parseArgs(argv) {
  let configPath = "";
  let mode = "loop";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config" || a === "-c") configPath = argv[++i] ?? "";
    else if (a === "--once") mode = "once";
    else if (a === "--check") mode = "check";
    else if (a === "--brief") mode = "brief";
    else if (a === "--discover") mode = "discover";
    else if (a === "--help" || a === "-h") mode = "check";
    else throw new Error(`Option inconnue : ${a}. Options : --config <chemin>, --once, --check, --brief, --discover.`);
  }
  if (!configPath) configPath = join(homedir(), ".config", "boussole", "runner.json");
  return { configPath, mode };
}
function loadConfig(path, allowMissingChatId) {
  const raw = existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : {};
  const { config, problems } = validateConfig(applyEnv(raw), { allowMissingChatId });
  if (!config) throw new Error(`Configuration incompl\xE8te (${path}) :
- ${problems.join("\n- ")}`);
  return config;
}
var defaultStateDir = () => join(homedir(), ".local", "state", "boussole");
var stateFileOf = (cfg) => join(cfg.stateDir || defaultStateDir(), "runner-state.json");
var HEARTBEAT_PATH = "heartbeat.json";
var HEARTBEAT_PERIOD_MS = 10 * 6e4;
var lastHeartbeatAt = 0;
async function pushHeartbeat(cfg) {
  if (Date.now() - lastHeartbeatAt < HEARTBEAT_PERIOD_MS) return;
  const previous = await fetchRemote(cfg.syncRepo, HEARTBEAT_PATH, cfg.syncToken).catch(() => null);
  const stamped = JSON.stringify({ at: (/* @__PURE__ */ new Date()).toISOString(), device: cfg.device });
  await pushRemote(cfg.syncRepo, HEARTBEAT_PATH, cfg.syncToken, stamped, previous?.sha ?? null);
  lastHeartbeatAt = Date.now();
}
function loadState(cfg) {
  const p = stateFileOf(cfg);
  return existsSync(p) ? parseState(readFileSync(p, "utf-8")) : emptyState();
}
function saveState(cfg, st) {
  const dir = cfg.stateDir || defaultStateDir();
  mkdirSync(dir, { recursive: true });
  const p = stateFileOf(cfg);
  writeFileSync(p, JSON.stringify(st, null, 2));
  try {
    chmodSync(p, 384);
  } catch {
  }
}
var btcDailyCache = null;
async function cachedBtcDaily() {
  if (!btcDailyCache || Date.now() - btcDailyCache.at > 90 * 6e4) {
    const data = await fetchBtcDaily();
    if (data) btcDailyCache = { at: Date.now(), data };
  }
  return btcDailyCache?.data ?? null;
}
var slowMetricsCache = null;
async function cachedSlowMetrics(cfg) {
  if (!slowMetricsCache || Date.now() - slowMetricsCache.at > 6 * 60 * 6e4) {
    const [mvrv, stableShare] = await Promise.all([fetchMvrv().catch(() => null), fetchStablecoinShare(cfg.coingeckoKey).catch(() => null)]);
    if (mvrv != null || stableShare != null || !slowMetricsCache) slowMetricsCache = { at: Date.now(), mvrv, stableShare };
  }
  return { mvrv: slowMetricsCache?.mvrv ?? null, stableShare: slowMetricsCache?.stableShare ?? null };
}
var fngCache = null;
async function cachedFng() {
  if (!fngCache || Date.now() - fngCache.at > 30 * 6e4) {
    const data = await fetchFearGreed();
    if (data) fngCache = { at: Date.now(), data };
  }
  return fngCache?.data ?? null;
}
var newsCache = null;
async function cachedNews(coins) {
  const sig = coins.map((c) => c.coinId).join(",");
  if (!newsCache || Date.now() - newsCache.at > 45 * 6e4 || newsCache.coins !== sig) {
    const results = await Promise.allSettled(coins.map((c) => fetchCoinNews(c, 18 * 36e5)));
    const items = results.flatMap((r) => r.status === "fulfilled" ? r.value : []).sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 24);
    if (items.length || !newsCache) newsCache = { at: Date.now(), coins: sig, items };
  }
  return newsCache?.items ?? [];
}
async function emergingDigest(wallets) {
  const settled = await Promise.allSettled([getNewPools("solana"), getNewPools("base")]);
  const pools = settled.flatMap((r) => r.status === "fulfilled" ? r.value : []);
  if (!pools.length) return [];
  const lines = [];
  for (const c of emergingCandidates(pools, 3)) {
    let security;
    try {
      const net = networkByKey(c.pool.network);
      const r = net?.goplusChainId ? await scanEvm(net.goplusChainId, c.pool.tokenAddress) : await scanSolana(c.pool.tokenAddress);
      security = `scan : ${r.verdict.toLowerCase()}`;
    } catch {
      security = void 0;
    }
    const followed = [];
    for (const w of wallets.slice(0, 8)) {
      try {
        if ((await walletHoldings(w, [c.pool.tokenAddress])).size > 0) followed.push(w.label);
      } catch {
      }
    }
    lines.push(emergingLine(c, { security, wallets: followed }));
  }
  return lines;
}
var depsOf = (cfg) => ({
  fetchRemote: () => fetchRemote(cfg.syncRepo, cfg.syncPath, cfg.syncToken),
  pushRemote: (text, sha) => pushRemote(cfg.syncRepo, cfg.syncPath, cfg.syncToken, text, sha),
  telegram: (text) => sendMessage(cfg.telegramToken, cfg.telegramChatId, text),
  prices: (ids) => fetchPrices(ids, cfg.coingeckoKey),
  fearGreed: () => cachedFng(),
  btcDaily: () => cachedBtcDaily(),
  funding: () => fetchBtcFunding(),
  mvrv: async () => (await cachedSlowMetrics(cfg)).mvrv,
  stableShare: async () => (await cachedSlowMetrics(cfg)).stableShare,
  news: (coins) => cfg.newsEnabled ? cachedNews(coins) : Promise.resolve([]),
  aiRates: (items) => cfg.mistralApiKey ? rateNews(cfg.mistralApiKey, cfg.mistralModel, items) : Promise.resolve(items.map(() => ({ importance: 0, resume: "" }))),
  smartEvents: (wallets, sinceMs, nowMs) => cfg.smartMoneyEnabled ? fetchAllWalletEvents(wallets, sinceMs, nowMs) : Promise.resolve([]),
  emerging: (wallets) => cfg.emergingEnabled ? emergingDigest(wallets) : Promise.resolve([]),
  autopilot: async (bundle, nowMs) => {
    const profile = bundle.data.profile;
    const rules = rulesOf({ archetype: profile?.archetype ?? "Ma strat\xE9gie", rules: profile?.rules ?? {} });
    return runAutopilots(bundle, await runnerAutopilotSources(cfg.coingeckoKey, rules), nowMs, cfg.device);
  },
  tradeBars: async (coinId, _symbol, fromMs, toMs) => (await runnerAutopilotSources(cfg.coingeckoKey, rulesOf({ archetype: "Ma strat\xE9gie", rules: {} }))).hourly(coinId, fromMs, toMs),
  tokenPrices: async (chain, mints) => {
    const pairs = await getTokenPairs(chain === "eth" ? "ethereum" : chain, mints);
    const out = /* @__PURE__ */ new Map();
    for (const [addr, p] of pairs) {
      const px = Number(p.priceUsd);
      if (px > 0) out.set(addr, px);
    }
    return out;
  },
  signals: async (coins) => computeSignals(coins, await runnerAutopilotSources(cfg.coingeckoKey, rulesOf({ archetype: "Ma strat\xE9gie", rules: {} })))
});
async function modeCheck(cfg) {
  const { result } = await runCycle(cfg, loadState(cfg), { dry: true, forceBrief: true, onDry: (text) => log(`[\xE0 blanc] ${text.split("\n").join(" \u2014 ")}`) }, depsOf(cfg));
  log(`Diagnostic : ${result.error == null ? `pr\xEAt (alertes arm\xE9es : ${result.watching})` : `un probl\xE8me subsiste (${result.error})`}.`);
}
async function modeMain(cfg, mode) {
  if (mode === "discover") {
    const chats = await recentChats(cfg.telegramToken);
    if (!chats.length) {
      log("Aucune conversation priv\xE9e vue par le bot. Ouvre Telegram, \xE9cris \xAB /start \xBB \xE0 ton bot, puis relance --discover.");
      return;
    }
    for (const c of chats) log(`Chat id : ${c.chatId}${c.title ? ` (${c.title})` : ""} \u2014 ajoute "telegramChatId": "${c.chatId}" dans la configuration.`);
    if (cfg.telegramChatId) {
      await sendMessage(cfg.telegramToken, cfg.telegramChatId, "Boussole parle depuis ton serveur : la surveillance est bien raccord\xE9e.");
      log("Message de test envoy\xE9.");
    }
    return;
  }
  const run = async () => {
    const { state, result } = await runCycle(cfg, loadState(cfg), { dry: false, forceBrief: mode === "brief" }, depsOf(cfg));
    saveState(cfg, state);
    await pushHeartbeat(cfg).catch((e) => log(`Battement de vie non envoy\xE9 : ${e instanceof Error ? e.message : String(e)}`));
    if (result.sent) log(`${result.sent} message${result.sent > 1 ? "s" : ""} envoy\xE9${result.sent > 1 ? "s" : ""}${result.consumed ? `, ${result.consumed} alerte${result.consumed > 1 ? "s" : ""} consomm\xE9e${result.consumed > 1 ? "s" : ""} dans la synchronisation` : ""}.`);
    if (result.watching || result.sent) log(`Surveillance : ${result.watching} alerte${result.watching > 1 ? "s" : ""} arm\xE9e${result.watching > 1 ? "s" : ""}.`);
    if (result.error) log(`\xC9chec : ${result.error}`);
  };
  if (mode === "once" || mode === "brief") {
    await run();
    return;
  }
  log(`Surveillance d\xE9marr\xE9e : contr\xF4le toutes les ${cfg.intervalMinutes} min ${cfg.timeZone}. Briefs : ${cfg.briefEnabled ? `matin ${cfg.briefHour} h` : "matin d\xE9sactiv\xE9"}${cfg.briefUsOpen ? ", ouverture US (9 h 30 New York)" : ""}${cfg.briefUsClose ? ", cl\xF4ture US (16 h New York)" : ""}.${cfg.quietStart !== cfg.quietEnd ? ` Silence nocturne : les alertes arrivent regroup\xE9es apr\xE8s ${cfg.quietEnd} h (fen\xEAtre ${cfg.quietStart} h \u2192 ${cfg.quietEnd} h).` : ""} Veille presse : ${cfg.newsEnabled ? `activ\xE9e${cfg.mistralApiKey ? " (r\xE9sum\xE9s IA)" : " (heuristique, sans cl\xE9 IA)"}` : "d\xE9sactiv\xE9e"}. Smart money : ${cfg.smartMoneyEnabled ? "activ\xE9" : "d\xE9sactiv\xE9"}. Autopilotes : ${cfg.autopilotEnabled ? `activ\xE9s${cfg.autopilotTelegram ? " (ordres sur Telegram)" : ""}` : "d\xE9sactiv\xE9s"}${cfg.emergingEnabled ? ", digest \xE9mergentes dans le brief du matin" : ""} Alertes de signal : ${cfg.signalAlertsEnabled ? "activ\xE9es (une fois par jour)" : "d\xE9sactiv\xE9es"}. Source : ${cfg.syncRepo}/${cfg.syncPath} (chiffr\xE9 de bout en bout).`);
  for (; ; ) {
    try {
      await run();
    } catch (e) {
      log(`\xC9chec du cycle : ${e instanceof Error ? e.message : String(e)}`);
    }
    await sleep2(cfg.intervalMinutes * 6e4);
  }
}
async function main() {
  const { configPath, mode } = parseArgs(process.argv.slice(2));
  const cfg = loadConfig(configPath, mode === "discover");
  log(`Configuration : d\xE9p\xF4t ${cfg.syncRepo}, devise ${cfg.currency}, appareil \xAB ${cfg.device} \xBB, brief ${cfg.briefEnabled ? `${cfg.briefHour} h` : "d\xE9sactiv\xE9"} ${cfg.timeZone}.`);
  if (mode === "check") await modeCheck(cfg);
  else await modeMain(cfg, mode);
}
process.on("SIGINT", () => {
  log("Arr\xEAt demand\xE9 (SIGINT).");
  process.exit(0);
});
process.on("SIGTERM", () => {
  log("Arr\xEAt demand\xE9 (SIGTERM).");
  process.exit(0);
});
main().catch((e) => {
  log(`Erreur fatale : ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
/*! Bundled license information:

@capacitor/core/dist/index.cjs.js:
  (*! Capacitor: https://capacitorjs.com/ - MIT License *)
*/
