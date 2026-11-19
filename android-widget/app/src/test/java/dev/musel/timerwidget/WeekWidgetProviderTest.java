package dev.musel.timerwidget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.widget.TextView;
import androidx.work.ListenableWorker;
import androidx.work.testing.TestWorkerBuilder;
import androidx.work.testing.WorkManagerTestInitHelper;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.RecordedRequest;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAppWidgetManager;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class WeekWidgetProviderTest {
    private Context context;
    private AppWidgetManager manager;
    private ShadowAppWidgetManager widgets;
    private int id;

    @Before public void setUp() {
        context = RuntimeEnvironment.getApplication();
        WorkManagerTestInitHelper.initializeTestWorkManager(context);
        manager = AppWidgetManager.getInstance(context);
        widgets = shadowOf(manager);
        id = widgets.createWidget(WeekWidgetProvider.class, R.layout.week_widget);
    }

    @Test public void refreshKeepsThePreviousTasksAndTheirDateVisible() {
        WeekWidgetProvider.show(context, manager, id,
            "Thursday, Nov 19", "1 pending", "○  Read", "musel · tap to open", true);

        refresh();

        assertEquals("○  Read", text(R.id.widget_tasks));
        assertEquals("Thursday, Nov 19", text(R.id.widget_date));
        assertEquals("1 pending", text(R.id.widget_count));
    }

    @Test public void refreshWithoutPreviousTasksShowsTheConnectionMessage() {
        refresh();
        assertEquals("Waiting for connection…", text(R.id.widget_tasks));
    }

    @Test public void refreshDoesNotWaitForAnAccountNetworkRequest() throws Exception {
        CountDownLatch accountRequestStarted = new CountDownLatch(1);
        CountDownLatch finishAccountRequest = new CountDownLatch(1);
        ExecutorService accountThread = Executors.newSingleThreadExecutor();
        ExecutorService receiverThread = Executors.newSingleThreadExecutor();
        try {
            accountThread.submit(() -> {
                synchronized (WeekWidgetProvider.SESSION_LOCK) {
                    accountRequestStarted.countDown();
                    try { finishAccountRequest.await(); }
                    catch (InterruptedException error) { Thread.currentThread().interrupt(); }
                }
            });
            assertTrue(accountRequestStarted.await(5, TimeUnit.SECONDS));

            receiverThread.submit(this::refresh).get(2, TimeUnit.SECONDS);
        } finally {
            finishAccountRequest.countDown();
            accountThread.shutdownNow();
            receiverThread.shutdownNow();
            accountThread.awaitTermination(5, TimeUnit.SECONDS);
            receiverThread.awaitTermination(5, TimeUnit.SECONDS);
        }
    }

    @Test public void clearingTheAccountPreventsRefreshFromRestoringPrivateTasks() {
        WeekWidgetProvider.show(context, manager, id,
            "Thursday, Nov 19", "1 pending", "○  Private task", "musel · tap to open", true);

        WeekWidgetProvider.clearAll(context);
        refresh();

        assertEquals("Waiting for connection…", text(R.id.widget_tasks));
    }

    @Test public void aNewWidgetCanShowTheLastSuccessfulTaskListWhileOffline() {
        WeekWidgetProvider.show(context, manager, id,
            "Thursday, Nov 19", "1 pending", "○  Read", "musel · tap to open", true);

        id = widgets.createWidget(WeekWidgetProvider.class, R.layout.week_widget);
        refresh();

        assertEquals("○  Read", text(R.id.widget_tasks));
        assertEquals("Saved tasks · musel · tap to open", text(R.id.widget_account));
    }

    @Test public void aFailedRequestKeepsTheLastSuccessfulTaskList() throws Exception {
        WeekWidgetProvider.show(context, manager, id,
            "Thursday, Nov 19", "1 pending", "○  Read", "musel · tap to open", true);

        assertEquals(ListenableWorker.Result.failure(), fetch(new MockResponse().setResponseCode(503)));

        assertEquals("○  Read", text(R.id.widget_tasks));
        assertEquals("Saved tasks · musel · tap to open", text(R.id.widget_account));
    }

    @Test public void anExpiredSessionClearsSavedTasksBeforeAnotherRefresh() throws Exception {
        WeekWidgetProvider.show(context, manager, id,
            "Thursday, Nov 19", "1 pending", "○  Private task", "musel · tap to open", true);

        fetch(new MockResponse().setBody("{\"user\":null}"));
        assertEquals("Open the app to sign in", text(R.id.widget_tasks));
        refresh();

        assertEquals("Waiting for connection…", text(R.id.widget_tasks));
    }

    @Test public void anUnauthorizedResponseClearsSavedTasks() throws Exception {
        WeekWidgetProvider.show(context, manager, id,
            "Thursday, Nov 19", "1 pending", "○  Private task", "musel · tap to open", true);

        fetch(new MockResponse().setResponseCode(401));
        assertEquals("Open the app to sign in", text(R.id.widget_tasks));
        refresh();

        assertEquals("Waiting for connection…", text(R.id.widget_tasks));
    }

    @Test public void aSuccessfulRefreshReplacesTheSavedTasksEvenWhenTheListIsEmpty() throws Exception {
        WeekWidgetProvider.show(context, manager, id,
            "Thursday, Nov 19", "1 pending", "○  Read", "musel · tap to open", true);

        assertEquals(ListenableWorker.Result.success(), fetch(
            new MockResponse().setBody("{\"user\":{\"email\":\"musel\"}}"),
            new MockResponse().setBody("[]")));
        assertEquals("No pending tasks today", text(R.id.widget_tasks));
        refresh();

        assertEquals("No pending tasks today", text(R.id.widget_tasks));
        assertEquals("0 pending", text(R.id.widget_count));
    }

    @Test public void anOldRequestsAuthFailureCannotClearTheNewAccountsTasks() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.start();
            MemoryCookies cookies = new MemoryCookies();
            server.setDispatcher(new Dispatcher() {
                @Override public MockResponse dispatch(RecordedRequest request) {
                    synchronized (WeekWidgetProvider.SESSION_LOCK) {
                        cookies.value = "sid=new-account";
                        WeekWidgetProvider.clearAll(context);
                        WeekWidgetProvider.show(context, manager, id,
                            "Thursday, Nov 19", "1 pending", "○  New task", "new-account · tap to open", true);
                    }
                    return new MockResponse().setResponseCode(401);
                }
            });
            PlannerApi api = new PlannerApi(server.url("/").toString().replaceAll("/$", ""), cookies);

            TestWorkerBuilder.from(context, WidgetRefreshWorker.class, Runnable::run).build().refresh(api);

            assertEquals("○  New task", text(R.id.widget_tasks));
            refresh();
            assertEquals("○  New task", text(R.id.widget_tasks));
        }
    }

    private static class MemoryCookies implements PlannerApi.SessionCookies {
        volatile String value = "sid=musel-session";
        @Override public String get() { return value; }
        @Override public void set(String header) { value = header; }
        @Override public void clear() { value = null; }
    }

    private ListenableWorker.Result fetch(MockResponse... responses) throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.start();
            for (MockResponse response : responses) server.enqueue(response);
            PlannerApi api = new PlannerApi(server.url("/").toString().replaceAll("/$", ""),
                new MemoryCookies());
            return TestWorkerBuilder.from(context, WidgetRefreshWorker.class, Runnable::run).build().refresh(api);
        }
    }

    private void refresh() {
        new WeekWidgetProvider().onReceive(context,
            new Intent(context, WeekWidgetProvider.class)
                .setAction("dev.musel.timerwidget.REFRESH"));
    }

    private String text(int viewId) {
        return ((TextView) widgets.getViewFor(id).findViewById(viewId)).getText().toString();
    }
}
