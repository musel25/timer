package dev.musel.timerwidget;

import static org.junit.Assert.assertEquals;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;
import org.junit.Test;

public class WeekTasksTest {
    private static WeekTasks.Task task(String id, String date, boolean done, boolean archived, long order) {
        return new WeekTasks.Task(id, id, date, done, archived, order);
    }

    @Test public void keepsOnlyPendingTasksDatedToday() {
        List<WeekTasks.Task> all = Arrays.asList(
            task("priorSunday", "2026-11-08", false, false, 1),
            task("monday", "2026-11-09", false, false, 2),
            task("today", "2026-11-13", false, false, 2),
            task("done", "2026-11-12", true, false, 3),
            task("archived", "2026-11-13", false, true, 4),
            task("inbox", null, false, false, 5),
            task("sunday", "2026-11-15", false, false, 6),
            task("nextMonday", "2026-11-16", false, false, 7));

        assertEquals(Arrays.asList("today"), ids(WeekTasks.pending(all, LocalDate.of(2026, 11, 13))));
    }

    @Test public void sortsTodaysTasksByPlannerOrder() {
        List<WeekTasks.Task> all = Arrays.asList(
            task("last", "2026-11-13", false, false, 8),
            task("first", "2026-11-13", false, false, 2));

        assertEquals(Arrays.asList("first", "last"), ids(WeekTasks.pending(all, LocalDate.of(2026, 11, 13))));
    }

    private static List<String> ids(List<WeekTasks.Task> tasks) {
        return tasks.stream().map(task -> task.id).collect(Collectors.toList());
    }
}
