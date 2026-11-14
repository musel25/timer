package dev.musel.timerwidget;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

final class WeekTasks {
    static final class Task {
        final String id;
        final String title;
        final String date;
        final boolean done;
        final boolean archived;
        final long sortOrder;

        Task(String id, String title, String date, boolean done, boolean archived, long sortOrder) {
            this.id = id;
            this.title = title;
            this.date = date;
            this.done = done;
            this.archived = archived;
            this.sortOrder = sortOrder;
        }
    }

    static List<Task> pending(List<Task> tasks, LocalDate today) {
        String date = today.toString();
        List<Task> result = new ArrayList<>();
        for (Task task : tasks) {
            if (date.equals(task.date) && !task.done && !task.archived) {
                result.add(task);
            }
        }
        result.sort(Comparator.comparingLong(task -> task.sortOrder));
        return result;
    }

    private WeekTasks() {}
}
