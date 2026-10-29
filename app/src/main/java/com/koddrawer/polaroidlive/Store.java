package com.koddrawer.polaroidlive;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;

/** settings.json + small state files, same semantics as the desktop main process. */
public class Store {
    private final Context ctx;
    private JSONObject settings;

    public Store(Context ctx) {
        this.ctx = ctx;
        String s = ContentServer.readFile(file());
        try { settings = s == null ? new JSONObject() : new JSONObject(s); } catch (Exception e) { settings = new JSONObject(); }
    }
    private File file() { return new File(ctx.getFilesDir(), "settings.json"); }

    public synchronized String get() { return ContentServer.rewrite(settings.toString()); }

    public synchronized String merge(String patchJson) throws Exception {
        Object patch = new JSONTokenerShim(patchJson).value();
        if (patch instanceof JSONObject) settings = (JSONObject) deepMerge(settings, patch);
        save();
        return get();
    }
    public synchronized String replace(String key, String valueJson) throws Exception {
        settings.put(key, new JSONTokenerShim(valueJson).value());
        save();
        return get();
    }
    private void save() {
        try {
            File tmp = new File(file().getPath() + ".tmp");
            Updater.write(tmp, settings.toString().getBytes(StandardCharsets.UTF_8));
            tmp.renameTo(file());
        } catch (Exception ignored) {}
    }

    static Object deepMerge(Object a, Object b) throws Exception {
        if (!(b instanceof JSONObject)) return b;
        JSONObject out = new JSONObject();
        if (a instanceof JSONObject) {
            JSONObject ao = (JSONObject) a;
            Iterator<String> it = ao.keys();
            while (it.hasNext()) { String k = it.next(); out.put(k, ao.get(k)); }
        }
        JSONObject bo = (JSONObject) b;
        Iterator<String> it = bo.keys();
        while (it.hasNext()) { String k = it.next(); out.put(k, deepMerge(out.opt(k), bo.get(k))); }
        return out;
    }

    // ---- state (gallery etc.)
    private File stateFile(String key) { return new File(new File(ctx.getFilesDir(), "state"), key.replaceAll("[^\\w-]", "_") + ".json"); }
    public String loadState(String key) {
        String s = ContentServer.readFile(stateFile(key));
        return s == null ? "null" : ContentServer.rewrite(s);
    }
    public void saveState(String key, String json) throws Exception {
        Updater.write(stateFile(key), json.getBytes(StandardCharsets.UTF_8));
    }

    /** org.json parse of any JSON value (object, array, string, number, null) */
    static class JSONTokenerShim {
        private final String s;
        JSONTokenerShim(String s) { this.s = s; }
        Object value() throws Exception {
            Object v = new org.json.JSONTokener(s).nextValue();
            return v == null ? JSONObject.NULL : v;
        }
    }
    static JSONArray arr(String json) throws Exception { return new JSONArray(json); }
}
