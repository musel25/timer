package dev.musel.timerwidget;

import static org.junit.Assert.assertEquals;

import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public class WidgetTextTest {
    @Test public void showsTodaysTasksAndCountsTheRest() {
        List<WeekTasks.Task> tasks = Arrays.asList(
            task("A", "2026-11-09"), task("B", "2026-11-10"), task("C", "2026-11-11"),
            task("D", "2026-11-12"), task("E", "2026-11-13"), task("F", "2026-11-14"),
            task("G", "2026-11-15"));

        assertEquals("○  A\n○  B\n○  C\n○  D\n+3 more", WidgetText.lines(tasks));
    }

    @Test public void showsClearMessageForAnEmptyDay() {
        assertEquals("No pending tasks today", WidgetText.lines(Arrays.asList()));
    }

    private static WeekTasks.Task task(String title, String date) {
        return new WeekTasks.Task(title, title, date, false, false, 1);
    }
}
