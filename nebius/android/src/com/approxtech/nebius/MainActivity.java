package com.approxtech.nebius;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * NEBIUS Android management client. All screens are built in code (no XML layouts, no WebView,
 * no third-party libraries). GPU work never runs on the phone: this app manages the platform.
 */
public class MainActivity extends Activity {
    // palette (dark)
    static final int BG = 0xFF0B1220, SURFACE = 0xFF121B2E, SURFACE2 = 0xFF18233A, TEXT = 0xFFE6ECF8, MUTED = 0xFF93A2BF,
            PRIMARY = 0xFF6B8CFF, ACCENT = 0xFF2DD4BF, DANGER = 0xFFFF6B7A, WARN = 0xFFFFD27A, BORDER = 0xFF26334F;
    static final int REQ_UPLOAD = 41, REQ_NOTIF = 42;

    interface Call { Object run() throws Exception; }
    interface Done { void ok(Object r); }

    private final ExecutorService pool = Executors.newFixedThreadPool(3);
    private final Handler ui = new Handler(Looper.getMainLooper());
    private SecureStore store;
    private Api api;
    private boolean debugBuild;

    private LinearLayout root, body, bottomNav;
    private TextView titleView, projectChip;
    private String screen = "dashboard";
    private String arg = null;           // screen argument (folder id, job id…)
    private final List<String[]> folderStack = new ArrayList<String[]>();
    private int lastUnread = -1;
    private Runnable poller;

