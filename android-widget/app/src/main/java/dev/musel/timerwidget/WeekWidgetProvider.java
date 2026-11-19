package dev.musel.timerwidget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

public final class WeekWidgetProvider extends AppWidgetProvider {
    static final Object SESSION_LOCK = new Object();
    private static final String REFRESH = "dev.musel.timerwidget.REFRESH";

    static void refreshAll(Context context) {
        context.sendBroadcast(new Intent(context, WeekWidgetProvider.class).setAction(REFRESH));
    }

    // Display updates must not wait for account network requests under SESSION_LOCK.
    static synchronized void clearAll(Context context) {
        savedTasks(context).edit().clear().apply();
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, WeekWidgetProvider.class));
        for (int id : ids) show(context, manager, id, "", "", "Open the app to sign in", "Planner", false);
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
        for (int id : ids) showSaved(app, manager, id, "Waiting for connection…");
        OneTimeWorkRequest work = new OneTimeWorkRequest.Builder(WidgetRefreshWorker.class)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build();
        WorkManager.getInstance(app).enqueueUniqueWork("widget-refresh", ExistingWorkPolicy.KEEP, work);
    }

    static synchronized void show(Context context, AppWidgetManager manager, int id,
                             String date, String count, String body, String account, boolean signedIn) {
        if (signedIn) {
            savedTasks(context).edit().putString("date", date).putString("count", count)
                .putString("body", body).putString("account", account).apply();
        }
        render(context, manager, id, date, count, body, account, signedIn);
    }

    static synchronized void showSaved(Context context, AppWidgetManager manager, int id, String fallback) {
        SharedPreferences saved = savedTasks(context);
        if (saved.contains("body")) {
            render(context, manager, id, saved.getString("date", ""), saved.getString("count", ""),
                saved.getString("body", ""), "Saved tasks · " + saved.getString("account", "Planner"), true);
        } else {
            render(context, manager, id, "", "", fallback, "Planner", false);
        }
    }

    private static SharedPreferences savedTasks(Context context) {
        return context.getSharedPreferences("widget_snapshot", Context.MODE_PRIVATE);
    }

    private static void render(Context context, AppWidgetManager manager, int id,
                               String date, String count, String body, String account, boolean signedIn) {
        RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.week_widget);
        view.setTextViewText(R.id.widget_date, date);
        view.setTextViewText(R.id.widget_count, count);
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
