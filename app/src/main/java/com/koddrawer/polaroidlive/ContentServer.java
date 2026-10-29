package com.koddrawer.polaroidlive;

import android.content.Context;
import android.content.res.AssetManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Serves the app's pages from https://appassets.androidplatform.net/ :
 *   /content/...  hot-updated content (files/content) or the copy bundled in the APK (assets/content)
 *   /user/...     files the user picked, cached avatars, etc. (files/user)
 *   /android/...  Android-only helpers bundled in the APK (assets/android)
 * Text files get the desktop "app://content/" and "app://user/" URLs rewritten to this host, and the
 * two pages get the window.api shim injected first thing in <head>.
 */
public class ContentServer {
    public static final String HOST = "appassets.androidplatform.net";
    public static final String BASE = "https://" + HOST;

    private final Context ctx;
    private final AssetManager assets;

    public ContentServer(Context ctx) { this.ctx = ctx; this.assets = ctx.getAssets(); }

    public static String rewrite(String s) {
        if (s == null) return null;
        return s.replace("app://content/", BASE + "/content/").replace("app://user/", BASE + "/user/");
    }
    /** inverse for values stored on disk that must stay portable */
    public static String toLocalPath(Context ctx, String url) {
        if (url == null) return null;
        if (url.startsWith(BASE + "/user/")) return new File(userDir(ctx), decode(url.substring((BASE + "/user/").length()))).getPath();
        if (url.startsWith("app://user/")) return new File(userDir(ctx), decode(url.substring("app://user/".length()))).getPath();
        return null;
    }
    static String decode(String s) { try { return URLDecoder.decode(s, "UTF-8"); } catch (Exception e) { return s; } }

    public static File userDir(Context ctx) { File f = new File(ctx.getFilesDir(), "user"); f.mkdirs(); return f; }
    public static File liveContentDir(Context ctx) { return new File(ctx.getFilesDir(), "content"); }

    /** version of the content the app should use: the downloaded one if it is newer than the bundled copy */
    private Boolean useDl = null;
    public synchronized void invalidate() { useDl = null; }
    public synchronized boolean useDownloaded() {
        if (useDl == null) useDl = computeUseDownloaded();
        return useDl;
    }
    private boolean computeUseDownloaded() {
        File m = new File(liveContentDir(ctx), "manifest.json");
        if (!m.exists()) return false;
        String dl = Updater.versionOf(readFile(m));
        String bundled = Updater.versionOf(readAsset("content/manifest.json"));
        return Updater.cmpVer(dl, bundled) > 0;
    }
    public String activeVersion() {
        return useDownloaded() ? Updater.versionOf(readFile(new File(liveContentDir(ctx), "manifest.json"))) : Updater.versionOf(readAsset("content/manifest.json"));
    }
    public String activeManifest() {
        return useDownloaded() ? readFile(new File(liveContentDir(ctx), "manifest.json")) : readAsset("content/manifest.json");
    }

    public WebResourceResponse handle(WebResourceRequest req) {
        if (!HOST.equals(req.getUrl().getHost())) return null;
        String path = req.getUrl().getPath();
        if (path == null) return notFound();
        path = decode(path);
        if (path.contains("..")) return notFound();
        try {
            InputStream in = null;
            if (path.startsWith("/content/")) {
                String rel = path.substring(9);
                if (useDownloaded()) {
                    File f = new File(liveContentDir(ctx), rel);
                    if (f.isFile()) in = new FileInputStream(f);
                }
                if (in == null) in = openAsset("content/" + rel);
            } else if (path.startsWith("/user/")) {
                File f = new File(userDir(ctx), path.substring(6));
                if (f.isFile()) in = new FileInputStream(f);
            } else if (path.startsWith("/android/")) {
                in = openAsset("android/" + path.substring(9));
            }
            if (in == null) return notFound();
            String mime = mimeOf(path);
            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-cache");
            if (isText(mime)) {
                String s = new String(readAll(in), StandardCharsets.UTF_8);
                s = rewrite(s);
                if (mime.equals("text/html")) s = injectApi(s);
                in = new ByteArrayInputStream(s.getBytes(StandardCharsets.UTF_8));
                return new WebResourceResponse(mime, "utf-8", 200, "OK", headers, in);
            }
            return new WebResourceResponse(mime, null, 200, "OK", headers, in);
        } catch (IOException e) {
            return notFound();
        }
    }

    private String injectApi(String html) {
        String tag = "<script src=\"" + BASE + "/android/api.js\"></script>";
        int i = html.toLowerCase(Locale.ROOT).indexOf("<head>");
        if (i >= 0) return html.substring(0, i + 6) + tag + html.substring(i + 6);
        return tag + html;
    }

    private InputStream openAsset(String p) { try { return assets.open(p); } catch (IOException e) { return null; } }
    String readAsset(String p) {
        try (InputStream in = assets.open(p)) { return new String(readAll(in), StandardCharsets.UTF_8); } catch (IOException e) { return null; }
    }
    static String readFile(File f) {
        try (InputStream in = new FileInputStream(f)) { return new String(readAll(in), StandardCharsets.UTF_8); } catch (IOException e) { return null; }
    }
    static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] b = new byte[65536]; int n;
        while ((n = in.read(b)) > 0) bo.write(b, 0, n);
        in.close();
        return bo.toByteArray();
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }
    private static boolean isText(String m) {
        return m.startsWith("text/") || m.equals("application/javascript") || m.equals("application/json");
    }
    static String mimeOf(String p) {
        String l = p.toLowerCase(Locale.ROOT);
        if (l.endsWith(".html")) return "text/html";
        if (l.endsWith(".js") || l.endsWith(".mjs")) return "application/javascript";
        if (l.endsWith(".css")) return "text/css";
        if (l.endsWith(".json")) return "application/json";
        if (l.endsWith(".png")) return "image/png";
        if (l.endsWith(".jpg") || l.endsWith(".jpeg")) return "image/jpeg";
        if (l.endsWith(".webp")) return "image/webp";
        if (l.endsWith(".gif")) return "image/gif";
        if (l.endsWith(".svg")) return "image/svg+xml";
        if (l.endsWith(".glb")) return "model/gltf-binary";
        if (l.endsWith(".wav")) return "audio/wav";
        if (l.endsWith(".mp3")) return "audio/mpeg";
        if (l.endsWith(".ogg")) return "audio/ogg";
        if (l.endsWith(".m4a")) return "audio/mp4";
        if (l.endsWith(".ttf")) return "font/ttf";
        if (l.endsWith(".otf")) return "font/otf";
        if (l.endsWith(".woff")) return "font/woff";
        if (l.endsWith(".woff2")) return "font/woff2";
        if (l.endsWith(".wasm")) return "application/wasm";
        return "application/octet-stream";
    }
}
