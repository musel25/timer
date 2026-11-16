package dev.musel.timerwidget;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import org.json.JSONArray;
import org.json.JSONObject;

final class ReleaseUpdate {
    static final String API = "https://api.github.com/repos/musel25/timer/releases/latest";
    private static final String DOWNLOAD_PREFIX = "https://github.com/musel25/timer/releases/download/";
    private static final int MAX_APK_BYTES = 20 * 1024 * 1024;

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
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(10000);
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

    static void download(URL url, File target) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        File partial = new File(target.getParentFile(), target.getName() + ".part");
        try {
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(10000);
            if (connection.getResponseCode() != 200) throw new IOException("APK download failed");
            long length = connection.getContentLengthLong();
            if (length > MAX_APK_BYTES) throw new IOException("APK is too large");
            int total = 0;
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(partial)) {
                byte[] block = new byte[8192];
                int count;
                while ((count = input.read(block)) != -1) {
                    total += count;
                    if (total > MAX_APK_BYTES) throw new IOException("APK is too large");
                    output.write(block, 0, count);
                }
            }
            if (total == 0) throw new IOException("APK is empty");
            Files.move(partial.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING);
        } finally {
            partial.delete();
            connection.disconnect();
        }
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
