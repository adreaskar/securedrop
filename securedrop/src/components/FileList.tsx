import { File, ArrowRight, Clock, User, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileStatusBadge } from "./FileStatusBadge";
import { formatDistanceToNow } from "date-fns";

interface FileTransfer {
  id: string;
  file_name: string;
  file_size: number;
  recipient_email: string;
  status: "quarantine" | "scanning" | "approved" | "rejected";
  message: string | null;
  created_at: string;
}

interface FileListProps {
  files: FileTransfer[];
  title: string;
  description: string;
  emptyMessage: string;
  onDelete?: (fileId: string) => Promise<void>;
  showDeleteButton?: boolean;
}

export function FileList({
  files,
  title,
  description,
  emptyMessage,
  onDelete,
  showDeleteButton = false,
}: FileListProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <Card className="shadow-lg border-border/50">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <div className="text-center py-8">
            <File className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-4 rounded-lg bg-accent/30 border border-border/50 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <File className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">
                      {file.file_name}
                    </p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{formatFileSize(file.file_size)}</span>
                      <span className="flex items-center gap-1">
                        <ArrowRight className="h-3 w-3" />
                        {file.recipient_email}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right hidden sm:block">
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(file.created_at), {
                        addSuffix: true,
                      })}
                    </div>
                  </div>
                  <FileStatusBadge status={file.status} />
                  {showDeleteButton && onDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(file.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="Delete file"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
