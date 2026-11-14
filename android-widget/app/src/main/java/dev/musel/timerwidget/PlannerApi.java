package dev.musel.timerwidget;

import android.webkit.CookieManager;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Collections;
import java.util.Objects;
import org.json.JSONObject;

final class PlannerApi {
    static final String SITE = "https://timer.musel.dev";

    interface SessionCookies {
        String get();
        void set(String header);
        void clear();
    }

    private final String origin;
    private final SessionCookies cookies;

    PlannerApi(String origin, SessionCookies cookies) {
        this.origin = origin;
        this.cookies = cookies;
    }

    static PlannerApi forAndroid() {
        return new PlannerApi(SITE, new SessionCookies() {
            final CookieManager manager = CookieManager.getInstance();

            @Override public String get() { return manager.getCookie(SITE); }

            @Override public void set(String header) {
                manager.setCookie(SITE, header);
                manager.flush();
            }

            @Override public void clear() {
                manager.setCookie(SITE, "sid=; Max-Age=0; Path=/");
                manager.flush();
            }
        });
    }

    String signIn(String username, String password) throws Exception {
        cookies.clear();
        JSONObject body = new JSONObject().put("email", username).put("password", password);
        Response response = request("POST", "/api/auth/login", body.toString());
        String header = response.setCookie;
        if (header == null || !header.startsWith("sid=")) throw new IOException("Missing session cookie");
        cookies.set(header);
        return new JSONObject(response.body).getJSONObject("user").getString("email");
    }

    String currentAccount() throws Exception {
        Response response = request("GET", "/api/auth/me", null);
        JSONObject body = new JSONObject(response.body);
        return body.isNull("user") ? null : body.getJSONObject("user").getString("email");
    }

    List<WeekTasks.Task> tasks() throws Exception {
        return TaskPayload.parse(request("GET", "/api/tasks", null).body);
    }

    static final class WeekSnapshot {
        final String account;
        final List<WeekTasks.Task> tasks;
        private final String cookie;

        WeekSnapshot(String account, List<WeekTasks.Task> tasks, String cookie) {
            this.account = account;
            this.tasks = tasks;
            this.cookie = cookie;
        }
    }

    WeekSnapshot weekSnapshot() throws Exception {
        String cookie = cookies.get();
        if (cookie == null || cookie.isEmpty()) return new WeekSnapshot(null, Collections.emptyList(), cookie);
        JSONObject auth = new JSONObject(request("GET", "/api/auth/me", null, cookie).body);
        if (auth.isNull("user")) return new WeekSnapshot(null, Collections.emptyList(), cookie);
        String account = auth.getJSONObject("user").getString("email");
        List<WeekTasks.Task> tasks = TaskPayload.parse(request("GET", "/api/tasks", null, cookie).body);
        if (!Objects.equals(cookie, cookies.get())) throw new IOException("Account changed during refresh");
        return new WeekSnapshot(account, tasks, cookie);
    }

    boolean isCurrent(WeekSnapshot snapshot) {
        return Objects.equals(snapshot.cookie, cookies.get());
    }

    void signOut() {
        try { request("POST", "/api/auth/logout", null); }
        catch (Exception ignored) { /* Clear the local session even without a connection. */ }
        finally { cookies.clear(); }
    }

    private Response request(String method, String path, String json) throws IOException {
        return request(method, path, json, cookies.get());
    }

    private Response request(String method, String path, String json, String cookie) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(origin + path).openConnection();
        try {
            connection.setRequestMethod(method);
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(4000);
            connection.setReadTimeout(4000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cache-Control", "no-store");
            if (cookie != null && !cookie.isEmpty()) connection.setRequestProperty("Cookie", cookie);
            if (json != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                try (java.io.OutputStream stream = connection.getOutputStream()) {
                    stream.write(json.getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new IOException("HTTP " + status);
            try (InputStream stream = connection.getInputStream()) {
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] block = new byte[4096];
                int count;
                while ((count = stream.read(block)) != -1) buffer.write(block, 0, count);
                return new Response(buffer.toString(StandardCharsets.UTF_8.name()), connection.getHeaderField("Set-Cookie"));
            }
        } finally { connection.disconnect(); }
    }

    private static final class Response {
        final String body;
        final String setCookie;
        Response(String body, String setCookie) { this.body = body; this.setCookie = setCookie; }
    }
}
