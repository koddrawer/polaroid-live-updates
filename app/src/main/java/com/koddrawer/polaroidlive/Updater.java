package com.koddrawer.polaroidlive;

import android.content.Context;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/** Hot update of the content folder from the same GitHub repo the desktop app uses. */
public class Updater {
    public interface Progress { void on(JSONObject p); }

    static String versionOf(String manifest) {
        try { return new JSONObject(manifest).optString("version", "0"); } catch (Exception e) { return "0"; }
    }
    static int cmpVer(String a, String b) {
        String[] pa = (a == null ? "0" : a).split("\\."), pb = (b == null ? "0" : b).split("\\.");
        for (int i = 0; i < Math.max(pa.length, pb.length); i++) {
            int x = i < pa.length ? parseInt(pa[i]) : 0, y = i < pb.length ? parseInt(pb[i]) : 0;
            if (x != y) return x - y;
        }
        return 0;
    }
    private static int parseInt(String s) { try { return Integer.parseInt(s.trim()); } catch (Exception e) { return 0; } }

    private final Context ctx;
    private final ContentServer server;
    private final OkHttpClient http;
    private boolean busy = false;

    public Updater(Context ctx, ContentServer server, OkHttpClient http) { this.ctx = ctx; this.server = server; this.http = http; }

    private byte[] fetch(String url) throws IOException {
        Request r = new Request.Builder().url(url + (url.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis())
                .header("User-Agent", "PolaroidLive-Android").header("Cache-Control", "no-cache").build();
        try (Response res = http.newCall(r).execute()) {
            if (!res.isSuccessful()) throw new IOException("HTTP " + res.code() + " " + url);
            return res.body().bytes();
        }
    }

    public synchronized JSONObject run(Progress progress) {
        if (busy) return obj("status", "busy");
        busy = true;
        try {
            return check(progress);
        } catch (Exception e) {
            String msg = String.valueOf(e.getMessage());
            if (msg.contains("HTTP 404")) msg = "Chưa thấy repo cập nhật trên GitHub.";
            return obj("status", "error", "message", msg);
        } finally { busy = false; }
    }

    private JSONObject check(Progress progress) throws Exception {
        JSONObject local = new JSONObject(server.activeManifest() == null ? "{}" : server.activeManifest());
        String repo = local.optString("repo", "koddrawer/polaroid-live-updates");
        String branch = local.optString("branch", "main");
        String ref = branch;
        try {
            Request r = new Request.Builder().url("https://api.github.com/repos/" + repo + "/commits/" + branch)
                    .header("Accept", "application/vnd.github.sha").header("User-Agent", "PolaroidLive").build();
            try (Response res = http.newCall(r).execute()) {
                if (res.isSuccessful()) { String sha = res.body().string().trim(); if (sha.matches("^[0-9a-f]{40}$")) ref = sha; }
            }
        } catch (Exception ignored) {}
        String base = "https://raw.githubusercontent.com/" + repo + "/" + ref + "/";
        JSONObject remote = new JSONObject(new String(fetch(base + "manifest.json"), StandardCharsets.UTF_8));
        String rv = remote.optString("version", "0");
        if (cmpVer(rv, local.optString("version", "0")) <= 0) return obj("status", "latest", "version", local.optString("version"));
        if (remote.has("minAndroid") && cmpVer(remote.optString("minAndroid"), BuildConfigShim.VERSION) > 0)
            return obj("status", "needs-installer", "version", rv, "message", "Bản cập nhật cần cài APK mới.");

        File files = ctx.getFilesDir();
        File live = new File(files, "content"), staging = new File(files, "content-next"), old = new File(files, "content-old");
        deleteRec(staging);
        staging.mkdirs();
        boolean fromDownloaded = server.useDownloaded();
        JSONObject rfiles = remote.optJSONObject("files");
        if (rfiles == null) rfiles = new JSONObject();
        List<String> todo = new ArrayList<>();
        Iterator<String> it = rfiles.keys();
        // copy what we already have (downloaded copy or APK assets) when the checksum still matches
        while (it.hasNext()) {
            String rel = it.next();
            JSONObject meta = rfiles.getJSONObject(rel);
            byte[] have = null;
            try {
                if (fromDownloaded) { File f = new File(live, rel); if (f.isFile()) have = ContentServer.readAll(new java.io.FileInputStream(f)); }
                else { InputStream in = ctx.getAssets().open("content/" + rel); have = ContentServer.readAll(in); }
            } catch (IOException ignored) {}
            if (have != null && have.length == meta.optLong("size", -1) && sha256(have).equals(meta.optString("sha256"))) write(new File(staging, rel), have);
            else todo.add(rel);
        }
        int done = 0;
        for (String rel : todo) {
            JSONObject meta = rfiles.getJSONObject(rel);
            if (progress != null) progress.on(obj("status", "downloading", "file", rel, "done", done, "total", todo.size(), "version", rv));
            StringBuilder enc = new StringBuilder();
            for (String part : rel.split("/")) { if (enc.length() > 0) enc.append('/'); enc.append(URLEncoder.encode(part, "UTF-8").replace("+", "%20")); }
            byte[] buf = fetch(base + "content/" + enc);
            if (!sha256(buf).equals(meta.optString("sha256"))) throw new IOException("Sai checksum: " + rel);
            write(new File(staging, rel), buf);
            done++;
        }
        remote.put("repo", repo); remote.put("branch", branch);
        write(new File(staging, "manifest.json"), remote.toString(2).getBytes(StandardCharsets.UTF_8));
        deleteRec(old);
        if (live.exists() && !live.renameTo(old)) throw new IOException("rename failed");
        if (!staging.renameTo(live)) throw new IOException("rename failed");
        deleteRec(old);
        server.invalidate();
        return obj("status", "updated", "version", rv, "files", todo.size(), "notes", remote.optString("notes", ""));
    }

    static JSONObject obj(Object... kv) {
        JSONObject o = new JSONObject();
        try { for (int i = 0; i + 1 < kv.length; i += 2) o.put(String.valueOf(kv[i]), kv[i + 1]); } catch (Exception ignored) {}
        return o;
    }
    static void write(File f, byte[] b) throws IOException {
        f.getParentFile().mkdirs();
        try (FileOutputStream o = new FileOutputStream(f)) { o.write(b); }
    }
    static void deleteRec(File f) {
        if (!f.exists()) return;
        File[] l = f.listFiles();
        if (l != null) for (File c : l) deleteRec(c);
        f.delete();
    }
    static String sha256(byte[] b) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] h = md.digest(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : h) sb.append(String.format("%02x", x));
        return sb.toString();
    }
}
