package dev.musel.timerwidget;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;

import java.io.File;
import java.io.IOException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.TimeUnit;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ReleaseUpdateTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();

    @Test public void downloadsAnApkIntoTheAppCache() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            byte[] apk = "sample apk bytes".getBytes(StandardCharsets.UTF_8);
            server.enqueue(new MockResponse().setBody(new okio.Buffer().write(apk)));
            File target = new File(temporary.getRoot(), "PlannerWidget.apk");

            ReleaseUpdate.download(server.url("/PlannerWidget.apk").url(), target);

            assertArrayEquals(apk, Files.readAllBytes(target.toPath()));
        }
    }

    @Test public void rejectsAnOversizedApkWithoutLeavingAFile() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.enqueue(new MockResponse().setBody("too large").setHeader("Content-Length", 30 * 1024 * 1024));
            File target = new File(temporary.getRoot(), "PlannerWidget.apk");

            assertThrows(IOException.class, () -> ReleaseUpdate.download(server.url("/PlannerWidget.apk").url(), target));
            assertFalse(target.exists());
        }
    }

    @Test public void findsNewerApkFromLatestRelease() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.enqueue(new MockResponse().setBody("{\"tag_name\":\"android-v1.2.0\",\"assets\":["
                + "{\"name\":\"PlannerWidget-1.2.0.apk\",\"browser_download_url\":\"https://github.com/musel25/timer/releases/download/android-v1.2.0/PlannerWidget-1.2.0.apk\"}]}"));

            ReleaseUpdate.Available update = ReleaseUpdate.check(server.url("/releases/latest").url(), "1.1.0");

            assertEquals("1.2.0", update.version);
            assertEquals("https://github.com/musel25/timer/releases/download/android-v1.2.0/PlannerWidget-1.2.0.apk", update.downloadUrl);
            assertEquals("/releases/latest", server.takeRequest().getPath());
        }
    }

    @Test public void ignoresCurrentRelease() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.enqueue(new MockResponse().setBody("{\"tag_name\":\"android-v1.1.0\",\"assets\":["
                + "{\"name\":\"PlannerWidget-1.1.0.apk\",\"browser_download_url\":\"https://github.com/musel25/timer/releases/download/android-v1.1.0/PlannerWidget-1.1.0.apk\"}]}"));

            assertNull(ReleaseUpdate.check(server.url("/releases/latest").url(), "1.1.0"));
        }
    }

    @Test public void findsUpdateOverAWorkingSlowConnection() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.enqueue(new MockResponse()
                .setHeadersDelay(5, TimeUnit.SECONDS)
                .setBody("{\"tag_name\":\"android-v1.1.2\",\"assets\":["
                    + "{\"name\":\"PlannerWidget.apk\",\"browser_download_url\":\"https://github.com/musel25/timer/releases/download/android-v1.1.2/PlannerWidget.apk\"}]}"));

            ReleaseUpdate.Available update = ReleaseUpdate.check(server.url("/releases/latest").url(), "1.1.1");

            assertEquals("1.1.2", update.version);
        }
    }
}
