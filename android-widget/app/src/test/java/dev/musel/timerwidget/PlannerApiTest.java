package dev.musel.timerwidget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;

import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.RecordedRequest;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class PlannerApiTest {
    private MockWebServer server;
    private MemoryCookies cookies;
    private PlannerApi api;

    @Before public void start() throws Exception {
        server = new MockWebServer();
        server.start();
        cookies = new MemoryCookies();
        api = new PlannerApi(server.url("/").toString().replaceAll("/$", ""), cookies);
    }

    @After public void stop() throws Exception { server.shutdown(); }

    @Test public void signsInAsMuselAndUsesThatSessionForTaskRequests() throws Exception {
        server.enqueue(new MockResponse().setBody("{\"user\":{\"id\":\"musel-id\",\"email\":\"musel\"}}")
            .addHeader("Set-Cookie", "sid=musel-session; HttpOnly; Path=/"));
        server.enqueue(new MockResponse().setBody("{\"user\":{\"id\":\"musel-id\",\"email\":\"musel\"}}"));
        server.enqueue(new MockResponse().setBody("[{\"id\":\"my-task\",\"title\":\"Read\",\"date\":\"2026-11-13\",\"done\":false,\"sortOrder\":1}]"));

        assertEquals("musel", api.signIn("musel", "secret"));
        assertEquals("musel", api.currentAccount());
        assertEquals("my-task", api.tasks().get(0).id);
        assertEquals("POST", server.takeRequest().getMethod());
        assertEquals("sid=musel-session", server.takeRequest().getHeader("Cookie"));
        assertEquals("sid=musel-session", server.takeRequest().getHeader("Cookie"));
    }

    @Test public void hasNoAccountWithoutAValidSession() throws Exception {
        server.enqueue(new MockResponse().setBody("{\"user\":null}"));
        assertNull(api.currentAccount());
    }

    @Test public void aWidgetRefreshUsesOneAccountSessionForBothRequests() throws Exception {
        cookies.cookie = "sid=musel-session";
        server.enqueue(new MockResponse().setBody("{\"user\":{\"id\":\"musel-id\",\"email\":\"musel\"}}"));
        server.enqueue(new MockResponse().setBody("[{\"id\":\"my-task\",\"title\":\"Read\",\"date\":\"2026-11-13\",\"done\":false,\"sortOrder\":1}]"));

        PlannerApi.WeekSnapshot snapshot = api.weekSnapshot();
        assertEquals("musel", snapshot.account);
        assertEquals("my-task", snapshot.tasks.get(0).id);
        assertEquals("sid=musel-session", server.takeRequest().getHeader("Cookie"));
        assertEquals("sid=musel-session", server.takeRequest().getHeader("Cookie"));
    }

    @Test public void rejectsTasksWhenTheAccountChangesDuringRefresh() throws Exception {
        cookies.cookie = "sid=musel-session";
        server.setDispatcher(new Dispatcher() {
            @Override public MockResponse dispatch(RecordedRequest request) {
                if (request.getPath().equals("/api/auth/me")) {
                    return new MockResponse().setBody("{\"user\":{\"id\":\"musel-id\",\"email\":\"musel\"}}");
                }
                cookies.cookie = "sid=other-account";
                return new MockResponse().setBody("[{\"id\":\"other-task\",\"title\":\"Private\",\"date\":\"2026-11-13\",\"done\":false,\"sortOrder\":1}]");
            }
        });

        assertThrows(java.io.IOException.class, () -> api.weekSnapshot());
        assertEquals("sid=musel-session", server.takeRequest().getHeader("Cookie"));
        assertEquals("sid=musel-session", server.takeRequest().getHeader("Cookie"));
    }

    @Test public void signOutClearsTheLocalSession() throws Exception {
        cookies.cookie = "sid=musel-session";
        server.enqueue(new MockResponse().setBody("{\"ok\":true}"));
        api.signOut();
        assertNull(cookies.get());
    }

    @Test public void failedSignInDoesNotKeepAFormerAccountsSession() throws Exception {
        cookies.cookie = "sid=old-account";
        server.enqueue(new MockResponse().setResponseCode(401).setBody("{\"error\":\"invalid_credentials\"}"));

        assertThrows(java.io.IOException.class, () -> api.signIn("musel", "wrong"));
        assertNull(cookies.get());
    }

    private static class MemoryCookies implements PlannerApi.SessionCookies {
        volatile String cookie;
        @Override public String get() { return cookie; }
        @Override public void set(String header) { cookie = header.split(";", 2)[0]; }
        @Override public void clear() { cookie = null; }
    }
}
