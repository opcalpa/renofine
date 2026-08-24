import { FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useFileUrl } from '@/lib/fileUrl';

interface PreviewFile {
  path: string;
  name: string;
  type: string;
}

interface BatchTolkFilePreviewProps {
  file: PreviewFile | null;
  onClose: () => void;
}

export function BatchTolkFilePreview({ file, onClose }: BatchTolkFilePreviewProps) {
  const url = useFileUrl(file?.path);
  if (!file) return null;
  const isPdf = file.type?.includes('pdf');
  const isImage = file.type?.startsWith('image/');

  return (
    <div className="flex flex-col h-full border-l bg-muted/20">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-background">
        <span className="text-xs font-medium truncate max-w-[200px]" title={file.name}>
          {file.name}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground ml-2"
        >
          &times;
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {isPdf ? (
          <iframe
            src={url ? `${url}#navpanes=0&scrollbar=1&view=FitH` : undefined}
            title={file.name}
            className="w-full h-full border-0"
            style={{ minHeight: '400px' }}
          />
        ) : isImage ? (
          <img
            src={url ?? undefined}
            alt={file.name}
            className="max-w-full h-auto p-2"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
            <FileText className="h-10 w-10 mb-2" />
            <span className="text-sm">{file.name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
