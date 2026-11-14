package dev.musel.timerwidget;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

final class ReleaseUpdate {
    static final String API = "https://api.github.com/repos/musel25/timer/releases/latest";
    private static final String DOWNLOAD_PREFIX = "https://github.com/musel25/timer/releases/download/";

    static final class Available {
        final String version;
        final String downloadUrl;

        Available(String version, String downloadUrl) {
            this.version = version;
            this.downloadUrl = downloadUrl;
        }
    }

    static Available check(URL api, String installedVersion) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) api.openConnection();
        try {
            connection.setConnectTimeout(4000);
            connection.setReadTimeout(4000);
            connection.setRequestProperty("Accept", "application/vnd.github+json");
            connection.setRequestProperty("User-Agent", "PlannerWidget");
            if (connection.getResponseCode() != 200) return null;
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (InputStream input = connection.getInputStream()) {
                byte[] block = new byte[4096];
                int count;
                while ((count = input.read(block)) != -1) {
                    bytes.write(block, 0, count);
                    if (bytes.size() > 1024 * 1024) return null;
                }
            }
            JSONObject release = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
            String tag = release.optString("tag_name");
            if (!tag.startsWith("android-v")) return null;
            String version = tag.substring("android-v".length());
            if (compare(version, installedVersion) <= 0) return null;
            JSONArray assets = release.optJSONArray("assets");
            if (assets == null) return null;
            for (int i = 0; i < assets.length(); i++) {
                JSONObject asset = assets.getJSONObject(i);
                String url = asset.optString("browser_download_url");
                if (asset.optString("name").endsWith(".apk")
                    && url.startsWith(DOWNLOAD_PREFIX + tag + "/") && url.endsWith(".apk")) {
                    return new Available(version, url);
                }
            }
            return null;
        } finally { connection.disconnect(); }
    }

    private static int compare(String first, String second) {
        String[] a = first.split("\\.");
        String[] b = second.split("\\.");
        if (a.length != 3 || b.length != 3) return 0;
        try {
            for (int i = 0; i < 3; i++) {
                int difference = Integer.compare(Integer.parseInt(a[i]), Integer.parseInt(b[i]));
                if (difference != 0) return difference;
            }
        } catch (NumberFormatException ignored) { return 0; }
        return 0;
    }

    private ReleaseUpdate() {}
}
