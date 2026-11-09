package com.approxtech.nebius;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * NEBIUS backend client. Pure java.net + org.json (no Android UI classes) so the exact class
 * shipped in the APK is also exercised on a JVM against a real backend (jvmtest/ApiJvmTest.java).
 * Blocking calls: always use from a background thread.
 *
 * Security: release builds accept only https:// servers; debug builds additionally allow
 * http://localhost and http://10.0.2.2 (emulator host) for local testing. The bearer token is a
 * per-device session token (client=mobile), never a password or an API key.
 */
public class Api {
    public static class ApiException extends Exception {
        public final int status;
        public final String code;
        public ApiException(int status, String code, String message) { super(message); this.status = status; this.code = code; }
        public boolean isOffline() { return status == 0 && "offline".equals(code); }
        public boolean isSessionExpired() { return status == 401; }
    }

    public static final String USER_AGENT = "NEBIUS-Android/0.1.0";
    private final String base;
    private volatile String token;

    public Api(String baseUrl, String token) { this.base = baseUrl.replaceAll("/+$", ""); this.token = token; }

    /** Validates a user-entered server URL. allowDevHttp is true only in debug builds. */
    public static String normalizeServer(String url, boolean allowDevHttp) throws ApiException {
        String u = url == null ? "" : url.trim().replaceAll("/+$", "");
        boolean devHttp = allowDevHttp && (u.startsWith("http://localhost") || u.startsWith("http://127.0.0.1") || u.startsWith("http://10.0.2.2"));
        if (!u.startsWith("https://") && !devHttp) throw new ApiException(0, "insecure_url", "Server URL must start with https://");
        try { new URL(u); } catch (IOException e) { throw new ApiException(0, "bad_url", "Invalid server URL"); }
        return u;
    }

    public void setToken(String t) { token = t; }
    public String getToken() { return token; }
    public String getBase() { return base; }
    public static String enc(String s) { try { return URLEncoder.encode(s, "UTF-8"); } catch (IOException e) { return s; } }

    private HttpURLConnection open(String method, String path) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(base + path).openConnection();
        String m = method;
        if ("PATCH".equals(method) || "PUT".equals(method) || "DELETE".equals(method)) {
            // Tunnel through POST: HttpURLConnection lacks PATCH and some stacks mangle bodies on DELETE.
            m = "POST";
            c.setRequestProperty("X-HTTP-Method-Override", method);
        }
        c.setRequestMethod(m);
        c.setConnectTimeout(15000);
        c.setReadTimeout(120000);
        c.setInstanceFollowRedirects(false);
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("User-Agent", USER_AGENT);
        if (token != null && token.length() > 0) c.setRequestProperty("Authorization", "Bearer " + token);
        return c;
    }

    private static byte[] readAll(InputStream in) throws IOException {
        if (in == null) return new byte[0];
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        in.close();
        return bo.toByteArray();
    }

    private JSONObject finish(HttpURLConnection c) throws ApiException, IOException {
        int status = c.getResponseCode();
        byte[] raw = readAll(status >= 400 ? c.getErrorStream() : c.getInputStream());
        String text = new String(raw, StandardCharsets.UTF_8);
        JSONObject body;
        try { body = text.length() > 0 ? new JSONObject(text) : new JSONObject(); }
        catch (JSONException e) { body = new JSONObject(); }
        if (status >= 400) {
            JSONObject err = body.optJSONObject("error");
            throw new ApiException(status, err != null ? err.optString("code", "error") : "http_" + status, err != null ? err.optString("message", "Request failed") : "HTTP " + status);
        }
        return body;
    }

    public JSONObject request(String method, String path, JSONObject body) throws ApiException {
        HttpURLConnection c = null;
        try {
            c = open(method, path);
            if (body != null) {
                byte[] b = body.toString().getBytes(StandardCharsets.UTF_8);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                c.setFixedLengthStreamingMode(b.length);
                OutputStream o = c.getOutputStream();
                o.write(b);
                o.close();
            }
            return finish(c);
        } catch (ApiException e) {
            throw e;
        } catch (IOException e) {
            throw new ApiException(0, "offline", "Cannot reach the NEBIUS server. Check your connection.");
        } finally {
            if (c != null) c.disconnect();
        }
    }

    public JSONObject get(String path) throws ApiException { return request("GET", path, null); }
    public JSONObject post(String path, JSONObject body) throws ApiException { return request("POST", path, body == null ? new JSONObject() : body); }
    public JSONObject patch(String path, JSONObject body) throws ApiException { return request("PATCH", path, body); }
    public JSONObject put(String path, JSONObject body) throws ApiException { return request("PUT", path, body); }
    public JSONObject delete(String path) throws ApiException { return request("DELETE", path, new JSONObject()); }

    /** Streams an upload of raw bytes into a project folder. */
    public JSONObject upload(String projectId, String folderId, String filename, InputStream data, long length) throws ApiException {
        HttpURLConnection c = null;
        try {
            String q = "?name=" + enc(filename) + (folderId != null && folderId.length() > 0 ? "&folder_id=" + enc(folderId) : "");
            c = open("PUT", "/api/projects/" + enc(projectId) + "/upload" + q);
            c.setRequestMethod("PUT");
            c.setRequestProperty("X-HTTP-Method-Override", "PUT");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/octet-stream");
            if (length >= 0) c.setFixedLengthStreamingMode(length); else c.setChunkedStreamingMode(64 * 1024);
            OutputStream o = c.getOutputStream();
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = data.read(buf)) > 0) o.write(buf, 0, n);
            o.close();
            data.close();
            return finish(c);
        } catch (ApiException e) {
            throw e;
        } catch (IOException e) {
            throw new ApiException(0, "offline", "Upload failed: " + e.getMessage());
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** Returns an absolute, short-lived signed download URL (no credentials inside). */
    public String downloadUrl(String projectId, String fileId) throws ApiException {
        return base + post("/api/projects/" + enc(projectId) + "/files/" + enc(fileId) + "/download-url", null).optString("url");
    }
}
