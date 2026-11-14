package dev.musel.timerwidget;

import static org.junit.Assert.assertEquals;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import org.junit.Test;

public class WidgetTextTest {
    @Test public void showsFiveTasksAndCountsTheRest() {
        List<WeekTasks.Task> tasks = Arrays.asList(
            task("A", "2026-11-09"), task("B", "2026-11-10"), task("C", "2026-11-11"),
            task("D", "2026-11-12"), task("E", "2026-11-13"), task("F", "2026-11-14"),
            task("G", "2026-11-15"));

        assertEquals("Mon  A\nTue  B\nWed  C\nThu  D\nFri  E\n+2 more", WidgetText.lines(tasks, Locale.ENGLISH));
    }

    @Test public void showsClearMessageForAnEmptyWeek() {
        assertEquals("No pending tasks this week", WidgetText.lines(Arrays.asList(), Locale.ENGLISH));
    }

    private static WeekTasks.Task task(String title, String date) {
        return new WeekTasks.Task(title, title, date, false, false, 1);
    }
}
