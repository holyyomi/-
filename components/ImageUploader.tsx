import React, { useRef, useState } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';
import { Button } from './Button';

interface ImageUploaderProps {
  onImageSelect: (file: File) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageSelect }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (file.type.startsWith('image/')) {
      onImageSelect(file);
    } else {
      alert("Please upload an image file.");
    }
  };

  return (
    <div 
      className={`w-full max-w-xl mx-auto p-12 bg-white rounded-2xl shadow-xl border-2 border-dashed transition-all duration-300 ${
        dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
      }`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center justify-center text-center space-y-6">
        <div className={`p-4 rounded-full ${dragActive ? 'bg-blue-100' : 'bg-gray-50'}`}>
          <ImageIcon className={`w-12 h-12 ${dragActive ? 'text-blue-600' : 'text-gray-400'}`} />
        </div>
        
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-gray-900">제품 이미지를 업로드하세요</h3>
          <p className="text-gray-500">
            여기로 이미지를 끌어다 놓거나 아래 버튼을 클릭하세요.
          </p>
          <p className="text-xs text-gray-400">
            JPG, PNG, WEBP (최대 10MB)
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={handleChange}
        />
        
        <Button 
          size="lg" 
          onClick={() => fileInputRef.current?.click()}
          className="shadow-md hover:shadow-lg transform transition-all active:scale-95"
        >
          <Upload className="w-5 h-5 mr-2" />
          이미지 선택하기
        </Button>
      </div>
    </div>
  );
};