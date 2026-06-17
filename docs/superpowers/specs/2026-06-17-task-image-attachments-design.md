# Task image attachments — design

**Date:** 2026-06-17
**Status:** Approved

## Goal

Let a user paste an image into a task's description. Pasted images are stored
as attachments on the task (the notes text box stays plain text) and shown as
thumbnails in the task editor.

## Model decision

Attachment model, not inline-in-text. The `notes` field stays a plain
`<textarea>`. Pasted images become separate attachment records shown below the
notes box. This avoids replacing the editor with a rich text/contenteditable
component and keeps `notes` as plain text.

## Storage

Images live in the SQLite DB as binary blobs, not on the filesystem. This keeps
the DB as the single source of truth so the existing DB-based backup/export
story stays complete.

New table `task_attachments`:

| column      | type    | notes                                  |
|-------------|---------|----------------------------------------|
| `id`        | text PK | 32-char hex (`newId()`)                |
| `userId`    | text    | owner; all queries scoped to it        |
| `taskId`    | text    | parent task                            |
| `mime`      | text    | one of png/jpeg/webp/gif               |
| `data`      | blob    | raw image bytes                        |
| `width`     | integer | pixel width after client downscale     |
| `height`    | integer | pixel height after client downscale    |
| `createdAt` | integer | epoch ms                               |

Attachments are deleted when their parent task is deleted (handled explicitly in
the task delete route — same-transaction delete, since there is no FK cascade in
the current schema setup).

## Client (`client/src/features/tasks/TaskEditor.tsx`)

- Add an `onPaste` handler on the editor (covering the notes textarea / form).
  When the clipboard contains an image item, capture the blob.
- **Downscale client-side via a canvas** before upload: cap the longest edge at
  ~1600px and re-encode (preserve mime when png/webp/gif; jpeg stays jpeg). This
  keeps uploads small and within the server cap. Record resulting width/height.
- Upload via `POST /tasks/:id/attachments`. On success, show the new thumbnail.
- Pasted images render as a thumbnail row below the notes box. Each thumbnail:
  - click → open full-size (lightbox or new tab),
  - ✕ button → `DELETE /attachments/:id` and remove from the row.
- Multiple images per task allowed.
- Thumbnails use `GET /attachments/:id` as their `src`.
- Note: a brand-new task may not have an id yet at paste time. The editor must
  operate on a persisted task id — ensure the task exists (is saved) before
  accepting a paste, or disable paste-upload until first save. Implementation
  plan resolves the exact ordering against how `TaskEditor` currently receives
  its `task`.

## API (`server/src/api.ts`, all under `requireAuth`, scoped to `uid(c)`)

- `POST /tasks/:id/attachments`
  - Verifies the task belongs to the user.
  - Accepts the image (base64 data URL or raw body — chosen in the plan).
  - Enforces mime allowlist (png/jpeg/webp/gif) and a **~3MB size cap** on the
    stored bytes; rejects otherwise (400).
  - Inserts a row, returns metadata `{ id, taskId, mime, width, height, createdAt }`.
- `GET /tasks/:id/attachments` — list metadata for the task (no blob bytes).
- `GET /attachments/:id` — serve raw bytes with correct `Content-Type`; authed
  and scoped so a user can only read their own attachments (404 otherwise).
- `DELETE /attachments/:id` — scoped delete.
- Task delete route (`DELETE /tasks/:id`) also deletes that task's attachments.

## Other touches

- Small 📎 + count indicator on `TaskRow` when a task has ≥1 attachment, so
  presence is visible without opening the editor. (Requires the task list or row
  to know the attachment count — plan decides whether to add a lightweight count
  to the `/tasks` response or fetch lazily.)
- Extend `/export` to include `task_attachments` and `/import` to restore them,
  so full backups remain complete. Import reassigns ids to the importing user
  the same way other entities are reassigned.

## Out of scope (YAGNI)

- Inline-in-text images / rich text editor.
- Drag-and-drop or file-picker upload (paste only for now).
- Non-image file attachments.
- Server-side image processing (cropping, EXIF stripping, format conversion).

## Testing (`server/src/*.test.ts`)

- Upload happy path: valid png/jpeg accepted, row created, metadata returned.
- Rejection: oversize body (>cap) → 400; disallowed mime → 400.
- Auth scoping: user B cannot `GET`/`DELETE` user A's attachment (404).
- List returns metadata without blob bytes.
- Cascade: deleting a task deletes its attachments.
- Export includes attachments; import restores them under the new user.
