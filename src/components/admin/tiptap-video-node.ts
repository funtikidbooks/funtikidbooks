import { Node, mergeAttributes } from "@tiptap/core";

// A self-hosted <video> block — separate from the YouTube extension, for
// files uploaded straight to Supabase Storage instead of a YouTube link.
export const UploadedVideo = Node.create({
  name: "uploadedVideo",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "video[data-uploaded-video]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes(HTMLAttributes, {
        controls: "true",
        playsinline: "true",
        "data-uploaded-video": "",
        class: "rte-video-native",
      }),
    ];
  },
});
