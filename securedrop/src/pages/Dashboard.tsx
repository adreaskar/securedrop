import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { FileUpload } from "@/components/FileUpload";
import { FileList } from "@/components/FileList";
import { useAuth } from "@/hooks/useAuth";
import { getSentFiles, deleteSentFile, FileMetadata } from "@/lib/minio";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function Dashboard() {
  const { user, token, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  const fetchFiles = async () => {
    if (!user || !token) return;

    try {
      const data = await getSentFiles(token);
      setFiles(data);
    } catch (error) {
      console.error("Error fetching files:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && token) {
      fetchFiles();
    }
  }, [user, token]);

  const handleDelete = async (fileId: string) => {
    if (!token) return;

    if (
      !confirm(
        "Are you sure you want to delete this file? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      await deleteSentFile(fileId, token);
      toast({
        title: "File deleted",
        description: "The file has been successfully deleted.",
      });
      // Refresh the file list
      await fetchFiles();
    } catch (error: any) {
      console.error("Error deleting file:", error);
      toast({
        title: "Delete failed",
        description:
          error.response?.data?.error ||
          error.message ||
          "Failed to delete file",
        variant: "destructive",
      });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <FileUpload onUploadComplete={fetchFiles} />
          <FileList
            files={files.map((f) => ({
              id: f.id,
              file_name: f.fileName,
              file_size: f.fileSize,
              recipient_email: f.recipientEmail,
              status: f.status,
              message: f.message || null,
              created_at: f.createdAt,
            }))}
            title="Your Sent Files"
            description="Track the status of files you've sent"
            emptyMessage="No files sent yet. Upload your first file above."
            onDelete={handleDelete}
            showDeleteButton={true}
          />
        </div>
      </main>
    </div>
  );
}
