package dev.musel.timerwidget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class WeekWidgetProvider extends AppWidgetProvider {
    static final Object SESSION_LOCK = new Object();
    private static final String REFRESH = "dev.musel.timerwidget.REFRESH";
    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor();

    static void refreshAll(Context context) {
        context.sendBroadcast(new Intent(context, WeekWidgetProvider.class).setAction(REFRESH));
    }

    static void clearAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, WeekWidgetProvider.class));
        for (int id : ids) show(context, manager, id, "This week", "Open the app to sign in", "Planner", false);
    }

    @Override public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (!AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(action) && !REFRESH.equals(action)) {
            super.onReceive(context, intent);
            return;
        }
        Context app = context.getApplicationContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(app);
        int[] ids = manager.getAppWidgetIds(new ComponentName(app, WeekWidgetProvider.class));
        if (ids.length == 0) return;
        for (int id : ids) show(app, manager, id, "This week", "Refreshing…", "Planner", false);
        PendingResult result = goAsync();
        WORKER.execute(() -> {
            try {
                PlannerApi api = PlannerApi.forAndroid();
                PlannerApi.WeekSnapshot snapshot = api.weekSnapshot();
                synchronized (SESSION_LOCK) {
                    if (!api.isCurrent(snapshot)) return;
                    if (snapshot.account == null) {
                        for (int id : ids) show(app, manager, id, "This week", "Open the app to sign in", "Planner", false);
                        return;
                    }
                    List<WeekTasks.Task> tasks = WeekTasks.pending(snapshot.tasks, LocalDate.now());
                    String heading = "This week · " + tasks.size() + " pending";
                    String lines = WidgetText.lines(tasks, Locale.getDefault());
                    for (int id : ids) show(app, manager, id, heading, lines, snapshot.account + " · tap to open", true);
                }
            } catch (Exception ignored) {
                for (int id : ids) show(app, manager, id, "This week", "Could not load tasks. Tap refresh.", "Planner", false);
            } finally {
                result.finish();
            }
        });
    }

    private static void show(Context context, AppWidgetManager manager, int id,
                             String heading, String body, String account, boolean signedIn) {
        RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.week_widget);
        view.setTextViewText(R.id.widget_heading, heading);
        view.setTextViewText(R.id.widget_tasks, body);
        view.setTextViewText(R.id.widget_account, account);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        Intent open = signedIn
            ? new Intent(Intent.ACTION_VIEW, Uri.parse(PlannerApi.SITE))
            : new Intent(context, MainActivity.class);
        view.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 1, open, flags));
        Intent refresh = new Intent(context, WeekWidgetProvider.class).setAction(REFRESH);
        view.setOnClickPendingIntent(R.id.widget_refresh, PendingIntent.getBroadcast(context, 2, refresh, flags));
        manager.updateAppWidget(id, view);
    }
}
