package dev.musel.timerwidget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.view.LayoutInflater;
import android.widget.TextView;
import android.widget.RemoteViews;
import androidx.work.ListenableWorker;
import androidx.work.WorkManager;
import androidx.work.WorkInfo;
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
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;
import org.robolectric.shadows.ShadowAppWidgetManager;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, shadows = WeekWidgetProviderTest.CountingWidgetManager.class)
public class WeekWidgetProviderTest {
    private Context context;
    private AppWidgetManager manager;
    private ShadowAppWidgetManager widgets;
    private int id;

    @Implements(AppWidgetManager.class)
    public static class CountingWidgetManager extends ShadowAppWidgetManager {
        int updates;

        @Implementation @Override protected void updateAppWidget(int widgetId, RemoteViews views) {
            updates++;
            super.updateAppWidget(widgetId, views);
        }
    }

    @Before public void setUp() {
        context = RuntimeEnvironment.getApplication();
        WorkManagerTestInitHelper.initializeTestWorkManager(context);
        manager = AppWidgetManager.getInstance(context);
        widgets = shadowOf(manager);
        id = widgets.createWidget(WeekWidgetProvider.class, R.layout.week_widget);
        new WeekWidgetProvider().onDeleted(context, new int[] { id });
    }

    @Test public void refreshKeepsThePreviousTasksAndTheirDateVisible() {
        WeekWidgetProvider.show(context, manager, id,
            "Thursday, Nov 19", "1 pending", "○  Read", "musel · tap to open", true);

        refresh();

        assertEquals("○  Read", text(R.id.widget_tasks));
        assertEquals("Thursday, Nov 19", text(R.id.widget_date));
        assertEquals("1 pending", text(R.id.widget_count));
    }

    @Test public void repeatedRefreshesDoNotRedrawTheSameTasks() {
        WeekWidgetProvider.show(context, manager, id,
            "Thursday, Nov 19", "1 pending", "○  Read", "musel · tap to open", true);
        int before = ((CountingWidgetManager) widgets).updates;

        refresh();
        refresh();
        WeekWidgetProvider.show(context, manager, id,
            "Thursday, Nov 19", "1 pending", "○  Read", "musel · tap to open", true);

        assertEquals("musel · tap to open", text(R.id.widget_account));
        assertEquals(before, ((CountingWidgetManager) widgets).updates);
    }

    @Test public void changedTasksStillUpdateTheWidget() {
        WeekWidgetProvider.show(context, manager, id,
            "Thursday, Nov 19", "1 pending", "○  Read", "musel · tap to open", true);
        int before = ((CountingWidgetManager) widgets).updates;

        WeekWidgetProvider.show(context, manager, id,
            "Thursday, Nov 19", "1 pending", "○  Write", "musel · tap to open", true);

        assertEquals("○  Write", text(R.id.widget_tasks));
        assertEquals(before + 1, ((CountingWidgetManager) widgets).updates);
    }

    @Test public void aRecreatedWidgetReceivesItsContentEvenWhenTasksHaveNotChanged() {
        WeekWidgetProvider.show(context, manager, id,
            "Thursday, Nov 19", "1 pending", "○  Read", "musel · tap to open", true);
        int before = ((CountingWidgetManager) widgets).updates;

        new WeekWidgetProvider().onDeleted(context, new int[] { id });
        refresh();

        assertEquals("○  Read", text(R.id.widget_tasks));
        assertEquals(before + 1, ((CountingWidgetManager) widgets).updates);
    }

    @Test public void theInitialViewDoesNotClaimTheAccountIsSignedOut() {
        TextView body = LayoutInflater.from(context).inflate(R.layout.week_widget, null)
            .findViewById(R.id.widget_tasks);
        assertEquals("Waiting for connection…", body.getText().toString());
    }

    @Test public void aLauncherUpdateRestoresTasksAfterTheViewResets() {
        WeekWidgetProvider.show(context, manager, id,
            "Thursday, Nov 19", "1 pending", "○  Read", "musel · tap to open", true);
        TextView body = widgets.getViewFor(id).findViewById(R.id.widget_tasks);
        body.setText("Waiting for connection…");

        new WeekWidgetProvider().onReceive(context,
            new Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, new int[] { id }));

        assertEquals("○  Read", text(R.id.widget_tasks));
    }

    @Test public void refreshWithoutPreviousTasksShowsTheConnectionMessage() {
        refresh();
        assertEquals("Waiting for connection…", text(R.id.widget_tasks));
    }

    @Test public void anAccountRefreshReplacesWorkThatMayUseTheOldSession() throws Exception {
        refresh();
        WorkManager work = WorkManager.getInstance(context);
        java.util.List<WorkInfo> before = work.getWorkInfosForUniqueWork("widget-refresh").get();
        java.util.UUID oldId = before.stream().filter(info -> !info.getState().isFinished())
            .findFirst().get().getId();

        WeekWidgetProvider.refreshAll(context);
        Intent request = shadowOf((android.app.Application) context).getBroadcastIntents().stream()
            .filter(intent -> intent.getComponent() != null
                && intent.getComponent().getClassName().equals(WeekWidgetProvider.class.getName()))
            .reduce((first, second) -> second).get();
        new WeekWidgetProvider().onReceive(context, request);

        java.util.List<WorkInfo> after = work.getWorkInfosForUniqueWork("widget-refresh").get();
        assertTrue(after.stream().anyMatch(info -> !info.getId().equals(oldId) && !info.getState().isFinished()));
        assertTrue(after.stream().noneMatch(info -> info.getId().equals(oldId) && !info.getState().isFinished()));
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
        assertEquals("musel · tap to open", text(R.id.widget_account));
    }

    @Test public void aFailedRequestKeepsTheLastSuccessfulTaskList() throws Exception {
        WeekWidgetProvider.show(context, manager, id,
            "Thursday, Nov 19", "1 pending", "○  Read", "musel · tap to open", true);

        int before = ((CountingWidgetManager) widgets).updates;

        assertEquals(ListenableWorker.Result.failure(), fetch(new MockResponse().setResponseCode(503)));

        assertEquals("○  Read", text(R.id.widget_tasks));
        assertEquals("musel · tap to open", text(R.id.widget_account));
        assertEquals(before, ((CountingWidgetManager) widgets).updates);
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
