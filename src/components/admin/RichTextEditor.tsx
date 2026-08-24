"use client";

import { useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TiptapImage from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import { UploadedVideo } from "@/components/admin/tiptap-video-node";
import { uploadVideoDirect } from "@/lib/uploadVideo";

function ToolbarButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rte-toolbar-btn flex items-center justify-center rounded-[6px]"
      style={{
        width: 30,
        height: 30,
        background: active ? "var(--color-accent-100)" : "transparent",
        color: active ? "var(--color-accent-700)" : "var(--color-text)",
      }}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  content,
  onChange,
  onUploadImage,
}: {
  content: string;
  onChange: (html: string) => void;
  onUploadImage: (file: File) => Promise<string>;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      TiptapImage.configure({ HTMLAttributes: { class: "rte-image" } }),
      Youtube.configure({ width: 640, height: 360, HTMLAttributes: { class: "rte-video" } }),
      UploadedVideo,
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: "rich-content rte-editable" },
    },
  });

  async function handleImageFile(file: File | undefined) {
    if (!file || !editor) return;
    setUploading(true);
    try {
      const url = await onUploadImage(file);
      editor.chain().focus().setImage({ src: url }).run();
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  function handleAddLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Dán đường link:", previous ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  function handleAddVideo() {
    if (!editor) return;
    const url = window.prompt("Dán link video YouTube:");
    if (!url?.trim()) return;
    editor.commands.setYoutubeVideo({ src: url.trim() });
  }

  async function handleVideoFile(file: File | undefined) {
    if (!file || !editor) return;
    setUploadingVideo(true);
    try {
      const url = await uploadVideoDirect(file);
      editor.chain().focus().insertContent({ type: "uploadedVideo", attrs: { src: url } }).run();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Không thể tải video lên");
    } finally {
      setUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }

  if (!editor) return null;

  return (
    <div className="rte-wrap" style={{ border: "1.5px solid var(--color-neutral-300)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
      <div
        className="flex flex-wrap items-center gap-1 px-2 py-1.5"
        style={{ borderBottom: "1px solid var(--color-neutral-200)", background: "var(--color-surface)" }}
      >
        <select
          className="text-xs font-semibold rounded-[6px] px-1.5 py-1 mr-1"
          style={{ border: "1px solid var(--color-neutral-300)", background: "var(--color-bg)" }}
          value={editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : "p"}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "p") editor.chain().focus().setParagraph().run();
            if (v === "h2") editor.chain().focus().toggleHeading({ level: 2 }).run();
            if (v === "h3") editor.chain().focus().toggleHeading({ level: 3 }).run();
          }}
        >
          <option value="p">Normal</option>
          <option value="h2">Tiêu đề lớn</option>
          <option value="h3">Tiêu đề nhỏ</option>
        </select>

        <ToolbarButton label="In đậm" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <b>B</b>
        </ToolbarButton>
        <ToolbarButton label="In nghiêng" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <i>I</i>
        </ToolbarButton>
        <ToolbarButton label="Gạch chân" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <u>U</u>
        </ToolbarButton>
        <ToolbarButton
          label="Danh sách có số"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          label="Danh sách gạch đầu dòng"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          •
        </ToolbarButton>
        <ToolbarButton label="Trích dẫn" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          &ldquo;
        </ToolbarButton>
        <ToolbarButton label="Chèn link" active={editor.isActive("link")} onClick={handleAddLink}>
          🔗
        </ToolbarButton>
        <ToolbarButton label={uploading ? "Đang tải ảnh…" : "Chèn ảnh"} onClick={() => imageInputRef.current?.click()}>
          {uploading ? "…" : "🖼"}
        </ToolbarButton>
        <ToolbarButton label="Chèn video YouTube" onClick={handleAddVideo}>
          🎬
        </ToolbarButton>
        <ToolbarButton
          label={uploadingVideo ? "Đang tải video…" : "Tải video từ máy lên"}
          onClick={() => videoInputRef.current?.click()}
        >
          {uploadingVideo ? "…" : "📹"}
        </ToolbarButton>
        <ToolbarButton label="Xoá định dạng" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
          Tx
        </ToolbarButton>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleImageFile(e.target.files?.[0])}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => handleVideoFile(e.target.files?.[0])}
        />
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
