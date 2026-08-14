import React, { useState, useRef } from 'react';
import { Upload, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';
import { uploadFileToStorage } from '../../lib/storageUpload';

interface FileUploadProps {
  label: string;
  onFileSelect: (url: string | null, fileName: string | null) => void;
  storagePath: string;
  currentFileName?: string | null;
  accept?: string;
  maxSizeMB?: number;
}

export function FileUpload({ 
  label, 
  onFileSelect, 
  storagePath,
  currentFileName, 
  accept = ".pdf", 
  maxSizeMB = 5 
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(currentFileName || null);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Large File Resolution States
  const [isTooLarge, setIsTooLarge] = useState(false);
  const [tooLargeSizeKB, setTooLargeSizeKB] = useState<number | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Sync prop updates from parent reactively
  React.useEffect(() => {
    if (!currentFileName) {
      setFileName(null);
      setIsTooLarge(false);
      setTooLargeSizeKB(null);
      setPendingFile(null);
      setUploading(false);
      setUploadProgress(null);
    } else {
      setFileName(currentFileName);
    }
  }, [currentFileName]);

  const doUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    try {
      const url = await uploadFileToStorage(
        file,
        `${storagePath}/${file.name}`,
        (progress) => setUploadProgress(progress.percent)
      );
      setFileName(file.name);
      onFileSelect(url, file.name);
    } catch (err: any) {
      console.error('Upload failed:', err);
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(null);
      setIsTooLarge(false);
      setPendingFile(null);
    }
  };

  const handleFile = (file: File) => {
    setError(null);
    setIsTooLarge(false);
    setTooLargeSizeKB(null);
    setPendingFile(null);
    setUploading(false);
    setUploadProgress(null);

    const sizeKB = Math.round(file.size / 1024);

    if (file.size > maxSizeMB * 1024 * 1024) {
      setIsTooLarge(true);
      setTooLargeSizeKB(sizeKB);
      setFileName(file.name);
      setPendingFile(file);
      return;
    }

    doUpload(file);
  };

  const onDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else {
      setDragActive(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setFileName(null);
    setIsTooLarge(false);
    setTooLargeSizeKB(null);
    setPendingFile(null);
    setUploading(false);
    setUploadProgress(null);
    onFileSelect(null, null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-semibold text-ink-soft tracking-wide ml-2">{label}</label>
        
        <div 
          onDragEnter={onDrag}
          onDragLeave={onDrag}
          onDragOver={onDrag}
          onDrop={onDrop}
          className={cn(
            "relative group transition-all duration-300 rounded-xl border-2 border-dashed p-8 text-center overflow-hidden",
            dragActive ? "border-blue-dark bg-blue-dark/10" : "border-line bg-paper-2 hover:border-slate-300 hover:bg-paper-3/50",
            isTooLarge ? "border-amber-400 bg-amber/10" : fileName ? "border-blue-dark bg-blue-dark/5" : ""
          )}
        >
          {(!fileName && !isTooLarge && !uploading) && (
            <input
              type="file"
              aria-label={label}
              ref={fileInputRef}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              accept={accept}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          )}
          
          <div className="flex flex-col items-center gap-3 relative z-0">
            {uploading ? (
              <>
                <div className="w-14 h-14 bg-blue-dark/5 border border-blue-dark/10 rounded-xl flex items-center justify-center text-blue-dark scale-110">
                  <div className="w-6 h-6 border-2 border-blue-dark border-t-transparent rounded-lg animate-spin" />
                </div>
                <div className="w-full max-w-[200px]">
                  <p className="text-sm font-semibold text-ink mb-2">Uploading... {uploadProgress ?? 0}%</p>
                  <div className="w-full bg-line rounded-full h-2">
                    <div 
                      className="bg-blue-dark h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${uploadProgress ?? 0}%` }}
                    />
                  </div>
                </div>
              </>
            ) : isTooLarge ? (
              <>
                <div className="w-14 h-14 bg-amber/10 rounded-xl flex items-center justify-center text-amber-dark scale-110">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink line-clamp-1 px-4">{fileName}</p>
                  <p className="text-xs text-amber-700 font-bold mt-1 uppercase tracking-wider">
                    File is too large ({tooLargeSizeKB} KB)
                  </p>
                  <button 
                    type="button"
                    onClick={clearFile}
                    className="mt-3 text-xs font-bold text-red-500 hover:text-red-600 tracking-wide flex items-center gap-1 mx-auto relative z-20 cursor-pointer rounded-full"
                  >
                    <X className="w-3 h-3" /> Clear selection
                  </button>
                </div>
              </>
            ) : fileName ? (
              <>
                <div className="w-14 h-14 bg-blue-dark/10 rounded-xl flex items-center justify-center text-blue-dark scale-110 relative">
                  <CheckCircle2 className="w-7 h-7" />
                  <span className="absolute -top-1 -right-1 bg-blue-dark text-white rounded-lg p-0.5 text-xs font-bold px-1.5 border border-white flex items-center gap-0.5" title="Uploaded">
                    ✓
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink line-clamp-1 px-4">{fileName}</p>
                  <button 
                    type="button"
                    onClick={clearFile}
                    className="mt-3 text-xs font-bold text-red-500 hover:text-red-600 tracking-wide flex items-center gap-1 mx-auto relative z-20 cursor-pointer rounded-full"
                  >
                    <X className="w-3 h-3" /> Remove File
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-14 h-14 bg-white rounded-lg flex items-center justify-center text-ink-soft group-hover:text-blue-dark group-hover:scale-110 transition-all ">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-ink-soft">
                    <span className="text-blue-dark">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-ink-soft font-medium tracking-wide mt-1">
                    Format {accept} (max {maxSizeMB}MB)
                  </p>
                </div>
              </>
            )}
          </div>
          
        </div>

        {/* Rendered OUTSIDE the drop zone, in normal flow.
            This used to be `absolute -bottom-6` INSIDE a container carrying
            `overflow-hidden` — so it was positioned 24px below that box's
            bottom edge and clipped away entirely. Every upload failure was
            invisible: a student dropped a file the storage rules refuse, the
            spinner vanished, the zone read "Click to upload" again, and they
            believed their resume was attached. */}
        {error && (
          <p role="alert" className="mt-2 text-xs font-semibold text-red-600 leading-relaxed">
            {error}
          </p>
        )}
      </div>

      {isTooLarge && tooLargeSizeKB && pendingFile && (
        <div className="p-5 bg-amber/10 border border-amber-200 rounded-lg flex flex-col items-center text-center gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-xs font-semibold uppercase tracking-wider">File Size Limit Exceeded</p>
          </div>
          <p className="text-xs text-ink-soft leading-relaxed max-w-sm font-semibold">
            This file is larger than the {maxSizeMB}MB limit. Click below to upload it anyway (may be rejected by server rules depending on file type):
          </p>
          
          <div className="flex flex-wrap gap-2 justify-center w-full pt-1">
            <Button 
              type="button"
              onClick={() => doUpload(pendingFile)}
              className="px-5 text-xs bg-amber-600 hover:bg-amber-700 font-semibold uppercase rounded-lg tracking-wider gap-1.5 text-white h-9"
              isLoading={uploading}
            >
              <Upload className="w-3.5 h-3.5" /> Upload Anyway
            </Button>
            
            <Button 
              type="button"
              variant="outline"
              onClick={(e) => {
                clearFile(e);
              }}
              className="px-5 text-xs font-semibold uppercase rounded-lg tracking-wider h-9"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
