package dev.musel.timerwidget;

import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertEquals;

import java.io.IOException;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import org.junit.Test;

public class WidgetAccountTest {
    @Test public void checkingASignedInAccountRequestsAFreshWidgetUpdate() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.start();
            server.enqueue(new MockResponse().setBody("{\"user\":{\"email\":\"musel\"}}"));
            MemoryCookies cookies = new MemoryCookies();
            cookies.value = "sid=musel";
            VisibleWidget widget = new VisibleWidget();
            WidgetAccount account = new WidgetAccount(
                new PlannerApi(server.url("/").toString().replaceAll("/$", ""), cookies), widget, new Object());

            assertEquals("musel", account.checkAccount());
            assertEquals(1, widget.refreshes);
            assertEquals(0, widget.clears);
        }
    }

    @Test public void checkingAnExpiredAccountClearsPrivateTasks() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.start();
            server.enqueue(new MockResponse().setBody("{\"user\":null}"));
            VisibleWidget widget = new VisibleWidget();
            widget.tasks = "Private tasks";
            WidgetAccount account = new WidgetAccount(
                new PlannerApi(server.url("/").toString().replaceAll("/$", ""), new MemoryCookies()), widget, new Object());

            assertNull(account.checkAccount());
            assertNull(widget.tasks);
            assertEquals(0, widget.refreshes);
        }
    }

    @Test public void anAccountCheckConnectionFailureKeepsTheTaskList() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.start();
            server.enqueue(new MockResponse().setResponseCode(503));
            VisibleWidget widget = new VisibleWidget();
            widget.tasks = "Saved tasks";
            WidgetAccount account = new WidgetAccount(
                new PlannerApi(server.url("/").toString().replaceAll("/$", ""), new MemoryCookies()), widget, new Object());

            assertThrows(IOException.class, account::checkAccount);
            assertEquals("Saved tasks", widget.tasks);
            assertEquals(0, widget.refreshes);
        }
    }

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
        int refreshes;
        int clears;
        @Override public void clear() { tasks = null; clears++; }
        @Override public void refresh() { refreshes++; }
    }
}
