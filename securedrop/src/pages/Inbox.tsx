import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { getReceivedFiles, downloadFile, FileMetadata } from "@/lib/minio";
import {
  Loader2,
  File,
  Download,
  Clock,
  User,
  CheckCircle,
  MessageSquare,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileStatusBadge } from "@/components/FileStatusBadge";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function Inbox() {
  const { user, token, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  const fetchReceivedFiles = async () => {
    if (!user || !token) return;

    try {
      const data = await getReceivedFiles(token);
      setFiles(data);
    } catch (error) {
      console.error("Error fetching received files:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && token) {
      fetchReceivedFiles();
    }
  }, [user, token]);

  const handleDownload = async (file: FileMetadata) => {
    if (file.status !== "approved") {
      toast({
        title: "File not available",
        description: "This file is still being scanned or was rejected.",
        variant: "destructive",
      });
      return;
    }

    if (!token) return;

    setDownloading(file.id);
    try {
      await downloadFile(file.id, file.fileName, token);
      toast({
        title: "Download started",
        description: `Downloading ${file.fileName}`,
      });
    } catch (error: any) {
      console.error("Download error:", error);
      toast({
        title: "Download failed",
        description:
          error.response?.data?.error ||
          error.message ||
          "Failed to download file",
        variant: "destructive",
      });
    } finally {
      setDownloading(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const approvedFiles = files.filter((f) => f.status === "approved");
  const pendingFiles = files.filter(
    (f) => f.status !== "approved" && f.status !== "rejected"
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Your Inbox
            </h1>
            <p className="text-muted-foreground">
              View and download files that have been securely shared with you.
            </p>
          </div>

          {/* Approved Files */}
          <Card className="shadow-lg border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                Ready to Download
              </CardTitle>
              <CardDescription>
                These files have been scanned and are safe to download.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {approvedFiles.length === 0 ? (
                <div className="text-center py-8">
                  <File className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    No approved files yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {approvedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="h-12 w-12 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                          <File className="h-6 w-6 text-emerald-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground truncate">
                            {file.fileName}
                          </p>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <span>{formatFileSize(file.fileSize)}</span>
                            {file.senderEmail && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {file.senderEmail}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(file.createdAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                          {file.message && (
                            <div className="flex items-start gap-1 mt-2 text-sm text-muted-foreground">
                              <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
                              <span className="italic">"{file.message}"</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleDownload(file)}
                        disabled={downloading === file.id}
                        className="flex-shrink-0 ml-4 bg-emerald-600 hover:bg-emerald-700"
                      >
                        {downloading === file.id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            Downloading...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Files */}
          {pendingFiles.length > 0 && (
            <Card className="shadow-lg border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-500" />
                  Pending Scan
                </CardTitle>
                <CardDescription>
                  These files are being scanned for security threats.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-accent/30 border border-border/50"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                          <File className="h-5 w-5 text-amber-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground truncate">
                            {file.fileName}
                          </p>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span>{formatFileSize(file.fileSize)}</span>
                            {file.senderEmail && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {file.senderEmail}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <FileStatusBadge status={file.status} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
