// window.api for the Android app (same surface as the desktop preload.js), backed by the Java bridge.
(function () {
  if (window.api) return;
  var N = window.Native;
  var seq = 0, pend = new Map(), subs = {};
  window.__nativeResolve = function (id, ok, json) {
    var p = pend.get(id); if (!p) return; pend.delete(id);
    var v = null; try { v = json ? JSON.parse(json) : null; } catch (e) { v = json; }
    ok ? p.res(v) : p.rej(new Error((v && v.message) || 'native error'));
  };
  window.__nativeEvent = function (ch, json) {
    var v = null; try { v = json ? JSON.parse(json) : null; } catch (e) { v = json; }
    (subs[ch] || []).slice().forEach(function (f) { try { f(v); } catch (e) { console.error(e); } });
  };
  function call(m) {
    var args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (res, rej) { var id = 'c' + (++seq); pend.set(id, { res: res, rej: rej }); N.call(id, m, JSON.stringify(args)); });
  }
  function on(ch) { return function (cb) { (subs[ch] = subs[ch] || []).push(cb); return function () { subs[ch] = (subs[ch] || []).filter(function (f) { return f !== cb; }); }; }; }
  window.api = {
    platform: 'android',
    getSettings: function () { return call('settings:get'); },
    setSettings: function (patch) { return call('settings:set', patch); },
    replaceSetting: function (k, v) { return call('settings:replace', k, v); },
    onSettings: on('settings:changed'),
    fetchImage: function (url) { return call('image:fetch', url); },
    connect: function (opts) { return call('tiktok:connect', opts); },
    disconnect: function () { return call('tiktok:disconnect'); },
    giftList: function () { return call('tiktok:gifts'); },
    tiktokStatus: function () { return call('tiktok:status'); },
    onStatus: on('tiktok:status'),
    onLive: on('live:event'),
    command: function (cmd) { N.send('display:command', JSON.stringify(cmd)); },
    onCommand: on('display:command'),
    report: function (rep) { N.send('display:report', JSON.stringify(rep)); },
    onReport: on('display:report'),
    pickFile: function (kind) { return call('file:pick', kind); },
    loadState: function (k) { return call('state:load', k); },
    saveState: function (k, v) { return call('state:save', k, v); },
    checkUpdate: function () { return call('update:check'); },
    applyUpdate: function () { return call('update:apply'); },
    onUpdate: on('update:progress'),
    onUpdateReady: on('update:ready'),
    info: function () { return call('app:info'); },
    openUserData: function () { return call('app:openUserData'); },
    reloadDisplay: function () { return call('display:reload'); },
    closePanel: function () { N.send('ui:control', 'false'); },
  };
  document.documentElement.classList.add('android');
})();
