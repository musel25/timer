package dev.musel.timerwidget;

import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class TaskPayload {
    static List<WeekTasks.Task> parse(String json) throws JSONException {
        JSONArray rows = new JSONArray(json);
        List<WeekTasks.Task> tasks = new ArrayList<>(rows.length());
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.getJSONObject(i);
            tasks.add(new WeekTasks.Task(
                row.getString("id"),
                row.getString("title"),
                row.isNull("date") ? null : row.getString("date"),
                row.getBoolean("done"),
                !row.isNull("archivedAt"),
                row.getLong("sortOrder")));
        }
        return tasks;
    }

    private TaskPayload() {}
}
