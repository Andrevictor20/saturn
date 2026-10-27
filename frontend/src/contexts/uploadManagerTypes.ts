export interface UploadItem {
  id: string;
  fileName: string;
  fileSize: number;
  destinationPath: string;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number[];
  progress: number;
  speedMBs: number;
  etaSeconds?: number; // tempo estimado restante em segundos
  status: 'uploading' | 'paused' | 'completed' | 'error';
  error?: string;
  retryable?: boolean; // falha de rede/servidor: pode ser retomada automaticamente
  createdAt: number;
}

export interface UploadManagerContextType {
  uploads: UploadItem[];
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  isMinimized: boolean;
  setIsMinimized: (min: boolean) => void;
  enqueueUpload: (file: File, destinationPath: string) => Promise<string>;
  enqueueMultipleUploads: (files: File[], destinationPath: string) => Promise<void>;
  pauseUpload: (id: string) => void;
  resumeUpload: (id: string) => Promise<void>;
  cancelUpload: (id: string) => void;
  clearCompleted: () => void;
}
