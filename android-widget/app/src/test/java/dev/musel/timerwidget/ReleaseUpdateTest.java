package dev.musel.timerwidget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.net.URL;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import org.junit.Test;

public class ReleaseUpdateTest {
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
}
