package dev.musel.timerwidget;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

final class WidgetText {
    static String lines(List<WeekTasks.Task> tasks, Locale locale) {
        if (tasks.isEmpty()) return "No pending tasks this week";
        DateTimeFormatter day = DateTimeFormatter.ofPattern("EEE", locale);
        StringBuilder text = new StringBuilder();
        int shown = Math.min(5, tasks.size());
        for (int i = 0; i < shown; i++) {
            WeekTasks.Task task = tasks.get(i);
            if (i > 0) text.append('\n');
            text.append(LocalDate.parse(task.date).format(day)).append("  ").append(task.title);
        }
        if (tasks.size() > shown) text.append("\n+").append(tasks.size() - shown).append(" more");
        return text.toString();
    }

    private WidgetText() {}
}
