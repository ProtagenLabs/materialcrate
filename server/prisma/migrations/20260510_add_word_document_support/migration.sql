-- AddColumn Post.fileType
ALTER TABLE "Post" ADD COLUMN "fileType" TEXT NOT NULL DEFAULT 'pdf';

-- AddColumn Post.renderedHtmlUrl
ALTER TABLE "Post" ADD COLUMN "renderedHtmlUrl" TEXT;

-- AddColumn PostVersion.fileType
ALTER TABLE "PostVersion" ADD COLUMN "fileType" TEXT NOT NULL DEFAULT 'pdf';
