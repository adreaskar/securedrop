import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api";

export interface UploadUrlResponse {
  uploadUrl: string;
  fileId: string;
}

export interface FileMetadata {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  recipientEmail: string;
  message?: string;
  status: "quarantine" | "scanning" | "approved" | "rejected";
  createdAt: string;
  senderId: string;
  senderEmail?: string;
}

/**
 * Get a pre-signed URL for uploading a file to MinIO
 */
export const getUploadUrl = async (
  fileName: string,
  fileType: string,
  token: string
): Promise<UploadUrlResponse> => {
  const response = await axios.post(
    `${API_BASE_URL}/files/upload-url`,
    { fileName, fileType },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

/**
 * Upload file to MinIO using pre-signed URL
 */
export const uploadFileToMinIO = async (
  uploadUrl: string,
  file: File
): Promise<void> => {
  await axios.put(uploadUrl, file, {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
  });
};

/**
 * Create file transfer record in backend
 */
export const createFileTransfer = async (
  data: {
    fileId: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    recipientEmail: string;
    message?: string;
  },
  token: string
): Promise<FileMetadata> => {
  const response = await axios.post(`${API_BASE_URL}/files/transfer`, data, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

/**
 * Get user's sent files
 */
export const getSentFiles = async (token: string): Promise<FileMetadata[]> => {
  const response = await axios.get(`${API_BASE_URL}/files/sent`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

/**
 * Get user's received files
 */
export const getReceivedFiles = async (
  token: string
): Promise<FileMetadata[]> => {
  const response = await axios.get(`${API_BASE_URL}/files/received`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

/**
 * Get download URL for an approved file
 */
export const getDownloadUrl = async (
  fileId: string,
  token: string
): Promise<{ downloadUrl: string }> => {
  const response = await axios.get(
    `${API_BASE_URL}/files/${fileId}/download-url`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

/**
 * Download file from MinIO
 */
export const downloadFile = async (
  downloadUrl: string,
  fileName: string
): Promise<void> => {
  const response = await axios.get(downloadUrl, {
    responseType: "blob",
  });

  const blob = new Blob([response.data]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
