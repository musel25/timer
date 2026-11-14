package dev.musel.timerwidget;

import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;

import java.io.IOException;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import org.junit.Test;

public class WidgetAccountTest {
    @Test public void failedSignInRemovesThePreviousAccountsVisibleTasks() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.start();
            server.enqueue(new MockResponse().setResponseCode(401).setBody("{\"error\":\"invalid_credentials\"}"));
            MemoryCookies cookies = new MemoryCookies();
            cookies.value = "sid=old-account";
            VisibleWidget widget = new VisibleWidget();
            widget.tasks = "Private tasks from old account";
            WidgetAccount account = new WidgetAccount(
                new PlannerApi(server.url("/").toString().replaceAll("/$", ""), cookies), widget, new Object());

            assertThrows(IOException.class, () -> account.signIn("musel", "wrong"));
            assertNull(cookies.value);
            assertNull(widget.tasks);
        }
    }

    private static class MemoryCookies implements PlannerApi.SessionCookies {
        String value;
        @Override public String get() { return value; }
        @Override public void set(String header) { value = header.split(";", 2)[0]; }
        @Override public void clear() { value = null; }
    }

    private static class VisibleWidget implements WidgetAccount.Display {
        String tasks;
        @Override public void clear() { tasks = null; }
        @Override public void refresh() { /* A later update can show the new account. */ }
    }
}
