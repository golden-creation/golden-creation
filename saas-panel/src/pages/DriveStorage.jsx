import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Eye,
  File,
  FileArchive,
  FileText,
  Folder,
  FolderPlus,
  Image,
  MoveRight,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import {
  createDriveFolder,
  deleteDriveFile,
  deleteDriveFolder,
  getDriveItems,
  updateDriveFile,
  updateDriveFolder,
  uploadDriveFile,
} from "../lib/adminApi";

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function fileIcon(file) {
  const mime = String(file.mime_type || "").toLowerCase();
  if (mime.startsWith("image/")) return Image;
  if (mime.startsWith("video/")) return Video;
  if (mime.includes("pdf") || mime.includes("word") || mime.includes("sheet")) return FileText;
  if (mime.includes("zip")) return FileArchive;
  return File;
}

function folderLabels(folders = []) {
  const byId = new Map(folders.map((folder) => [Number(folder.id), folder]));
  const labelFor = (folder) => {
    const names = [folder.name];
    let parentId = Number(folder.parent_id || 0);
    let guard = 0;
    while (parentId && byId.has(parentId) && guard < 20) {
      const parent = byId.get(parentId);
      names.unshift(parent.name);
      parentId = Number(parent.parent_id || 0);
      guard += 1;
    }
    return names.join(" / ");
  };
  return folders.map((folder) => ({ ...folder, label: labelFor(folder) }));
}

