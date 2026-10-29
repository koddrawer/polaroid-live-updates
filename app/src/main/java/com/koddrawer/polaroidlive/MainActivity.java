package com.koddrawer.polaroidlive;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

public class MainActivity extends Activity {
    private static final int REQ_PICK = 41;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService pool = Executors.newFixedThreadPool(4);
    private OkHttpClient http, httpNoRedirect;
    private ContentServer server;
    private Store store;
    private Updater updater;

    private WebView display, control, engine;
    private FrameLayout root, controlBox;
    private TextView gear;
    private final Runnable hideGear = () -> gear.animate().alpha(0f).setDuration(400).start();

    private final Map<String, Object[]> engineReqs = new ConcurrentHashMap<>();
    private final Map<String, WebSocket> sockets = new ConcurrentHashMap<>();
    private final Map<String, Object> inflightImages = new ConcurrentHashMap<>();
    private Object[] pendingPick = null; // {WebView, id, kind}
    private int reqSeq = 0;
    private volatile boolean engineReady = false;
    private final java.util.List<String> engineQueue = new java.util.ArrayList<>();
    private long lastBack = 0;

    // ------------------------------------------------------------------ lifecycle
    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28)
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        http = new OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS)
                .pingInterval(0, TimeUnit.SECONDS).build();
        httpNoRedirect = http.newBuilder().followRedirects(true).build();
        server = new ContentServer(this);
        store = new Store(this);
        updater = new Updater(this, server, http);
        WebView.setWebContentsDebuggingEnabled(true);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);

        display = makeWebView("display");
        root.addView(display, new FrameLayout.LayoutParams(-1, -1));
        if (Build.VERSION.SDK_INT >= 26) display.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);

        // TikTok engine: an invisible 1×1 WebView that runs the LIVE connection
        engine = makeWebView("engine");
        FrameLayout.LayoutParams ep = new FrameLayout.LayoutParams(1, 1);
        root.addView(engine, ep);
        engine.setAlpha(0f);

        // control panel overlay
        controlBox = new FrameLayout(this);
        controlBox.setBackgroundColor(Color.parseColor("#15110d"));
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        TextView bar = new TextView(this);
        bar.setText("✕  Đóng bảng điều khiển — quay lại màn hình live");
        bar.setTextColor(Color.parseColor("#f0c27a"));
        bar.setTextSize(15);
        bar.setPadding(dp(16), dp(12), dp(16), dp(12));
        bar.setBackgroundColor(Color.parseColor("#2a1f15"));
        bar.setOnClickListener(v -> showControl(false));
        col.addView(bar, new LinearLayout.LayoutParams(-1, -2));
        control = makeWebView("control");
        col.addView(control, new LinearLayout.LayoutParams(-1, 0, 1f));
        controlBox.addView(col, new FrameLayout.LayoutParams(-1, -1));
        controlBox.setVisibility(View.GONE);
        root.addView(controlBox, new FrameLayout.LayoutParams(-1, -1));

        // settings button: fades out after a few seconds, tap the screen to bring it back
        gear = new TextView(this);
        gear.setText("⚙");
        gear.setTextSize(22);
        gear.setTextColor(Color.WHITE);
        gear.setGravity(Gravity.CENTER);
        GradientDrawable gd = new GradientDrawable();
        gd.setShape(GradientDrawable.OVAL);
        gd.setColor(Color.parseColor("#99000000"));
        gear.setBackground(gd);
        FrameLayout.LayoutParams gp = new FrameLayout.LayoutParams(dp(48), dp(48), Gravity.TOP | Gravity.END);
        gp.setMargins(0, dp(14), dp(14), 0);
        root.addView(gear, gp);
        gear.setOnClickListener(v -> showControl(true));
        flashGear();

        display.loadUrl(ContentServer.BASE + "/content/display.html");
        control.loadUrl(ContentServer.BASE + "/content/control.html");
        engine.loadUrl(ContentServer.BASE + "/android/engine.html");

        ui.postDelayed(() -> runUpdate(false), 5000);
        ui.postDelayed(new Runnable() { public void run() { runUpdate(false); ui.postDelayed(this, 15 * 60 * 1000); } }, 15 * 60 * 1000);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        if (ev.getAction() == MotionEvent.ACTION_DOWN && controlBox.getVisibility() != View.VISIBLE) flashGear();
        return super.dispatchTouchEvent(ev);
    }
    private void flashGear() {
        ui.removeCallbacks(hideGear);
        gear.animate().cancel();
        gear.setAlpha(1f);
        ui.postDelayed(hideGear, 3500);
    }
    private void showControl(boolean show) {
        controlBox.setVisibility(show ? View.VISIBLE : View.GONE);
        gear.setVisibility(show ? View.GONE : View.VISIBLE);
        if (!show) { flashGear(); immersive(); }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }
    @SuppressWarnings("deprecation")
    private void immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (controlBox.getVisibility() == View.VISIBLE) { showControl(false); return; }
        long now = System.currentTimeMillis();
        if (now - lastBack < 2000) { super.onBackPressed(); return; }
        lastBack = now;
        Toast.makeText(this, "Bấm Back lần nữa để thoát", Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onDestroy() {
        for (WebSocket ws : sockets.values()) try { ws.cancel(); } catch (Exception ignored) {}
        for (WebView w : new WebView[]{display, control, engine}) if (w != null) w.destroy();
        pool.shutdownNow();
        super.onDestroy();
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    // ------------------------------------------------------------------ WebViews
    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private WebView makeWebView(String role) {
        WebView w = new WebView(this);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setOffscreenPreRaster("display".equals(role));
        s.setTextZoom(100);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        w.setBackgroundColor("control".equals(role) ? Color.parseColor("#15110d") : Color.BLACK);
        w.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        w.setOverScrollMode(View.OVER_SCROLL_NEVER);
        w.addJavascriptInterface(new Bridge(w, role), "Native");
        w.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) { return server.handle(req); }
            @Override public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail d) {
                // a WebView renderer died (low memory): rebuild the whole screen instead of crashing the app
                ui.post(MainActivity.this::recreate);
                return true;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (ContentServer.HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }
        });
        w.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage m) {
                android.util.Log.d("PolaroidLive", "[" + role + "] " + m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
                return true;
            }
        });
        return w;
    }

    private void js(WebView w, String code) {
        if (w == null) return;
        ui.post(() -> w.evaluateJavascript(code, null));
    }
    private void resolve(WebView w, String id, boolean ok, String json) {
        js(w, "window.__nativeResolve&&__nativeResolve(" + JSONObject.quote(id) + "," + ok + "," + JSONObject.quote(json == null ? "null" : json) + ")");
    }
    private void emit(WebView w, String ch, String json) {
        js(w, "window.__nativeEvent&&__nativeEvent(" + JSONObject.quote(ch) + "," + JSONObject.quote(json == null ? "null" : json) + ")");
    }
    private void broadcast(String ch, String json) { emit(display, ch, json); emit(control, ch, json); }

    // ------------------------------------------------------------------ JS bridge
    public class Bridge {
        private final WebView view;
        private final String role;
        Bridge(WebView v, String role) { this.view = v; this.role = role; }

        @JavascriptInterface public String role() { return role; }

        /** async request: result arrives via window.__nativeResolve(id, ok, json) */
        @JavascriptInterface
        public void call(String id, String method, String argsJson) {
            pool.execute(() -> {
                try {
                    JSONArray a = new JSONArray(argsJson == null || argsJson.isEmpty() ? "[]" : argsJson);
                    String res = handle(view, id, method, a);
                    if (res != PENDING) resolve(view, id, true, res);
                } catch (Throwable e) {
                    resolve(view, id, false, Updater.obj("message", String.valueOf(e.getMessage())).toString());
                }
            });
        }

        /** fire-and-forget messages between the pages */
        @JavascriptInterface
        public void send(String channel, String json) {
            switch (channel) {
                case "display:command": emit(display, channel, json); break;
                case "display:report": emit(control, channel, json); break;
                case "live:event":
                case "tiktok:status": broadcast(channel, json); break;
                case "ui:control": ui.post(() -> showControl("true".equals(json))); break;
                case "engine:ready": ui.post(() -> { engineReady = true; for (String c : engineQueue) engine.evaluateJavascript(c, null); engineQueue.clear(); }); break;
                default: break;
            }
        }

        /** engine → reply to a forwarded tiktok:* call */
        @JavascriptInterface
        public void engineReply(String rid, boolean ok, String json) {
            Object[] r = engineReqs.remove(rid);
            if (r != null) resolve((WebView) r[0], (String) r[1], ok, json);
        }

        // ---- raw WebSocket for the engine (binary frames as base64)
        @JavascriptInterface
        public void wsOpen(String wsId, String url, String headersJson) {
            try {
                Request.Builder rb = new Request.Builder().url(url);
                JSONObject h = new JSONObject(headersJson == null ? "{}" : headersJson);
                Iterator<String> it = h.keys();
                while (it.hasNext()) { String k = it.next(); String v = h.optString(k, null); if (v != null && !v.isEmpty()) rb.header(k, v); }
                WebSocket ws = http.newWebSocket(rb.build(), new WebSocketListener() {
                    @Override public void onOpen(WebSocket s, Response r) { wsEvent(view, wsId, "open", "", 0); }
                    @Override public void onMessage(WebSocket s, ByteString bytes) { wsEvent(view, wsId, "message", bytes.base64(), 1); }
                    @Override public void onMessage(WebSocket s, String text) {
                        wsEvent(view, wsId, "message", Base64.encodeToString(text.getBytes(), Base64.NO_WRAP), 0);
                    }
                    @Override public void onClosing(WebSocket s, int code, String reason) { s.close(code, reason); }
                    @Override public void onClosed(WebSocket s, int code, String reason) { sockets.remove(wsId); wsEvent(view, wsId, "close", reason, code); }
                    @Override public void onFailure(WebSocket s, Throwable t, Response r) {
                        sockets.remove(wsId);
                        if (r != null) {
                            String hm = r.header("handshake-msg", "");
                            wsEvent(view, wsId, "unexpected-response", Updater.obj("statusCode", r.code(), "handshake-msg", hm).toString(), r.code());
                        }
                        wsEvent(view, wsId, "error", String.valueOf(t.getMessage()), 0);
                        wsEvent(view, wsId, "close", "", 1006);
                    }
                });
                sockets.put(wsId, ws);
            } catch (Exception e) {
                wsEvent(view, wsId, "error", String.valueOf(e.getMessage()), 0);
                wsEvent(view, wsId, "close", "", 1006);
            }
        }
        @JavascriptInterface public boolean wsSend(String wsId, String b64) {
            WebSocket ws = sockets.get(wsId);
            return ws != null && ws.send(ByteString.of(Base64.decode(b64, Base64.DEFAULT)));
        }
        @JavascriptInterface public void wsClose(String wsId, int code, String reason) {
            WebSocket ws = sockets.get(wsId);
            if (ws != null) { try { ws.close(code >= 1000 && code < 5000 ? code : 1000, reason); } catch (Exception e) { ws.cancel(); } }
        }
        @JavascriptInterface public void wsTerminate(String wsId) {
            WebSocket ws = sockets.remove(wsId);
            if (ws != null) ws.cancel();
        }
    }

    private void wsEvent(WebView w, String wsId, String type, String payload, int num) {
        js(w, "window.__wsEvent&&__wsEvent(" + JSONObject.quote(wsId) + "," + JSONObject.quote(type) + "," + JSONObject.quote(payload == null ? "" : payload) + "," + num + ")");
    }

    private static final String PENDING = new String("__pending__");

    private String handle(WebView view, String id, String method, JSONArray a) throws Exception {
        switch (method) {
            case "settings:get": return store.get();
            case "settings:set": {
                String s = store.merge(a.isNull(0) ? "{}" : a.get(0).toString());
                broadcast("settings:changed", s);
                return s;
            }
            case "settings:replace": {
                String s = store.replace(a.getString(0), a.isNull(1) ? "null" : a.get(1).toString());
                broadcast("settings:changed", s);
                return s;
            }
            case "image:fetch": return JSONObject.quote(fetchImage(a.optString(0, null)));
            case "state:load": return store.loadState(a.getString(0));
            case "state:save": store.saveState(a.getString(0), a.isNull(1) ? "null" : a.get(1).toString()); return "true";
            case "update:check": {
                JSONObject r = runUpdate(true);
                return r.toString();
            }
            case "update:apply": ui.post(this::reloadAll); return "true";
            case "app:info": return Updater.obj("version", server.activeVersion(), "shell", "android-" + BuildConfigShim.VERSION,
                    "platform", "android", "userData", getFilesDir().getPath()).toString();
            case "app:openUserData": return "false";
            case "display:reload": ui.post(() -> display.reload()); return "true";
            case "file:pick": {
                pendingPick = new Object[]{view, id, a.optString(0, "image")};
                ui.post(() -> pickFile(a.optString(0, "image")));
                return PENDING;
            }
            case "net:http": return httpRequest(a);
            default:
                if (method.startsWith("tiktok:")) {
                    String rid = "r" + (++reqSeq);
                    engineReqs.put(rid, new Object[]{view, id});
                    String code = "window.__engineCall&&__engineCall(" + JSONObject.quote(rid) + "," + JSONObject.quote(method) + "," + JSONObject.quote(a.toString()) + ")";
                    ui.post(() -> { if (engineReady) engine.evaluateJavascript(code, null); else engineQueue.add(code); });
                    // give up after 60 s so the page never waits forever
                    ui.postDelayed(() -> { Object[] r = engineReqs.remove(rid); if (r != null) resolve((WebView) r[0], (String) r[1], false, Updater.obj("message", "TikTok engine timeout").toString()); }, 60000);
                    return PENDING;
                }
                throw new Exception("Unknown method " + method);
        }
    }

    // ------------------------------------------------------------------ HTTP for the engine (no CORS, raw headers)
    private String httpRequest(JSONArray a) throws Exception {
        String method = a.optString(0, "GET").toUpperCase();
        String url = a.getString(1);
        JSONObject headers = a.optJSONObject(2);
        String bodyB64 = a.isNull(3) ? null : a.optString(3, null);
        Request.Builder rb = new Request.Builder().url(url);
        String ctype = "application/octet-stream";
        if (headers != null) {
            Iterator<String> it = headers.keys();
            while (it.hasNext()) {
                String k = it.next(); Object v = headers.get(k);
                if (v == null || v == JSONObject.NULL) continue;
                if (k.equalsIgnoreCase("content-length") || k.equalsIgnoreCase("host") || k.equalsIgnoreCase("accept-encoding") || k.equalsIgnoreCase("connection")) continue;
                if (k.equalsIgnoreCase("content-type")) ctype = String.valueOf(v);
                if (v instanceof JSONArray) { JSONArray va = (JSONArray) v; for (int i = 0; i < va.length(); i++) rb.addHeader(k, va.getString(i)); }
                else rb.header(k, String.valueOf(v));
            }
        }
        RequestBody body = null;
        if (bodyB64 != null) body = RequestBody.create(Base64.decode(bodyB64, Base64.DEFAULT), MediaType.parse(ctype));
        else if (!method.equals("GET") && !method.equals("HEAD")) body = RequestBody.create(new byte[0], null);
        rb.method(method, body);
        try (Response r = httpNoRedirect.newCall(rb.build()).execute()) {
            JSONObject h = new JSONObject();
            for (String name : r.headers().names()) {
                JSONArray vs = new JSONArray();
                for (String v : r.headers(name)) vs.put(v);
                h.put(name.toLowerCase(), vs);
            }
            byte[] b = r.body() != null ? r.body().bytes() : new byte[0];
            return Updater.obj("status", r.code(), "statusText", r.message(), "url", r.request().url().toString(), "headers", h,
                    "body", Base64.encodeToString(b, Base64.NO_WRAP)).toString();
        }
    }

    // ------------------------------------------------------------------ images (avatars, gift icons)
    private String fetchImage(String url) {
        if (url == null || url.isEmpty()) return null;
        if (url.startsWith(ContentServer.BASE) || url.startsWith("data:")) return url;
        if (url.startsWith("app://")) return ContentServer.rewrite(url);
        try {
            String hash = sha1(url);
            File dir = new File(ContentServer.userDir(this), "cache"); dir.mkdirs();
            File[] existing = dir.listFiles((d, n) -> n.startsWith(hash + "."));
            if (existing != null && existing.length > 0) return ContentServer.BASE + "/user/cache/" + existing[0].getName();
            Request r = new Request.Builder().url(url).header("User-Agent", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36")
                    .header("Referer", "https://www.tiktok.com/").build();
            try (Response res = http.newCall(r).execute()) {
                if (!res.isSuccessful()) return null;
                byte[] b = res.body().bytes();
                String ext = sniff(b);
                File f = new File(dir, hash + "." + ext);
                Updater.write(f, b);
                return ContentServer.BASE + "/user/cache/" + f.getName();
            }
        } catch (Exception e) { return null; }
    }
    private static String sniff(byte[] b) {
        if (b.length > 8 && (b[0] & 0xff) == 0x89 && b[1] == 'P') return "png";
        if (b.length > 3 && (b[0] & 0xff) == 0xff && (b[1] & 0xff) == 0xd8) return "jpg";
        if (b.length > 12 && b[0] == 'R' && b[1] == 'I' && b[8] == 'W' && b[9] == 'E') return "webp";
        if (b.length > 4 && b[0] == 'G' && b[1] == 'I') return "gif";
        return "img";
    }
    private static String sha1(String s) throws Exception {
        byte[] h = MessageDigest.getInstance("SHA-1").digest(s.getBytes("UTF-8"));
        StringBuilder sb = new StringBuilder(); for (byte x : h) sb.append(String.format("%02x", x)); return sb.toString();
    }

    // ------------------------------------------------------------------ file picker
    private void pickFile(String kind) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        if ("sound".equals(kind)) i.setType("audio/*");
        else if ("font".equals(kind)) { i.setType("*/*"); i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"font/*", "application/x-font-ttf", "application/x-font-otf", "application/octet-stream", "application/font-woff"}); }
        else i.setType("image/*");
        try { startActivityForResult(i, REQ_PICK); }
        catch (Exception e) { finishPick(null, null); }
    }
    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_PICK) return;
        Uri uri = (res == RESULT_OK && data != null) ? data.getData() : null;
        pool.execute(() -> finishPick(uri, uri == null ? null : displayName(uri)));
    }
    private String displayName(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {}
        return "file";
    }
    private void finishPick(Uri uri, String name) {
        Object[] p = pendingPick; pendingPick = null;
        if (p == null) return;
        WebView w = (WebView) p[0]; String id = (String) p[1]; String kind = (String) p[2];
        if (uri == null) { resolve(w, id, true, "null"); return; }
        try {
            String sub = "font".equals(kind) ? "fonts" : "sound".equals(kind) ? "sounds" : "icons";
            File dir = new File(ContentServer.userDir(this), sub); dir.mkdirs();
            String safe = Long.toString(System.currentTimeMillis(), 36) + "_" + name.replaceAll("[^\\w.\\-]+", "_");
            File f = new File(dir, safe);
            try (InputStream in = getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(f)) {
                byte[] buf = new byte[65536]; int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            resolve(w, id, true, Updater.obj("url", ContentServer.BASE + "/user/" + sub + "/" + safe, "name", name).toString());
        } catch (Exception e) {
            resolve(w, id, false, Updater.obj("message", String.valueOf(e.getMessage())).toString());
        }
    }

    // ------------------------------------------------------------------ hot update
    private JSONObject runUpdate(boolean manual) {
        if (Looper.myLooper() == Looper.getMainLooper()) { pool.execute(() -> runUpdate(manual)); return Updater.obj("status", "started"); }
        JSONObject r = updater.run(p -> emit(control, "update:progress", p.toString()));
        if ("updated".equals(r.optString("status"))) {
            emit(display, "update:ready", r.toString());
            ui.post(() -> { if (controlBox.getVisibility() != View.VISIBLE) control.reload(); });
        }
        if (manual || !"latest".equals(r.optString("status"))) emit(control, "update:progress", r.toString());
        return r;
    }
    private void reloadAll() { display.reload(); control.reload(); }
}
