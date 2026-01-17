import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api";

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
 * Upload file directly to backend API
 */
export const uploadFile = async (
  file: File,
  recipientEmail: string,
  message: string,
  token: string
): Promise<FileMetadata> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("recipientEmail", recipientEmail);
  if (message) {
    formData.append("message", message);
  }

  const response = await axios.post(`${API_BASE_URL}/files/upload`, formData, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
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
 * Download file
 */
export const downloadFile = async (
  fileId: string,
  fileName: string,
  token: string
): Promise<void> => {
  const response = await axios.get(`${API_BASE_URL}/files/${fileId}/download`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
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

/**
 * Delete a sent file
 */
export const deleteSentFile = async (
  fileId: string,
  token: string
): Promise<void> => {
  await axios.delete(`${API_BASE_URL}/files/${fileId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};
