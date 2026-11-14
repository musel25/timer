package dev.musel.timerwidget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class TaskPayloadTest {
    @Test public void readsCurrentTaskFieldsAndTreatsMissingArchiveAsActive() throws Exception {
        String json = "[{\"id\":\"a\",\"title\":\"Read\",\"date\":\"2026-11-13\",\"done\":false,\"sortOrder\":7},"
            + "{\"id\":\"b\",\"title\":\"Write\",\"date\":null,\"done\":true,\"archivedAt\":1730000000000,\"sortOrder\":8}]";

        assertEquals(2, TaskPayload.parse(json).size());
        assertEquals("Read", TaskPayload.parse(json).get(0).title);
        assertEquals("2026-11-13", TaskPayload.parse(json).get(0).date);
        assertFalse(TaskPayload.parse(json).get(0).archived);
        assertTrue(TaskPayload.parse(json).get(1).done);
        assertTrue(TaskPayload.parse(json).get(1).archived);
    }

    @Test public void treatsZeroArchiveTimestampAsArchivedLikeThePlanner() throws Exception {
        String json = "[{\"id\":\"a\",\"title\":\"Old task\",\"date\":\"2026-11-13\",\"done\":false,\"archivedAt\":0,\"sortOrder\":1}]";
        assertTrue(TaskPayload.parse(json).get(0).archived);
    }
}
