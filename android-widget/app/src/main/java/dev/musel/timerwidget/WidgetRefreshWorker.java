package dev.musel.timerwidget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

public final class WidgetRefreshWorker extends Worker {
    public WidgetRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull @Override public Result doWork() {
        return refresh(PlannerApi.forAndroid());
    }

    Result refresh(PlannerApi api) {
        Context app = getApplicationContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(app);
        int[] ids = manager.getAppWidgetIds(new ComponentName(app, WeekWidgetProvider.class));
        if (ids.length == 0) return Result.success();
        String session = api.currentSession();
        try {
            PlannerApi.WeekSnapshot snapshot = api.weekSnapshot();
            synchronized (WeekWidgetProvider.SESSION_LOCK) {
                if (!api.isCurrent(snapshot)) return Result.success();
                if (snapshot.account == null) {
                    WeekWidgetProvider.clearAll(app);
                    return Result.success();
                }
                LocalDate today = LocalDate.now();
                List<WeekTasks.Task> tasks = WeekTasks.pending(snapshot.tasks, today);
                String date = today.format(DateTimeFormatter.ofPattern("EEEE, MMM d", Locale.getDefault()));
                String count = tasks.size() + " pending";
                String lines = WidgetText.lines(tasks);
                for (int id : ids) WeekWidgetProvider.show(app, manager, id, date, count, lines, snapshot.account + " · tap to open", true);
            }
            return Result.success();
        } catch (Exception error) {
            Log.w("PlannerWidget", "Task refresh failed", error);
            synchronized (WeekWidgetProvider.SESSION_LOCK) {
                if (!api.isCurrentSession(session)) return Result.success();
                if (error instanceof PlannerApi.AuthenticationException) {
                    WeekWidgetProvider.clearAll(app);
                } else {
                    for (int id : ids) WeekWidgetProvider.showSaved(app, manager, id, "Could not load tasks. Tap refresh.");
                }
            }
            return Result.failure();
        }
    }
}