export default function DriveStorage() {
  const uploadRef = useRef(null);
  const [folderId, setFolderId] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [data, setData] = useState({
    folders: [],
    files: [],
    breadcrumb: [],
    allFolders: [],
    canDelete: false,
    pagination: { total: 0 },
  });
  const [folderName, setFolderName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [moveTarget, setMoveTarget] = useState(null);
  const [destination, setDestination] = useState("");

  const foldersForSelect = useMemo(() => folderLabels(data.allFolders || []), [data.allFolders]);

  const load = async () => {
    try {
      setLoading(true);
      const payload = await getDriveItems({
        folderId,
        q,
        type,
        limit: 50,
      });
      setData(payload);
    } catch (error) {
      setMessage(error.message || "Unable to load Drive");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(load, 220);
    return () => clearTimeout(timer);
  }, [folderId, q, type]);

  const createFolder = async () => {
    if (!folderName.trim()) {
      setMessage("Folder name is required");
      return;
    }
    try {
      await createDriveFolder({ name: folderName, parentId: folderId || null });
      setFolderName("");
      setMessage("Folder created");
      await load();
    } catch (error) {
      setMessage(error.message || "Unable to create folder");
    }
  };

  const uploadFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      setUploading(true);
      for (const file of files) {
        await uploadDriveFile(file, folderId || null);
      }
      setMessage(`${files.length} file(s) uploaded`);
      await load();
    } catch (error) {
      setMessage(error.message || "Unable to upload file");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const renameFolder = async (folder) => {
    const name = window.prompt("Rename folder", folder.name);
    if (!name || name.trim() === folder.name) return;
    try {
      await updateDriveFolder(folder.id, { name });
      setMessage("Folder renamed");
      await load();
    } catch (error) {
      setMessage(error.message || "Unable to rename folder");
    }
  };

  const renameFile = async (file) => {
    const name = window.prompt("Rename file", file.name);
    if (!name || name.trim() === file.name) return;
    try {
      await updateDriveFile(file.id, { name });
      setMessage("File renamed");
      await load();
    } catch (error) {
      setMessage(error.message || "Unable to rename file");
    }
  };

  const beginMove = (kind, item) => {
    setMoveTarget({ kind, item });
    setDestination(item.folder_id || item.parent_id || "");
  };

  const moveItem = async () => {
    if (!moveTarget) return;
    try {
      const nextFolderId = destination || null;
      if (moveTarget.kind === "folder") {
        await updateDriveFolder(moveTarget.item.id, { parentId: nextFolderId });
      } else {
        await updateDriveFile(moveTarget.item.id, { folderId: nextFolderId });
      }
      setMoveTarget(null);
      setDestination("");
      setMessage("Item moved");
      await load();
    } catch (error) {
      setMessage(error.message || "Unable to move item");
    }
  };

  const removeFolder = async (folder) => {
    if (!window.confirm(`Delete empty folder "${folder.name}"?`)) return;
    try {
      await deleteDriveFolder(folder.id);
      setMessage("Folder deleted");
      await load();
    } catch (error) {
      setMessage(error.message || "Unable to delete folder");
    }
  };

  const removeFile = async (file) => {
    if (!window.confirm(`Delete "${file.name}" from Drive?`)) return;
    try {
      await deleteDriveFile(file.id);
      setMessage("File deleted");
      await load();
    } catch (error) {
      setMessage(error.message || "Unable to delete file");
    }
  };

  const currentTitle = q ? "Search Results" : data.breadcrumb?.at(-1)?.name || "Company Drive";

  return (
    <main className="min-h-screen bg-[#F8F6F2] p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Drive Storage</h1>
          <p className="text-sm text-gray-500">
            Shared company files stored in DigitalOcean Spaces. Admins can delete files; staff can upload and organize.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => uploadRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm text-white"
          >
            <Upload size={16} /> {uploading ? "Uploading..." : "Upload Files"}
          </button>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm shadow"
          >
            <RefreshCw size={16} /> Refresh
          </button>
          <input ref={uploadRef} type="file" multiple className="hidden" onChange={uploadFiles} />
        </div>
      </div>

      {message && (
        <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {message}
        </div>
      )}

      <section className="mt-5 rounded-lg bg-white p-4 shadow">
        <div className="flex flex-wrap gap-3">
          <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-lg border px-3 py-2">
            <Search size={17} className="text-gray-400" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search files by name or type..."
              className="w-full outline-none"
            />
          </div>
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">All file types</option>
            <option value="image">Images</option>
            <option value="pdf">PDFs</option>
            <option value="video">Videos</option>
            <option value="document">Documents</option>
          </select>
          <div className="flex min-w-[280px] gap-2">
            <input
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="New folder name"
              className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={createFolder}
              className="inline-flex items-center gap-2 rounded-lg bg-[#A68B5B] px-3 py-2 text-sm text-white"
            >
              <FolderPlus size={16} /> Create
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <button type="button" onClick={() => setFolderId("")} className="rounded-full bg-gray-100 px-3 py-1">
            Drive
          </button>
          {(data.breadcrumb || []).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFolderId(String(item.id))}
              className="rounded-full bg-gray-100 px-3 py-1"
            >
              {item.name}
            </button>
          ))}
        </div>
      </section>

      {moveTarget && (
        <section className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border bg-white p-4 shadow">
          <MoveRight size={18} />
          <span className="text-sm">
            Move <strong>{moveTarget.item.name}</strong> to
          </span>
          <select
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            className="min-w-[260px] rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">Drive root</option>
            {foldersForSelect.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.label}
              </option>
            ))}
          </select>
          <button onClick={moveItem} className="rounded-lg bg-black px-4 py-2 text-sm text-white">
            Move
          </button>
          <button onClick={() => setMoveTarget(null)} className="rounded-lg border px-4 py-2 text-sm">
            Cancel
          </button>
        </section>
      )}

      <section className="mt-5 overflow-hidden rounded-lg bg-white shadow">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">{currentTitle}</h2>
            <p className="text-xs text-gray-500">
              {data.folders.length} folder(s), {data.pagination?.total || data.files.length} file(s)
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3">Name</th>
                <th>Type</th>
                <th>Size</th>
                <th>Owner</th>
                <th>Uploaded</th>
                <th className="text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!q &&
                data.folders.map((folder) => (
                  <tr key={`folder-${folder.id}`} className="border-b">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setFolderId(String(folder.id))}
                        className="inline-flex items-center gap-3 font-medium"
                      >
                        <span className="rounded bg-amber-50 p-2 text-[#A68B5B]">
                          <Folder size={20} />
                        </span>
                        {folder.name}
                      </button>
                    </td>
                    <td>Folder</td>
                    <td>-</td>
                    <td>{folder.created_by_name || "-"}</td>
                    <td>{folder.created_at ? new Date(folder.created_at).toLocaleDateString() : "-"}</td>
                    <td className="pr-4">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => renameFolder(folder)} title="Rename" className="rounded border p-2">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => beginMove("folder", folder)} title="Move" className="rounded border p-2">
                          <MoveRight size={15} />
                        </button>
                        {data.canDelete && (
                          <button onClick={() => removeFolder(folder)} title="Delete" className="rounded border p-2 text-red-600">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              {data.files.map((file) => {
                const Icon = fileIcon(file);
                return (
                  <tr key={`file-${file.id}`} className="border-b">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="rounded bg-gray-100 p-2 text-gray-700">
                          <Icon size={20} />
                        </span>
                        <div>
                          <p className="font-medium">{file.name}</p>
                          <p className="max-w-[420px] truncate text-xs text-gray-500">{file.original_name}</p>
                        </div>
                      </div>
                    </td>
                    <td>{file.mime_type || "File"}</td>
                    <td>{formatBytes(file.size)}</td>
                    <td>{file.uploaded_by_name || "-"}</td>
                    <td>{file.created_at ? new Date(file.created_at).toLocaleDateString() : "-"}</td>
                    <td className="pr-4">
                      <div className="flex justify-end gap-2">
                        {file.url && (
                          <a href={file.url} target="_blank" rel="noreferrer" title="Preview" className="rounded border p-2">
                            <Eye size={15} />
                          </a>
                        )}
                        {file.url && (
                          <a href={file.url} download title="Download" className="rounded border p-2">
                            <Download size={15} />
                          </a>
                        )}
                        <button onClick={() => renameFile(file)} title="Rename" className="rounded border p-2">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => beginMove("file", file)} title="Move" className="rounded border p-2">
                          <MoveRight size={15} />
                        </button>
                        {data.canDelete && (
                          <button onClick={() => removeFile(file)} title="Delete" className="rounded border p-2 text-red-600">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && !data.folders.length && !data.files.length && (
            <div className="p-10 text-center text-sm text-gray-500">
              No Drive items found.
            </div>
          )}
          {loading && <div className="p-10 text-center text-sm text-gray-500">Loading Drive...</div>}
        </div>
      </section>
    </main>
  );
}
