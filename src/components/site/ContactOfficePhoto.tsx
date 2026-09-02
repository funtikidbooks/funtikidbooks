"use client";

import { EditableImage } from "@/components/site/EditableImage";
import { setSiteImage } from "@/lib/actions/admin";

const OFFICE_IMAGE_KEY = "lien-he-anh-van-phong";

export function ContactOfficePhoto({ src, canEdit }: { src: string | null; canEdit: boolean }) {
  async function upload(file: File) {
    return setSiteImage(OFFICE_IMAGE_KEY, file, ["/lien-he"]);
  }

  if (!src && !canEdit) return null;

  return (
    <EditableImage
      src={src}
      alt="Văn phòng Funti Kidbooks Studio"
      canEdit={canEdit}
      onUpload={upload}
      placeholderVariant="dropzone"
      dropzoneLabel="Ảnh văn phòng"
      dropzoneHint="or browse files"
      className="w-full"
      style={{ height: 180 }}
      resizeWidth={700}
    />
  );
}