    // ---------------------------------------------------------------- lifecycle
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        store = new SecureStore(this);
        debugBuild = getResources().getBoolean(getResources().getIdentifier("debug_build", "bool", getPackageName()));
        getWindow().getDecorView().setBackgroundColor(BG);
        showSplash();
    }

    @Override protected void onResume() { super.onResume(); startPolling(); }
    @Override protected void onPause() { super.onPause(); if (poller != null) ui.removeCallbacks(poller); }

    private void showSplash() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL); l.setGravity(Gravity.CENTER); l.setBackgroundColor(BG);
        ImageView logo = new ImageView(this);
        logo.setImageResource(getResources().getIdentifier("ic_launcher", "mipmap", getPackageName()));
        l.addView(logo, new LinearLayout.LayoutParams(dp(96), dp(96)));
        TextView t = text("NEBIUS", 28, TEXT, true); t.setGravity(Gravity.CENTER); t.setLetterSpacing(0.15f); l.addView(t);
        TextView s = text("AI cloud console · v" + versionName(), 14, MUTED, false); s.setGravity(Gravity.CENTER); l.addView(s);
        TextView n = text("Provisional internal name — not affiliated with Nebius Group", 11, MUTED, false); n.setGravity(Gravity.CENTER); n.setPadding(dp(24), dp(24), dp(24), 0); l.addView(n);
        setContentView(l);
        ui.postDelayed(new Runnable() { public void run() { boot(); } }, 900);
    }

    private void boot() {
        String server = store.get("server", getString(getResources().getIdentifier("default_server_url", "string", getPackageName())));
        if (server == null || server.length() == 0) { showServerSetup(null); return; }
        api = new Api(server, store.getToken());
        if (api.getToken() == null) { showLogin(null); return; }
        long exp = Long.parseLong(store.get("session_expires_at", "0"));
        if (exp > 0 && exp < System.currentTimeMillis()) { logoutLocal(); showLogin("Your session expired. Please sign in again."); return; }
        buildShell();
        show("dashboard", null);
    }

    // ---------------------------------------------------------------- async helpers
    private void async(final Call call, final Done done) {
        pool.execute(new Runnable() { public void run() {
            try {
                final Object r = call.run();
                ui.post(new Runnable() { public void run() { if (!isFinishing()) done.ok(r); } });
            } catch (final Exception e) {
                ui.post(new Runnable() { public void run() { if (!isFinishing()) handleError(e); } });
            }
        } });
    }

    private void handleError(Exception e) {
        if (e instanceof Api.ApiException) {
            Api.ApiException a = (Api.ApiException) e;
            if (a.isSessionExpired() && api != null && api.getToken() != null) { logoutLocal(); showLogin("Your session expired. Please sign in again."); return; }
            if (a.isOffline() && body != null) { showOffline(a.getMessage()); return; }
            toast(a.getMessage());
            return;
        }
        toast("Error: " + e.getMessage());
    }

    private void showOffline(String msg) {
        body.removeAllViews();
        LinearLayout c = card(); body.addView(c);
        c.addView(text("You're offline", 20, TEXT, true));
        c.addView(text(msg, 14, MUTED, false));
        c.addView(button("Retry", true, new View.OnClickListener() { public void onClick(View v) { show(screen, arg); } }));
    }

    // ---------------------------------------------------------------- server + auth
    private void showServerSetup(String error) {
        LinearLayout f = authFrame("Connect to your NEBIUS server");
        if (error != null) f.addView(text(error, 13, DANGER, false));
        final EditText url = input("https://nebius.example.com", InputType.TYPE_TEXT_VARIATION_URI);
        url.setText(store.get("server", ""));
        f.addView(label("Server URL")); f.addView(url);
        if (debugBuild) f.addView(text("Debug build: http://10.0.2.2:8090 (emulator) or http://localhost is allowed for testing.", 12, MUTED, false));
        f.addView(button("Continue", true, new View.OnClickListener() { public void onClick(View v) {
            try {
                final String u = Api.normalizeServer(url.getText().toString(), debugBuild);
                final Api probe = new Api(u, null);
                async(new Call() { public Object run() throws Exception { return probe.get("/api/version"); } }, new Done() { public void ok(Object r) {
                    JSONObject j = (JSONObject) r;
                    if (!"NEBIUS".equals(j.optString("product"))) { showServerSetup("That server is not a NEBIUS server."); return; }
                    store.put("server", u); api = new Api(u, null); showLogin(null);
                } });
            } catch (Api.ApiException e) { showServerSetup(e.getMessage()); }
        } }));
    }

    private void showLogin(String msg) {
        LinearLayout f = authFrame("Sign in");
        if (msg != null) f.addView(text(msg, 13, WARN, false));
        final EditText email = input("you@example.com", InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        final EditText pw = input("Password", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        f.addView(label("Email")); f.addView(email); f.addView(label("Password")); f.addView(pw);
        f.addView(button("Sign in", true, new View.OnClickListener() { public void onClick(View v) {
            final String e = email.getText().toString().trim(), p = pw.getText().toString();
            async(new Call() { public Object run() throws Exception {
                return api.post("/api/auth/login", new JSONObject().put("email", e).put("password", p).put("client", "mobile"));
            } }, new Done() { public void ok(Object r) {
                JSONObject j = (JSONObject) r;
                store.setToken(j.optString("token"));
                store.put("session_expires_at", String.valueOf(j.optLong("session_expires_at")));
                api.setToken(j.optString("token"));
                requestNotificationPermission();
                buildShell(); show("dashboard", null);
            } });
        } }));
        f.addView(button("Create account", false, new View.OnClickListener() { public void onClick(View v) { showRegister(); } }));
        f.addView(button("Forgot password", false, new View.OnClickListener() { public void onClick(View v) { showReset(); } }));
        f.addView(button("Change server (" + api.getBase() + ")", false, new View.OnClickListener() { public void onClick(View v) { showServerSetup(null); } }));
    }

    private void showRegister() {
        LinearLayout f = authFrame("Create account");
        final EditText name = input("Your name", InputType.TYPE_CLASS_TEXT);
        final EditText email = input("you@example.com", InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        final EditText pw = input("10+ characters, letters and numbers", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        f.addView(label("Name")); f.addView(name); f.addView(label("Email")); f.addView(email); f.addView(label("Password")); f.addView(pw);
        f.addView(button("Create account", true, new View.OnClickListener() { public void onClick(View v) {
            async(new Call() { public Object run() throws Exception {
                return api.post("/api/auth/signup", new JSONObject().put("display_name", name.getText().toString()).put("email", email.getText().toString().trim()).put("password", pw.getText().toString()));
            } }, new Done() { public void ok(Object r) { toast(((JSONObject) r).optString("message")); showVerify(); } });
        } }));
        f.addView(button("Back to sign in", false, new View.OnClickListener() { public void onClick(View v) { showLogin(null); } }));
    }

    private void showVerify() {
        LinearLayout f = authFrame("Verify your email");
        f.addView(text("Paste the verification code from the email we sent you.", 14, MUTED, false));
        final EditText code = input("Verification code", InputType.TYPE_CLASS_TEXT);
        f.addView(code);
        f.addView(button("Verify", true, new View.OnClickListener() { public void onClick(View v) {
            async(new Call() { public Object run() throws Exception { return api.post("/api/auth/verify-email", new JSONObject().put("token", code.getText().toString().trim())); } },
                    new Done() { public void ok(Object r) { showLogin("Email verified — you can sign in now."); } });
        } }));
        f.addView(button("Back to sign in", false, new View.OnClickListener() { public void onClick(View v) { showLogin(null); } }));
    }

    private void showReset() {
        LinearLayout f = authFrame("Reset password");
        final EditText email = input("you@example.com", InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        final EditText code = input("Reset code (from email)", InputType.TYPE_CLASS_TEXT);
        final EditText pw = input("New password", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        f.addView(email);
        f.addView(button("Email me a reset code", false, new View.OnClickListener() { public void onClick(View v) {
            async(new Call() { public Object run() throws Exception { return api.post("/api/auth/forgot-password", new JSONObject().put("email", email.getText().toString().trim())); } },
                    new Done() { public void ok(Object r) { toast(((JSONObject) r).optString("message")); } });
        } }));
        f.addView(code); f.addView(pw);
        f.addView(button("Set new password", true, new View.OnClickListener() { public void onClick(View v) {
            async(new Call() { public Object run() throws Exception { return api.post("/api/auth/reset-password", new JSONObject().put("token", code.getText().toString().trim()).put("password", pw.getText().toString())); } },
                    new Done() { public void ok(Object r) { showLogin("Password changed. Sign in with your new password."); } });
        } }));
        f.addView(button("Back to sign in", false, new View.OnClickListener() { public void onClick(View v) { showLogin(null); } }));
    }

    private void logoutLocal() { store.setToken(null); store.put("session_expires_at", "0"); if (api != null) api.setToken(null); body = null; }

    // ---------------------------------------------------------------- shell: top bar + body + three-button nav
    private void buildShell() {
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(BG);
        LinearLayout top = new LinearLayout(this); top.setGravity(Gravity.CENTER_VERTICAL); top.setPadding(dp(12), dp(10), dp(8), dp(10)); top.setBackgroundColor(0xFF070D19);
        titleView = text("NEBIUS", 18, TEXT, true);
        top.addView(titleView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        projectChip = text("Project ▾", 13, PRIMARY, true); projectChip.setPadding(dp(10), dp(6), dp(10), dp(6));
        projectChip.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { pickProject(); } });
        top.addView(projectChip);
        TextView bell = text("🔔", 18, TEXT, false); bell.setPadding(dp(10), dp(4), dp(10), dp(4)); bell.setContentDescription("Notifications");
        bell.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { show("notifications", null); } });
        top.addView(bell);
        TextView menu = text("☰", 20, TEXT, false); menu.setPadding(dp(10), dp(4), dp(6), dp(4)); menu.setContentDescription("All modules");
        menu.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { openMenu(); } });
        top.addView(menu);
        root.addView(top);
        ScrollView sv = new ScrollView(this); sv.setFillViewport(true);
        body = new LinearLayout(this); body.setOrientation(LinearLayout.VERTICAL); body.setPadding(dp(12), dp(12), dp(12), dp(24));
        sv.addView(body);
        root.addView(sv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        bottomNav = new LinearLayout(this); bottomNav.setBackgroundColor(SURFACE);
        String[][] items = { { "dashboard", "◧\nDashboard" }, { "projects", "▤\nProjects" }, { "compute", "⚙\nCompute" } };
        for (final String[] it : items) {
            TextView b = text(it[1], 13, MUTED, false); b.setGravity(Gravity.CENTER); b.setPadding(0, dp(8), 0, dp(10)); b.setTag(it[0]);
            b.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { show(it[0], null); } });
            bottomNav.addView(b, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        }
        root.addView(bottomNav);
        setContentView(root);
        refreshProjectChip();
    }

    private void openMenu() {
        final String[] ids = { "files", "notebooks", "training", "jobs", "logs", "notifications", "settings", "profile" };
        final String[] labels = { "Storage & Files", "Notebooks", "AI Training (Nick 4.8)", "Jobs", "Logs", "Notifications", "Settings", "Profile" };
        new AlertDialog.Builder(this).setTitle("NEBIUS modules").setItems(labels, new DialogInterface.OnClickListener() { public void onClick(DialogInterface d, int i) { show(ids[i], null); } }).show();
    }

    private String projectId() { return store.get("project", ""); }
    private void refreshProjectChip() { if (projectChip != null) projectChip.setText((store.get("project_name", "").length() > 0 ? store.get("project_name", "") : "Select project") + " ▾"); }

    private void pickProject() {
        async(new Call() { public Object run() throws Exception { return api.get("/api/projects"); } }, new Done() { public void ok(Object r) {
            final JSONArray ps = ((JSONObject) r).optJSONArray("projects");
            if (ps == null || ps.length() == 0) { toast("No projects yet — create one in Projects."); show("projects", null); return; }
            String[] names = new String[ps.length()];
            for (int i = 0; i < ps.length(); i++) names[i] = ps.optJSONObject(i).optString("name") + "  (" + ps.optJSONObject(i).optString("project_code") + ")";
            new AlertDialog.Builder(MainActivity.this).setTitle("Select project").setItems(names, new DialogInterface.OnClickListener() { public void onClick(DialogInterface d, int i) {
                selectProject(ps.optJSONObject(i)); show(screen, null);
            } }).show();
        } });
    }
    private void selectProject(JSONObject p) { store.put("project", p.optString("id")); store.put("project_name", p.optString("name")); folderStack.clear(); refreshProjectChip(); }

    private boolean needProject() {
        if (projectId().length() > 0) return true;
        LinearLayout c = card(); body.addView(c);
        c.addView(text("Select a project first", 16, TEXT, true));
        c.addView(button("Choose project", true, new View.OnClickListener() { public void onClick(View v) { pickProject(); } }));
        return false;
    }

    private void show(String name, String a) {
        if (body == null) buildShell();
        screen = name; arg = a;
        for (int i = 0; i < bottomNav.getChildCount(); i++) { TextView t = (TextView) bottomNav.getChildAt(i); t.setTextColor(name.equals(t.getTag()) ? PRIMARY : MUTED); }
        body.removeAllViews();
        ProgressBar pb = new ProgressBar(this); body.addView(pb);
        titleView.setText(titleFor(name));
        if ("dashboard".equals(name)) dashboard();
        else if ("projects".equals(name)) projects();
        else if ("project".equals(name)) projectDetail(a);
        else if ("compute".equals(name)) compute();
        else if ("files".equals(name)) files();
        else if ("notebooks".equals(name)) notebooks();
        else if ("training".equals(name)) training();
        else if ("jobs".equals(name)) jobs();
        else if ("job".equals(name)) jobDetail(a);
        else if ("logs".equals(name)) logs();
        else if ("notifications".equals(name)) notifications();
        else if ("settings".equals(name)) settings();
        else if ("profile".equals(name)) profile();
    }
    private String titleFor(String n) {
        if ("compute".equals(n)) return "Compute Engine"; if ("files".equals(n)) return "Files"; if ("training".equals(n)) return "AI Training";
        if ("job".equals(n)) return "Job"; if ("project".equals(n)) return "Project";
        return n.substring(0, 1).toUpperCase() + n.substring(1);
    }
    private void clearBody() { body.removeAllViews(); }

    // ---------------------------------------------------------------- screens
    private void dashboard() {
        async(new Call() { public Object run() throws Exception { return api.get("/api/dashboard"); } }, new Done() { public void ok(Object r) {
            JSONObject d = (JSONObject) r; clearBody();
            JSONObject g = d.optJSONObject("gpu_providers");
            if ("NO FREE GPU AVAILABLE".equals(g.optString("status"))) banner("NO FREE GPU AVAILABLE — GPU jobs wait until an eligible free provider is verified, enabled and healthy.", WARN);
            JSONObject host = d.optJSONObject("host");
            LinearLayout grid = card(); body.addView(grid);
            statRow(grid, "Projects", String.valueOf(d.optInt("projects")));
            statRow(grid, "Free GPU providers ready", g.optInt("free_eligible_dispatchable") + " / " + g.optInt("listed"));
            statRow(grid, "Active GPU jobs", d.optInt("active_gpu_jobs") + (d.optInt("waiting_for_gpu") > 0 ? "  (" + d.optInt("waiting_for_gpu") + " waiting)" : ""));
            statRow(grid, "Running instances", String.valueOf(d.optInt("running_instances")));
            statRow(grid, "Storage used", bytes(d.optLong("storage_bytes")));
            JSONObject cpu = host.optJSONObject("cpu"), mem = host.optJSONObject("memory"), gpu = host.optJSONObject("gpu");
            statRow(grid, "Host CPU", cpu.isNull("usage_pct") ? "unavailable" : cpu.optDouble("usage_pct") + "%");
            statRow(grid, "Host RAM", mem.optDouble("used_pct") + "%");
            statRow(grid, "Host GPU", gpu.optBoolean("available") ? "available" : "unavailable — " + gpu.optString("reason"));
            section("Recent jobs");
            JSONArray jobs = d.optJSONArray("recent_jobs");
            if (jobs.length() == 0) body.addView(text("No jobs yet.", 14, MUTED, false));
            for (int i = 0; i < jobs.length(); i++) { final JSONObject j = jobs.optJSONObject(i); listItem(j.optString("name"), j.optString("status") + " · " + ago(j.optLong("created_at")), new View.OnClickListener() { public void onClick(View v) { store.put("project", j.optString("project_id")); show("job", j.optString("id")); } }); }
            section("Recent activity");
            JSONArray act = d.optJSONArray("recent_activity");
            for (int i = 0; i < Math.min(8, act.length()); i++) { JSONObject a = act.optJSONObject(i); listItem(a.optString("action"), (a.isNull("actor") ? "system" : a.optString("actor")) + " · " + ago(a.optLong("created_at")), null); }
        } });
    }

    private void projects() {
        async(new Call() { public Object run() throws Exception { return new JSONObject().put("p", api.get("/api/projects?include_archived=1")).put("o", api.get("/api/orgs")); } }, new Done() { public void ok(Object r) {
            clearBody();
            final JSONArray ps = ((JSONObject) r).optJSONObject("p").optJSONArray("projects");
            final JSONArray orgs = ((JSONObject) r).optJSONObject("o").optJSONArray("organizations");
            body.addView(button("+ Create project", true, new View.OnClickListener() { public void onClick(View v) {
                prompt("Create project", new String[] { "Project name", "Description" }, new Done() { public void ok(Object vals) {
                    final String[] s = (String[]) vals;
                    async(new Call() { public Object run() throws Exception { return api.post("/api/projects", new JSONObject().put("org_id", orgs.optJSONObject(0).optString("id")).put("name", s[0]).put("description", s[1])); } },
                            new Done() { public void ok(Object x) { selectProject(((JSONObject) x).optJSONObject("project")); toast("Project created"); show("projects", null); } });
                } });
            } }));
            if (ps.length() == 0) body.addView(text("No projects yet.", 14, MUTED, false));
            for (int i = 0; i < ps.length(); i++) {
                final JSONObject p = ps.optJSONObject(i);
                listItem((p.optString("id").equals(projectId()) ? "● " : "") + p.optString("name"), p.optString("project_code") + " · " + p.optString("status") + " · " + p.optString("my_role"), new View.OnClickListener() { public void onClick(View v) { selectProject(p); show("project", p.optString("id")); } });
            }
        } });
    }

    private void projectDetail(final String id) {
        async(new Call() { public Object run() throws Exception { return api.get("/api/projects/" + id); } }, new Done() { public void ok(Object r) {
            clearBody();
            final JSONObject p = ((JSONObject) r).optJSONObject("project"); JSONObject res = ((JSONObject) r).optJSONObject("resources");
            LinearLayout c = card(); body.addView(c);
            c.addView(text(p.optString("name"), 20, TEXT, true));
            c.addView(text(p.optString("description"), 14, MUTED, false));
            statRow(c, "Project ID", p.optString("project_code")); statRow(c, "Status", p.optString("status")); statRow(c, "Your role", p.optString("my_role"));
            statRow(c, "Files", String.valueOf(res.optInt("files"))); statRow(c, "Storage", bytes(res.optLong("storage_bytes")));
            statRow(c, "Instances", res.optInt("instances") + " (" + res.optInt("running_instances") + " running)"); statRow(c, "Jobs", res.optInt("jobs") + " (" + res.optInt("active_jobs") + " active)");
            final boolean archived = "archived".equals(p.optString("status"));
            body.addView(button("Open files", false, nav("files"))); body.addView(button("AI Training", false, nav("training"))); body.addView(button("Jobs", false, nav("jobs")));
            body.addView(button(archived ? "Unarchive project" : "Archive project", false, new View.OnClickListener() { public void onClick(View v) {
                confirm(archived ? "Unarchive project?" : "Archive project? It becomes read-only.", new Runnable() { public void run() {
                    async(new Call() { public Object run() throws Exception { return api.post("/api/projects/" + id + (archived ? "/unarchive" : "/archive"), null); } }, new Done() { public void ok(Object x) { show("project", id); } });
                } });
            } }));
        } });
    }

    private void compute() {
        async(new Call() { public Object run() throws Exception {
            JSONObject o = new JSONObject().put("gpu", api.get("/api/gpu/availability?min_vram_gb=14")).put("prov", api.get("/api/providers"));
            if (projectId().length() > 0) o.put("inst", api.get("/api/projects/" + projectId() + "/instances"));
            return o;
        } }, new Done() { public void ok(Object r) {
            clearBody(); JSONObject o = (JSONObject) r;
            JSONObject g = o.optJSONObject("gpu");
            if (!g.optBoolean("available")) banner("NO FREE GPU AVAILABLE", WARN); else banner("Free GPU available via " + g.optString("provider"), ACCENT);
            section("VM instances");
            if (o.has("inst")) {
                body.addView(button("+ Create CPU instance", true, new View.OnClickListener() { public void onClick(View v) {
                    prompt("Create instance (local Docker CPU sandbox, cpu-small)", new String[] { "Name (lowercase, e.g. worker-1)" }, new Done() { public void ok(Object vals) {
                        final String n = ((String[]) vals)[0];
                        async(new Call() { public Object run() throws Exception { return api.post("/api/projects/" + projectId() + "/instances", new JSONObject().put("name", n).put("provider_id", "local-docker-cpu").put("machine_type", "cpu-small").put("image", "alpine:3.20")); } },
                                new Done() { public void ok(Object x) { toast("Instance " + ((JSONObject) x).optJSONObject("instance").optString("status")); show("compute", null); } });
                    } });
                } }));
                JSONArray inst = o.optJSONObject("inst").optJSONArray("instances");
                if (inst.length() == 0) body.addView(text("No instances in this project.", 14, MUTED, false));
                for (int i = 0; i < inst.length(); i++) {
                    final JSONObject in = inst.optJSONObject(i);
                    listItem(in.optString("name") + "  [" + in.optString("status") + "]", in.optString("machine_type") + " · " + in.optString("provider_id") + " · GPU: " + (in.isNull("gpu") ? "none" : in.optString("gpu")), new View.OnClickListener() { public void onClick(View v) { instanceActions(in); } });
                }
            } else body.addView(text("Select a project to manage its instances.", 14, MUTED, false));
            section("GPU providers (free-only policy)");
            JSONArray ps = o.optJSONObject("prov").optJSONArray("providers");
            for (int i = 0; i < ps.length(); i++) {
                JSONObject p = ps.optJSONObject(i);
                JSONObject h = p.optJSONObject("health");
                listItem(p.optString("name"), p.optString("free_only_status") + " · health: " + (h == null ? "never checked" : h.optString("status")) + (p.optBoolean("dispatchable") ? " · READY" : ""), null);
            }
        } });
    }

    private void instanceActions(final JSONObject in) {
        final String base = "/api/projects/" + projectId() + "/instances/" + in.optString("id");
        final String[] acts = { "Start", "Stop", "Restart", "Delete" };
        new AlertDialog.Builder(this).setTitle(in.optString("name") + " — " + in.optString("status")).setItems(acts, new DialogInterface.OnClickListener() { public void onClick(DialogInterface d, final int i) {
            Runnable go = new Runnable() { public void run() {
                async(new Call() { public Object run() throws Exception { return i == 3 ? api.delete(base) : api.post(base + "/" + acts[i].toLowerCase(), null); } },
                        new Done() { public void ok(Object x) { JSONObject j = (JSONObject) x; toast(j.has("instance") ? acts[i] + ": " + j.optJSONObject("instance").optString("status") : "Deleted"); show("compute", null); } });
            } };
            if (i == 3) confirm("Delete " + in.optString("name") + "?", go); else go.run();
        } }).show();
    }

    private void files() {
        if (!needProject()) { body.removeViewAt(0); return; }
        final String folder = folderStack.isEmpty() ? "" : folderStack.get(folderStack.size() - 1)[0];
        async(new Call() { public Object run() throws Exception { return api.get("/api/projects/" + projectId() + "/browse" + (folder.length() > 0 ? "?folder_id=" + folder : "")); } }, new Done() { public void ok(Object r) {
            clearBody(); JSONObject d = (JSONObject) r;
            JSONObject st = d.optJSONObject("storage");
            body.addView(text(bytes(st.optLong("used_bytes")) + " of " + bytes(st.optLong("quota_bytes")) + " used", 12, MUTED, false));
            StringBuilder path = new StringBuilder("/");
            for (String[] f : folderStack) path.append(f[1]).append("/");
            body.addView(text(path.toString(), 14, ACCENT, true));
            LinearLayout row = new LinearLayout(MainActivity.this);
            row.addView(button("⇪ Upload", true, new View.OnClickListener() { public void onClick(View v) {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("*/*");
                startActivityForResult(i, REQ_UPLOAD);
            } }), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            row.addView(button("+ Folder", false, new View.OnClickListener() { public void onClick(View v) {
                prompt("New folder", new String[] { "Folder name" }, new Done() { public void ok(Object vals) {
                    final String n = ((String[]) vals)[0];
                    async(new Call() { public Object run() throws Exception { JSONObject b = new JSONObject().put("name", n); if (folder.length() > 0) b.put("parent_id", folder); return api.post("/api/projects/" + projectId() + "/folders", b); } },
                            new Done() { public void ok(Object x) { show("files", null); } });
                } });
            } }), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            body.addView(row);
            if (!folderStack.isEmpty()) listItem("⬑  ..", "Up one level", new View.OnClickListener() { public void onClick(View v) { folderStack.remove(folderStack.size() - 1); show("files", null); } });
            JSONArray fs = d.optJSONArray("folders"), fl = d.optJSONArray("files");
            for (int i = 0; i < fs.length(); i++) { final JSONObject f = fs.optJSONObject(i); listItem("🗀  " + f.optString("name"), "folder", new View.OnClickListener() { public void onClick(View v) { folderStack.add(new String[] { f.optString("id"), f.optString("name") }); show("files", null); } }); }
            for (int i = 0; i < fl.length(); i++) { final JSONObject f = fl.optJSONObject(i); listItem(f.optString("name"), f.optString("kind") + " · " + bytes(f.optLong("size_bytes")) + " · v" + f.optInt("version"), new View.OnClickListener() { public void onClick(View v) { fileActions(f); } }); }
            if (fs.length() + fl.length() == 0) body.addView(text("This folder is empty.", 14, MUTED, false));
        } });
    }

    private void fileActions(final JSONObject f) {
        final String base = "/api/projects/" + projectId() + "/files/" + f.optString("id");
        new AlertDialog.Builder(this).setTitle(f.optString("name")).setMessage("SHA-256: " + f.optString("sha256") + "\nSize: " + bytes(f.optLong("size_bytes")))
                .setPositiveButton("Download", new DialogInterface.OnClickListener() { public void onClick(DialogInterface d, int i) {
                    async(new Call() { public Object run() throws Exception { return api.downloadUrl(projectId(), f.optString("id")); } },
                            new Done() { public void ok(Object url) { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse((String) url))); } });
                } })
                .setNeutralButton("Verify", new DialogInterface.OnClickListener() { public void onClick(DialogInterface d, int i) {
                    async(new Call() { public Object run() throws Exception { return api.post(base + "/verify", null); } },
                            new Done() { public void ok(Object x) { toast(((JSONObject) x).optBoolean("ok") ? "Integrity verified (SHA-256 matches)" : "INTEGRITY CHECK FAILED"); } });
                } })
                .setNegativeButton("Move to trash", new DialogInterface.OnClickListener() { public void onClick(DialogInterface d, int i) {
                    async(new Call() { public Object run() throws Exception { return api.delete(base); } }, new Done() { public void ok(Object x) { toast("Moved to trash"); show("files", null); } });
                } }).show();
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req != REQ_UPLOAD || res != RESULT_OK || data == null || data.getData() == null) return;
        final Uri uri = data.getData();
        String name = "upload.bin"; long size = -1;
        Cursor c = getContentResolver().query(uri, null, null, null, null);
        if (c != null) { if (c.moveToFirst()) { int ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME), si = c.getColumnIndex(OpenableColumns.SIZE); if (ni >= 0) name = c.getString(ni); if (si >= 0 && !c.isNull(si)) size = c.getLong(si); } c.close(); }
        final String fname = name; final long fsize = size;
        final String folder = folderStack.isEmpty() ? "" : folderStack.get(folderStack.size() - 1)[0];
        toast("Uploading " + fname + "…");
        async(new Call() { public Object run() throws Exception { InputStream in = getContentResolver().openInputStream(uri); return api.upload(projectId(), folder, fname, in, fsize); } },
                new Done() { public void ok(Object x) { toast("Uploaded " + fname); show("files", null); } });
    }

    private void notebooks() {
        if (!needProject()) { body.removeViewAt(0); return; }
        async(new Call() { public Object run() throws Exception { return api.get("/api/projects/" + projectId() + "/notebooks"); } }, new Done() { public void ok(Object r) {
            clearBody();
            body.addView(text("Notebooks open in the web console (full editor, kernels run in an isolated per-project container).", 13, MUTED, false));
            JSONArray nbs = ((JSONObject) r).optJSONArray("notebooks");
            if (nbs.length() == 0) body.addView(text("No notebooks in this project.", 14, MUTED, false));
            for (int i = 0; i < nbs.length(); i++) {
                final JSONObject n = nbs.optJSONObject(i);
                listItem(n.optString("name"), "v" + n.optInt("current_version") + " · " + ago(n.optLong("updated_at")), new View.OnClickListener() { public void onClick(View v) {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(api.getBase() + "/#/notebooks/" + n.optString("id"))));
                } });
            }
        } });
    }

    private void training() {
        if (!needProject()) { body.removeViewAt(0); return; }
        final String p = "/api/projects/" + projectId();
        async(new Call() { public Object run() throws Exception { return api.get(p + "/nick48"); } }, new Done() { public void ok(Object r) {
            clearBody(); JSONObject s = (JSONObject) r;
            String st = s.optString("nick48_status");
            LinearLayout c = card(); body.addView(c);
            c.addView(text("Nick 4.8 — " + st, 18, "COMPLETE".equals(st) ? ACCENT : WARN, true));
            c.addView(text("COMPLETE".equals(st) ? "An adapter passed evidence verification." : "Nick 4.8 is NOT reported as trained until evidence (GPU run, adapter reload, inference, SHA-256) is verified.", 13, MUTED, false));
            JSONObject imp = s.optJSONObject("latest_import");
            if (imp != null) { statRow(c, "Commit", imp.optString("commit_sha").substring(0, 12)); statRow(c, "Integrity", s.optJSONObject("integrity").optBoolean("ok") ? "verified" : "MODIFIED"); }
            body.addView(button(imp == null ? "Import Approx-Ai pipeline" : "Re-import pipeline", imp == null, new View.OnClickListener() { public void onClick(View v) {
                toast("Importing (read-only)…");
                async(new Call() { public Object run() throws Exception { return api.post(p + "/nick48/import", null); } }, new Done() { public void ok(Object x) { show("training", null); } });
            } }));
            if (imp != null) {
                body.addView(button("Run preflight", false, new View.OnClickListener() { public void onClick(View v) {
                    async(new Call() { public Object run() throws Exception { return api.post(p + "/nick48/preflight", null); } }, new Done() { public void ok(Object x) {
                        JSONObject pf = ((JSONObject) x).optJSONObject("preflight");
                        JSONObject ch = pf.optJSONObject("checks");
                        String msg = "Status: " + pf.optString("status") + "\nRepository: " + passFail(ch.optJSONObject("repository")) + "\nConfig: " + passFail(ch.optJSONObject("config")) + "\nDataset: " + passFail(ch.optJSONObject("dataset")) +
                                "\nBase model: " + passFail(ch.optJSONObject("base_model")) + "\nRequired VRAM: ≥" + pf.optInt("required_vram_gb") + " GB\nGPU: " + (ch.optJSONObject("gpu").optBoolean("ok") ? ch.optJSONObject("gpu").optString("provider") : "NO FREE GPU AVAILABLE");
                        new AlertDialog.Builder(MainActivity.this).setTitle("Preflight").setMessage(msg).setPositiveButton("OK", null).show();
                    } });
                } }));
                body.addView(button("Start training", true, new View.OnClickListener() { public void onClick(View v) {
                    confirm("Queue Nick 4.8 training? It runs only on a verified free GPU; otherwise it waits.", new Runnable() { public void run() {
                        async(new Call() { public Object run() throws Exception { return api.post(p + "/nick48/train", null); } }, new Done() { public void ok(Object x) { toast(((JSONObject) x).optString("message")); show("training", null); } });
                    } });
                } }));
            }
            section("Training jobs");
            JSONArray jobs = s.optJSONArray("jobs");
            for (int i = 0; i < jobs.length(); i++) { final JSONObject j = jobs.optJSONObject(i); listItem(j.optString("name"), j.optString("status") + (j.isNull("blocked_reason") ? "" : " · " + j.optString("blocked_reason")), new View.OnClickListener() { public void onClick(View v) { show("job", j.optString("id")); } }); }
            section("Verified models");
            JSONArray models = s.optJSONArray("models");
            if (models.length() == 0) body.addView(text("None. A model appears only after its evidence is verified.", 14, MUTED, false));
            for (int i = 0; i < models.length(); i++) { JSONObject m = models.optJSONObject(i); listItem(m.optString("name") + " — " + m.optString("status"), m.isNull("sha256") ? "" : "sha256 " + m.optString("sha256").substring(0, 16) + "…", null); }
        } });
    }
    private static String passFail(JSONObject c) { return c == null ? "?" : c.optBoolean("ok") ? "pass" : "FAIL"; }

    private void jobs() {
        if (!needProject()) { body.removeViewAt(0); return; }
        async(new Call() { public Object run() throws Exception { return api.get("/api/projects/" + projectId() + "/jobs"); } }, new Done() { public void ok(Object r) {
            clearBody();
            JSONArray js = ((JSONObject) r).optJSONArray("jobs");
            if (js.length() == 0) body.addView(text("No jobs yet.", 14, MUTED, false));
            for (int i = 0; i < js.length(); i++) { final JSONObject j = js.optJSONObject(i); listItem(j.optString("name"), j.optString("type") + " · " + j.optString("status") + " · " + ago(j.optLong("created_at")), new View.OnClickListener() { public void onClick(View v) { show("job", j.optString("id")); } }); }
        } });
    }

    private void jobDetail(final String id) {
        final String base = "/api/projects/" + projectId() + "/jobs/" + id;
        async(new Call() { public Object run() throws Exception { return new JSONObject().put("d", api.get(base)).put("l", api.get(base + "/logs")); } }, new Done() { public void ok(Object r) {
            clearBody();
            JSONObject j = ((JSONObject) r).optJSONObject("d").optJSONObject("job");
            String log = ((JSONObject) r).optJSONObject("l").optString("text");
            LinearLayout c = card(); body.addView(c);
            c.addView(text(j.optString("name"), 18, TEXT, true));
            statRow(c, "Status", j.optString("status")); statRow(c, "Type", j.optString("type")); statRow(c, "Attempts", j.optInt("attempts") + "/" + j.optInt("max_attempts"));
            statRow(c, "Provider", j.isNull("provider_id") ? "—" : j.optString("provider_id"));
            if (!j.isNull("blocked_reason")) c.addView(text(j.optString("blocked_reason"), 13, WARN, false));
            if (!j.isNull("error")) c.addView(text(j.optString("error"), 13, DANGER, false));
            LinearLayout row = new LinearLayout(MainActivity.this);
            for (final String a : new String[] { "cancel", "pause", "resume", "retry" }) {
                row.addView(button(a, false, new View.OnClickListener() { public void onClick(View v) {
                    async(new Call() { public Object run() throws Exception { return api.post(base + "/" + a, null); } }, new Done() { public void ok(Object x) { toast(a + ": " + ((JSONObject) x).optString("status")); show("job", id); } });
                } }), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            }
            body.addView(row);
            body.addView(button("Refresh", false, new View.OnClickListener() { public void onClick(View v) { show("job", id); } }));
            section("Log");
            TextView lv = text(log.length() == 0 ? "(no output yet)" : log.length() > 20000 ? "…" + log.substring(log.length() - 20000) : log, 12, 0xFFD5E2FF, false);
            lv.setTypeface(Typeface.MONOSPACE); lv.setBackgroundColor(0xFF0A0F1C); lv.setPadding(dp(10), dp(10), dp(10), dp(10)); lv.setTextIsSelectable(true);
            HorizontalScrollView hs = new HorizontalScrollView(MainActivity.this); hs.addView(lv); body.addView(hs);
        } });
    }

    private void logs() {
        if (!needProject()) { body.removeViewAt(0); return; }
        async(new Call() { public Object run() throws Exception { return api.get("/api/projects/" + projectId() + "/logs?type=audit&limit=100"); } }, new Done() { public void ok(Object r) {
            clearBody();
            JSONArray ls = ((JSONObject) r).optJSONArray("logs");
            if (ls.length() == 0) body.addView(text("No log entries.", 14, MUTED, false));
            for (int i = 0; i < ls.length(); i++) { JSONObject l = ls.optJSONObject(i); listItem(l.optString("action"), (l.isNull("actor") ? "system" : l.optString("actor")) + " · " + time(l.optLong("created_at")), null); }
        } });
    }

    private void notifications() {
        async(new Call() { public Object run() throws Exception { return api.get("/api/notifications"); } }, new Done() { public void ok(Object r) {
            clearBody();
            body.addView(button("Mark all read", false, new View.OnClickListener() { public void onClick(View v) {
                async(new Call() { public Object run() throws Exception { return api.post("/api/notifications/read-all", null); } }, new Done() { public void ok(Object x) { lastUnread = 0; show("notifications", null); } });
            } }));
            JSONArray ns = ((JSONObject) r).optJSONArray("notifications");
            if (ns.length() == 0) body.addView(text("No notifications.", 14, MUTED, false));
            for (int i = 0; i < ns.length(); i++) { JSONObject n = ns.optJSONObject(i); listItem((n.isNull("read_at") ? "● " : "") + n.optString("title"), n.optString("body") + " · " + ago(n.optLong("created_at")), null); }
        } });
    }

    private void settings() {
        clearBody();
        LinearLayout c = card(); body.addView(c);
        statRow(c, "Server", api.getBase()); statRow(c, "App version", versionName() + (debugBuild ? " (debug build)" : ""));
        statRow(c, "Session expires", time(Long.parseLong(store.get("session_expires_at", "0"))));
        body.addView(button("Change password", false, new View.OnClickListener() { public void onClick(View v) {
            prompt("Change password", new String[] { "Current password", "New password" }, new Done() { public void ok(Object vals) {
                final String[] s = (String[]) vals;
                async(new Call() { public Object run() throws Exception { return api.post("/api/auth/change-password", new JSONObject().put("current_password", s[0]).put("new_password", s[1])); } }, new Done() { public void ok(Object x) { toast("Password changed"); } });
            } });
        } }));
        body.addView(button("Notification permission", false, new View.OnClickListener() { public void onClick(View v) { requestNotificationPermission(); } }));
        body.addView(button("Change server", false, new View.OnClickListener() { public void onClick(View v) { logoutLocal(); showServerSetup(null); } }));
        body.addView(button("Sign out", true, new View.OnClickListener() { public void onClick(View v) {
            async(new Call() { public Object run() throws Exception { try { api.post("/api/auth/logout", null); } catch (Api.ApiException e) { /* local sign-out regardless */ } return null; } },
                    new Done() { public void ok(Object x) { logoutLocal(); showLogin("Signed out."); } });
        } }));
        body.addView(text("NEBIUS is a provisional internal development name and is not affiliated with Nebius Group N.V. GPU computation runs on connected compute infrastructure, never on this phone.", 12, MUTED, false));
    }

    private void profile() {
        async(new Call() { public Object run() throws Exception { return api.get("/api/auth/me"); } }, new Done() { public void ok(Object r) {
            clearBody(); final JSONObject u = ((JSONObject) r).optJSONObject("user");
            LinearLayout c = card(); body.addView(c);
            c.addView(text(u.optString("display_name"), 20, TEXT, true));
            statRow(c, "Email", u.optString("email")); statRow(c, "Email verified", u.optBoolean("email_verified") ? "yes" : "no"); statRow(c, "Platform role", u.optString("platform_role")); statRow(c, "Member since", time(u.optLong("created_at")));
            body.addView(button("Edit name", false, new View.OnClickListener() { public void onClick(View v) {
                prompt("Edit name", new String[] { "Name" }, new Done() { public void ok(Object vals) {
                    final String n = ((String[]) vals)[0];
                    async(new Call() { public Object run() throws Exception { return api.patch("/api/auth/me", new JSONObject().put("display_name", n)); } }, new Done() { public void ok(Object x) { show("profile", null); } });
                } });
            } }));
        } });
    }

    // ---------------------------------------------------------------- notifications (system)
    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[] { "android.permission.POST_NOTIFICATIONS" }, REQ_NOTIF);
    }
    @Override public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        if (req == REQ_NOTIF && (res.length == 0 || res[0] != PackageManager.PERMISSION_GRANTED)) toast("Notifications disabled — you can still see them in the Notifications screen.");
    }
    private void startPolling() {
        if (poller != null) ui.removeCallbacks(poller);
        poller = new Runnable() { public void run() {
            if (api != null && api.getToken() != null) {
                pool.execute(new Runnable() { public void run() {
                    try {
                        JSONObject n = api.get("/api/notifications?unread=1");
                        final int unread = n.optInt("unread");
                        final JSONArray list = n.optJSONArray("notifications");
                        ui.post(new Runnable() { public void run() {
                            if (lastUnread >= 0 && unread > lastUnread && list != null && list.length() > 0) postSystemNotification(list.optJSONObject(0));
                            lastUnread = unread;
                        } });
                    } catch (Exception ignored) { /* offline: try again later */ }
                } });
            }
            ui.postDelayed(this, 60000);
        } };
        ui.postDelayed(poller, 5000);
    }
    @SuppressWarnings("deprecation")
    private void postSystemNotification(JSONObject n) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= 26) {
                // NotificationChannel is API 26; created reflectively because the build compiles against android-23.
                Class<?> chCls = Class.forName("android.app.NotificationChannel");
                Object ch = chCls.getConstructor(String.class, CharSequence.class, int.class).newInstance("nebius", "NEBIUS activity", 3);
                NotificationManager.class.getMethod("createNotificationChannel", chCls).invoke(nm, ch);
                b = (Notification.Builder) Notification.Builder.class.getConstructor(Context.class, String.class).newInstance(this, "nebius");
            } else b = new Notification.Builder(this);
            b.setSmallIcon(getResources().getIdentifier("ic_launcher", "mipmap", getPackageName())).setContentTitle(n.optString("title")).setContentText(n.optString("body")).setAutoCancel(true);
            nm.notify((int) (System.currentTimeMillis() & 0xFFFFFF), b.build());
        } catch (Exception ignored) { /* permission denied or unsupported: in-app list still works */ }
    }

    // ---------------------------------------------------------------- view helpers
    private int dp(int v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }
    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this); t.setText(s); t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp); t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD); t.setPadding(0, dp(3), 0, dp(3)); return t;
    }
    private TextView label(String s) { return text(s, 13, MUTED, false); }
    private EditText input(String hint, int type) {
        EditText e = new EditText(this); e.setHint(hint); e.setInputType(type == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS || type == InputType.TYPE_TEXT_VARIATION_URI ? InputType.TYPE_CLASS_TEXT | type : type);
        e.setTextColor(TEXT); e.setHintTextColor(MUTED); e.setSingleLine(true); e.setBackground(rounded(SURFACE2, BORDER)); e.setPadding(dp(12), dp(10), dp(12), dp(10));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); lp.bottomMargin = dp(8); e.setLayoutParams(lp);
        return e;
    }
    private Button button(String s, boolean primary, View.OnClickListener l) {
        Button b = new Button(this); b.setText(s); b.setAllCaps(false); b.setTextColor(primary ? BG : TEXT); b.setBackground(rounded(primary ? PRIMARY : SURFACE2, primary ? PRIMARY : BORDER));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); lp.setMargins(dp(2), dp(4), dp(2), dp(4)); b.setLayoutParams(lp);
        b.setOnClickListener(l); return b;
    }
    private GradientDrawable rounded(int fill, int stroke) { GradientDrawable g = new GradientDrawable(); g.setColor(fill); g.setCornerRadius(dp(10)); g.setStroke(dp(1), stroke); return g; }
    private LinearLayout card() {
        LinearLayout c = new LinearLayout(this); c.setOrientation(LinearLayout.VERTICAL); c.setBackground(rounded(SURFACE, BORDER)); c.setPadding(dp(14), dp(12), dp(14), dp(12));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); lp.bottomMargin = dp(10); c.setLayoutParams(lp);
        return c;
    }
    private void section(String s) { TextView t = text(s.toUpperCase(), 12, MUTED, true); t.setPadding(dp(4), dp(14), 0, dp(4)); body.addView(t); }
    private void banner(String s, int color) { TextView t = text(s, 14, color, true); t.setBackground(rounded(SURFACE2, color)); t.setPadding(dp(12), dp(10), dp(12), dp(10)); body.addView(t); }
    private void statRow(LinearLayout parent, String k, String v) {
        LinearLayout r = new LinearLayout(this);
        r.addView(text(k, 14, MUTED, false), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextView tv = text(v, 14, TEXT, true); tv.setGravity(Gravity.END);
        r.addView(tv, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.3f));
        parent.addView(r);
    }
    private void listItem(String title, String sub, View.OnClickListener l) {
        LinearLayout c = card(); c.addView(text(title, 15, TEXT, true)); if (sub != null && sub.length() > 0) c.addView(text(sub, 12, MUTED, false));
        if (l != null) { c.setOnClickListener(l); c.setClickable(true); }
        body.addView(c);
    }
    private View.OnClickListener nav(final String s) { return new View.OnClickListener() { public void onClick(View v) { show(s, null); } }; }
    private LinearLayout authFrame(String title) {
        ScrollView sv = new ScrollView(this); sv.setBackgroundColor(BG);
        LinearLayout f = new LinearLayout(this); f.setOrientation(LinearLayout.VERTICAL); f.setPadding(dp(24), dp(40), dp(24), dp(24));
        TextView brand = text("NEBIUS", 24, PRIMARY, true); brand.setLetterSpacing(0.15f); f.addView(brand);
        f.addView(text(title, 20, TEXT, true));
        sv.addView(f); FrameLayout fl = new FrameLayout(this); fl.addView(sv); setContentView(fl);
        body = null;
        return f;
    }
    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_LONG).show(); }
    private void confirm(String msg, final Runnable yes) {
        new AlertDialog.Builder(this).setMessage(msg).setPositiveButton("OK", new DialogInterface.OnClickListener() { public void onClick(DialogInterface d, int i) { yes.run(); } }).setNegativeButton("Cancel", null).show();
    }
    private void prompt(String title, String[] hints, final Done done) {
        LinearLayout l = new LinearLayout(this); l.setOrientation(LinearLayout.VERTICAL); l.setPadding(dp(20), dp(8), dp(20), 0);
        final EditText[] fields = new EditText[hints.length];
        for (int i = 0; i < hints.length; i++) {
            boolean pw = hints[i].toLowerCase().contains("password");
            fields[i] = input(hints[i], pw ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD : InputType.TYPE_CLASS_TEXT);
            l.addView(fields[i]);
        }
        new AlertDialog.Builder(this).setTitle(title).setView(l).setPositiveButton("OK", new DialogInterface.OnClickListener() { public void onClick(DialogInterface d, int w) {
            String[] out = new String[fields.length]; for (int i = 0; i < fields.length; i++) out[i] = fields[i].getText().toString().trim(); done.ok(out);
        } }).setNegativeButton("Cancel", null).show();
    }
    private String versionName() { try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "?"; } }
    static String bytes(long n) { String[] u = { "B", "KB", "MB", "GB", "TB" }; double x = n; int i = 0; while (x >= 1024 && i < 4) { x /= 1024; i++; } return (i == 0 ? String.valueOf((long) x) : String.format("%.1f", x)) + " " + u[i]; }
    static String time(long t) { return t <= 0 ? "—" : DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(new Date(t)); }
    static String ago(long t) { if (t <= 0) return "—"; long s = (System.currentTimeMillis() - t) / 1000; if (s < 60) return s + "s ago"; if (s < 3600) return (s / 60) + "m ago"; if (s < 86400) return (s / 3600) + "h ago"; return (s / 86400) + "d ago"; }
    @SuppressWarnings("unused") private static int unused() { return Color.BLACK; }
}
