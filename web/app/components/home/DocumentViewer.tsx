"use client";

import type { HomePost } from "./Post";
import PdfViewerModal from "./PdfViewerModal";
import WordDocumentViewer from "./WordDocumentViewer";

type DocumentViewerProps = {
  post: HomePost | null;
  isOpen: boolean;
  onClose: () => void;
};

export default function DocumentViewer({
  post,
  isOpen,
  onClose,
}: DocumentViewerProps) {
  const isWordDoc =
    post?.fileType === "docx" || post?.fileType === "doc";

  if (isWordDoc) {
    return (
      <WordDocumentViewer post={post} isOpen={isOpen} onClose={onClose} />
    );
  }

  return <PdfViewerModal post={post} isOpen={isOpen} onClose={onClose} />;
}
