import com.approxtech.nebius.Api;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Exercises the Android app's network layer (Api.java — the exact class compiled into the APK) on a JVM
 * against a running NEBIUS backend. Usage: java ApiJvmTest <baseUrl> <email> <password>
 * The account must exist and be verified. Covers the flows the APK uses.
 */
public class ApiJvmTest {
    static int fails = 0;
    static void check(boolean ok, String name) { System.out.println((ok ? "PASS " : "FAIL ") + name); if (!ok) fails++; }

    public static void main(String[] a) throws Exception {
        try { Api.normalizeServer("http://evil.example", false); check(false, "https enforced"); } catch (Api.ApiException e) { check("insecure_url".equals(e.code), "release: https enforced for server URL"); }
        try { Api.normalizeServer("http://evil.example", true); check(false, "debug http limited"); } catch (Api.ApiException e) { check("insecure_url".equals(e.code), "debug: http only for localhost/10.0.2.2"); }
        check(Api.normalizeServer("http://10.0.2.2:8090/", true).equals("http://10.0.2.2:8090"), "debug: emulator host allowed");
        Api api = new Api(a[0], null);
        check("NEBIUS".equals(api.get("/api/version").optString("product")), "server probe identifies NEBIUS");
        try { api.post("/api/auth/login", new JSONObject().put("email", a[1]).put("password", "wrong-pass-123").put("client", "mobile")); check(false, "bad login"); }
        catch (Api.ApiException e) { check(e.status == 401, "bad login rejected (401)"); }
        JSONObject login = api.post("/api/auth/login", new JSONObject().put("email", a[1]).put("password", a[2]).put("client", "mobile"));
        api.setToken(login.getString("token"));
        check(login.getString("token").length() > 30 && login.optLong("session_expires_at") > System.currentTimeMillis(), "mobile login → bearer token + expiry");
        JSONObject d = api.get("/api/dashboard");
        check(d.has("gpu_providers") && d.getJSONObject("host").has("cpu"), "dashboard");
        JSONArray orgs = api.get("/api/orgs").getJSONArray("organizations");
        JSONObject p = api.post("/api/projects", new JSONObject().put("org_id", orgs.getJSONObject(0).getString("id")).put("name", "Android Test " + System.currentTimeMillis() % 100000)).getJSONObject("project");
        String pid = p.getString("id");
        check(pid.startsWith("prj_"), "create project");
        check(api.patch("/api/projects/" + pid, new JSONObject().put("description", "from android")).getJSONObject("project").getString("description").equals("from android"), "PATCH via method override");
        JSONObject folder = api.post("/api/projects/" + pid + "/folders", new JSONObject().put("name", "phone")).getJSONObject("folder");
        byte[] data = "hello from the NEBIUS android client\n".getBytes("UTF-8");
        JSONObject up = api.upload(pid, folder.getString("id"), "note.txt", new ByteArrayInputStream(data), data.length).getJSONObject("file");
        MessageDigest md = MessageDigest.getInstance("SHA-256"); StringBuilder hex = new StringBuilder(); for (byte b : md.digest(data)) hex.append(String.format("%02x", b));
        check(hex.toString().equals(up.getString("sha256")), "streamed upload, server SHA-256 matches");
        String url = api.downloadUrl(pid, up.getString("id"));
        InputStream in = new URL(url).openStream(); byte[] got = in.readAllBytes(); in.close();
        check(new String(got, "UTF-8").equals(new String(data, "UTF-8")), "signed download URL (no credentials needed)");
        check(api.post("/api/projects/" + pid + "/files/" + up.getString("id") + "/verify", null).getBoolean("ok"), "integrity verify");
        JSONObject browse = api.get("/api/projects/" + pid + "/browse?folder_id=" + folder.getString("id"));
        check(browse.getJSONArray("files").length() == 1, "browse folder");
        check(api.delete("/api/projects/" + pid + "/files/" + up.getString("id")).optString("status").equals("trashed"), "DELETE via method override");
        JSONObject gpu = api.get("/api/gpu/availability?min_vram_gb=14");
        check(gpu.has("available"), "GPU availability (" + (gpu.optBoolean("available") ? "available" : gpu.optString("message")) + ")");
        check(api.get("/api/providers").getJSONArray("providers").length() > 5, "provider list");
        JSONObject nick = api.get("/api/projects/" + pid + "/nick48");
        check("NOT_IMPORTED".equals(nick.getString("nick48_status")), "training status (" + nick.getString("nick48_status") + ")");
        check(api.get("/api/projects/" + pid + "/jobs").has("jobs"), "jobs list");
        check(api.get("/api/projects/" + pid + "/logs?type=audit").getJSONArray("logs").length() > 0, "project logs");
        check(api.get("/api/notifications").has("unread"), "notifications");
        api.post("/api/auth/logout", null);
        try { api.get("/api/dashboard"); check(false, "session revoked"); } catch (Api.ApiException e) { check(e.isSessionExpired(), "after logout the token is rejected (401 → session expired path)"); }
        Api offline = new Api("http://127.0.0.1:9", null);
        try { offline.get("/api/version"); check(false, "offline"); } catch (Api.ApiException e) { check(e.isOffline(), "offline error state detected"); }
        System.out.println(fails == 0 ? "ALL PASSED" : fails + " FAILED");
        System.exit(fails == 0 ? 0 : 1);
    }
}
