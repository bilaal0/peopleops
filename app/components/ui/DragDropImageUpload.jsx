import { useState, useRef, useEffect } from "react";

export default function DragDropImageUpload({
  name,
  multiple = false,
  maxSizeMB = 5,
  maxFiles = 10,
  accept = ".jpg,.jpeg,.png,.webp",
}) {
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState(null);
  
  const fileInputRef = useRef(null);

  // Generate preview URLs
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  // Sync state to hidden input
  useEffect(() => {
    if (fileInputRef.current) {
      const dataTransfer = new DataTransfer();
      files.forEach((file) => dataTransfer.items.add(file));
      fileInputRef.current.files = dataTransfer.files;
    }
  }, [files]);

  const handleFiles = (incomingFiles) => {
    setError(null);
    let newFiles = Array.from(incomingFiles);

    // Validate size
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    const oversized = newFiles.filter((f) => f.size > maxSizeBytes);
    if (oversized.length > 0) {
      setError(`Some files exceed the ${maxSizeMB}MB limit and were skipped.`);
      newFiles = newFiles.filter((f) => f.size <= maxSizeBytes);
    }

    if (!multiple) {
      // Single file
      if (newFiles.length > 0) {
        setFiles([newFiles[0]]);
      }
    } else {
      // Multiple files
      const combined = [...files, ...newFiles];
      if (combined.length > maxFiles) {
        setError(`You can only upload up to ${maxFiles} images. Excess files were skipped.`);
        setFiles(combined.slice(0, maxFiles));
      } else {
        setFiles(combined);
      }
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const onFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const removeFile = (indexToRemove) => {
    setFiles((prev) => prev.filter((_, i) => i !== indexToRemove));
  };

  return (
    <div className="w-full">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`w-full p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-indigo-500 bg-indigo-50"
            : "border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-indigo-400"
        }`}
      >
        <svg
          className="w-10 h-10 text-gray-400 mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          ></path>
        </svg>
        <p className="text-sm font-medium text-gray-700">
          Click or drag & drop {multiple ? "images" : "an image"} here
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {multiple ? `Up to ${maxFiles} images. ` : "Single image. "}
          Max {maxSizeMB}MB. ({accept.replace(/,/g, ", ")})
        </p>
      </div>

      <input
        type="file"
        name={name}
        ref={fileInputRef}
        onChange={onFileInputChange}
        accept={accept}
        multiple={multiple}
        className="hidden"
      />

      {error && (
        <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {previews.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {previews.map((src, idx) => (
            <div
              key={idx}
              className="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square"
            >
              <img
                src={src}
                alt="preview"
                className="object-cover w-full h-full"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(idx);
                }}
                className="absolute top-1 right-1 bg-white/80 hover:bg-white text-red-600 rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
