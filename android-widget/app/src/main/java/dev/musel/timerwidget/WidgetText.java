package dev.musel.timerwidget;

import java.util.List;

final class WidgetText {
    static String lines(List<WeekTasks.Task> tasks) {
        if (tasks.isEmpty()) return "No pending tasks today";
        StringBuilder text = new StringBuilder();
        int shown = Math.min(4, tasks.size());
        for (int i = 0; i < shown; i++) {
            WeekTasks.Task task = tasks.get(i);
            if (i > 0) text.append('\n');
            text.append("○  ").append(task.title);
        }
        if (tasks.size() > shown) text.append("\n+").append(tasks.size() - shown).append(" more");
        return text.toString();
    }

    private WidgetText() {}
}
