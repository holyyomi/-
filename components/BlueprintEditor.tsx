import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Download, RefreshCw, ArrowLeft, Image as ImageIcon, Loader2, CheckCircle2, AlertCircle, Settings2, Type, Trash2 } from 'lucide-react';
import { GeneratedResult, SectionBlueprint, AspectRatio } from '../types';
import { Button } from './Button';
import { generateProductBackground } from '../services/geminiService';
import { Rnd } from 'react-rnd';
import html2canvas from 'html2canvas';

interface BlueprintEditorProps {
  result: GeneratedResult;
  aspectRatio: AspectRatio;
  desiredTone: string;
  onBack: () => void;
  onRegenerate: () => void;
}

type ImageGenOptions = { style: 'studio' | 'lifestyle' | 'outdoor', withModel: boolean, modelGender?: 'female' | 'male' };

type TextOverlay = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number | string;
  height: number | string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  fontFamily: string;
  fontWeight: string;
  textAlign: 'left' | 'center' | 'right';
  lineHeight: number;
};

export const BlueprintEditor: React.FC<BlueprintEditorProps> = ({ result, aspectRatio, desiredTone, onBack, onRegenerate }) => {
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [sections, setSections] = useState<SectionBlueprint[]>(result.blueprint.sections || []);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sectionOptions, setSectionOptions] = useState<Record<number, ImageGenOptions>>({});
  
  // Text Overlay State
  const [overlaysBySection, setOverlaysBySection] = useState<Record<number, TextOverlay[]>>({});
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const currentSection = sections[currentSectionIndex];
  const currentOverlays = overlaysBySection[currentSectionIndex] || [];
  const selectedOverlay = currentOverlays.find(o => o.id === selectedOverlayId);

  const getCurrentOptions = (): ImageGenOptions => {
    return sectionOptions[currentSectionIndex] || { style: 'studio', withModel: currentSectionIndex === 0, modelGender: 'female' };
  };

  const updateCurrentOptions = (updates: Partial<ImageGenOptions>) => {
    setSectionOptions(prev => ({
      ...prev,
      [currentSectionIndex]: { ...getCurrentOptions(), ...updates }
    }));
  };

  const handlePrev = () => {
    if (currentSectionIndex > 0) {
      setCurrentSectionIndex(currentSectionIndex - 1);
      setSelectedOverlayId(null);
      setEditingOverlayId(null);
    }
  };

  const handleNext = () => {
    if (currentSectionIndex < sections.length - 1) {
      setCurrentSectionIndex(currentSectionIndex + 1);
      setSelectedOverlayId(null);
      setEditingOverlayId(null);
    }
  };

  const handleGenerateImage = async () => {
    if (!currentSection || isGeneratingImage) return;
    
    setIsGeneratingImage(true);
    setError(null);
    
    try {
      const activeKey = process.env.API_KEY;
      if (!activeKey) throw new Error("API Key is missing");

      const opts = getCurrentOptions();
      const isRegeneration = !!currentSection.generatedImage;

      const generatedBg = await generateProductBackground(
        activeKey,
        result.originalImage,
        currentSection.prompt_en,
        aspectRatio,
        desiredTone,
        {
          style: opts.style,
          withModel: opts.withModel,
          modelGender: opts.modelGender,
          headline: currentSection.headline,
          subheadline: currentSection.subheadline,
          isRegeneration
        }
      );

      const updatedSections = [...sections];
      updatedSections[currentSectionIndex] = {
        ...currentSection,
        generatedImage: generatedBg
      };
      setSections(updatedSections);
    } catch (err: any) {
      console.error("Image generation error:", err);
      setError(err.message || "이미지 생성 중 오류가 발생했습니다.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleAddTextOverlay = (text: string, type: 'headline' | 'subheadline' | 'keypoint' | 'default' = 'default') => {
    if (!currentSection.generatedImage) {
      alert("이미지가 생성된 후에 텍스트를 추가할 수 있습니다.");
      return;
    }
    
    const displayText = type === 'keypoint' ? `✅ ${text}` : text;
    let defaultFontSize = 22;
    if (type === 'headline') defaultFontSize = 40;
    else if (type === 'subheadline') defaultFontSize = 24;
    else if (type === 'keypoint') defaultFontSize = 18;

    const newOverlay: TextOverlay = {
      id: Date.now().toString(),
      text: displayText,
      x: 50,
      y: 50,
      width: 300,
      height: 'auto',
      fontSize: defaultFontSize,
      color: '#FFFFFF',
      backgroundColor: 'transparent',
      fontFamily: "'Pretendard', sans-serif",
      fontWeight: 'bold',
      textAlign: 'left',
      lineHeight: 1.2,
    };
    setOverlaysBySection(prev => ({
      ...prev,
      [currentSectionIndex]: [...(prev[currentSectionIndex] || []), newOverlay]
    }));
    setSelectedOverlayId(newOverlay.id);
  };

  const updateOverlay = (id: string, updates: Partial<TextOverlay>) => {
    setOverlaysBySection(prev => ({
      ...prev,
      [currentSectionIndex]: (prev[currentSectionIndex] || []).map(o => o.id === id ? { ...o, ...updates } : o)
    }));
  };

  const deleteOverlay = (id: string) => {
    setOverlaysBySection(prev => ({
      ...prev,
      [currentSectionIndex]: (prev[currentSectionIndex] || []).filter(o => o.id !== id)
    }));
    if (selectedOverlayId === id) setSelectedOverlayId(null);
  };

  const handleDownload = async () => {
    if (!imageContainerRef.current || !currentSection.generatedImage) return;
    try {
      setSelectedOverlayId(null);
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for selection border to disappear
      
      const canvas = await html2canvas(imageContainerRef.current, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        scale: 2, // Higher quality
      });
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const link = document.createElement('a');
      link.download = `section_${currentSectionIndex + 1}_${currentSection.section_id}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Download error:", err);
      alert("이미지 다운로드 중 오류가 발생했습니다.");
    }
  };

  if (!currentSection) {
    return <div className="p-8 text-center text-red-500">섹션 데이터를 불러올 수 없습니다.</div>;
  }

  return (
    <div className="flex flex-col h-full bg-gray-50" onClick={() => { setSelectedOverlayId(null); setEditingOverlayId(null); }}>
      {/* Top Navigation */}
      <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            다시 만들기
          </Button>
          <h2 className="text-lg font-bold text-gray-800">상세페이지 설계 결과</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 font-medium">
            섹션 {currentSectionIndex + 1} / {sections.length}
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Blueprint Overview */}
        <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto p-6 hidden md:block">
          <div className="space-y-8">
            <div>
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Executive Summary</h3>
              <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-lg border border-gray-100">
                {result.blueprint.executiveSummary}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Scorecard</h3>
              <div className="space-y-3">
                {result.blueprint.scorecard?.map((item, idx) => (
                  <div key={idx} className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold text-sm text-gray-800">{item.category}</span>
                      <span className={`font-bold text-sm px-2 py-0.5 rounded ${
                        item.score.startsWith('A') ? 'bg-green-100 text-green-700' : 
                        item.score.startsWith('B') ? 'bg-blue-100 text-blue-700' : 
                        'bg-yellow-100 text-yellow-700'
                      }`}>{item.score}</span>
                    </div>
                    <p className="text-xs text-gray-500">{item.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Blueprint Structure</h3>
              <div className="space-y-2 relative before:absolute before:inset-y-0 before:left-2.5 before:w-0.5 before:bg-gray-200">
                {sections.map((sec, idx) => (
                  <button 
                    key={sec.section_id}
                    onClick={(e) => { e.stopPropagation(); setCurrentSectionIndex(idx); setSelectedOverlayId(null); setEditingOverlayId(null); }}
                    className={`relative flex items-center gap-3 w-full text-left p-2 rounded-lg transition-colors ${
                      currentSectionIndex === idx ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-600'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold z-10 border-2 ${
                      currentSectionIndex === idx ? 'bg-blue-600 border-blue-600 text-white' : 
                      sec.generatedImage ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-gray-300 text-gray-400'
                    }`}>
                      {sec.generatedImage && currentSectionIndex !== idx ? <CheckCircle2 className="w-3 h-3" /> : idx + 1}
                    </div>
                    <span className="text-sm font-medium truncate">{sec.section_name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content: Section Carousel */}
        <div className="flex-1 flex flex-col relative bg-gray-100">
          
          {/* Navigation Arrows */}
          <button 
            onClick={(e) => { e.stopPropagation(); handlePrev(); }}
            disabled={currentSectionIndex === 0}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/80 backdrop-blur rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-blue-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed z-20 transition-all"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          
          <button 
            onClick={(e) => { e.stopPropagation(); handleNext(); }}
            disabled={currentSectionIndex === sections.length - 1}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/80 backdrop-blur rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-blue-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed z-20 transition-all"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          {/* Section Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center">
            <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Image Preview Area */}
              <div className="flex flex-col items-center justify-start space-y-4">
                <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-blue-500" />
                      섹션 이미지
                    </h3>
                    {currentSection.generatedImage && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                        className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <Download className="w-3 h-3" /> 텍스트 포함 다운로드
                      </button>
                    )}
                  </div>
                  
                  {/* Text Overlay Toolbar (Moved outside image container) */}
                  {selectedOverlayId && selectedOverlay && (
                    <div 
                      className="bg-white border-b border-gray-200 p-4 flex flex-col gap-3 w-full shadow-sm z-20"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-sm font-bold text-gray-700 flex items-center gap-1.5"><Type className="w-4 h-4 text-blue-500"/> 텍스트 편집</h4>
                        <button 
                          onClick={() => deleteOverlay(selectedOverlayId)}
                          className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" /> 삭제
                        </button>
                      </div>
                      
                      {/* Row 1: Text Edit */}
                      <div className="flex items-center gap-2 w-full">
                        <input 
                          type="text" 
                          value={selectedOverlay.text}
                          onChange={e => updateOverlay(selectedOverlayId, { text: e.target.value })}
                          className="flex-1 p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          placeholder="텍스트를 입력하세요"
                        />
                      </div>
                      
                      {/* Row 2: Controls */}
                      <div className="flex items-center gap-4 overflow-x-auto pb-1 scrollbar-hide">
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">폰트</label>
                          <select 
                            value={selectedOverlay.fontFamily}
                            onChange={e => updateOverlay(selectedOverlayId, { fontFamily: e.target.value })}
                            className="p-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 bg-white"
                          >
                            <option value="'Pretendard', sans-serif">Pretendard</option>
                            <option value="'Noto Sans KR', sans-serif">Noto Sans KR</option>
                            <option value="'Inter', sans-serif">Inter</option>
                            <option value="serif">Serif</option>
                            <option value="monospace">Monospace</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">크기</label>
                          <input 
                            type="number" 
                            value={selectedOverlay.fontSize}
                            onChange={e => updateOverlay(selectedOverlayId, { fontSize: Number(e.target.value) })}
                            className="w-16 p-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">글자색</label>
                          <input 
                            type="color" 
                            value={selectedOverlay.color}
                            onChange={e => updateOverlay(selectedOverlayId, { color: e.target.value })}
                            className="w-8 h-8 p-0 border-0 rounded cursor-pointer"
                          />
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">배경색</label>
                          <div className="flex items-center gap-1">
                            <input 
                              type="color" 
                              value={selectedOverlay.backgroundColor === 'transparent' ? '#ffffff' : selectedOverlay.backgroundColor}
                              onChange={e => updateOverlay(selectedOverlayId, { backgroundColor: e.target.value })}
                              className="w-8 h-8 p-0 border-0 rounded cursor-pointer"
                            />
                            <button 
                              onClick={() => updateOverlay(selectedOverlayId, { backgroundColor: 'transparent' })} 
                              className={`text-[10px] px-2 py-1.5 rounded-md border ${selectedOverlay.backgroundColor === 'transparent' ? 'bg-gray-100 border-gray-300 text-gray-700 font-medium' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                            >
                              투명
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">굵기</label>
                          <select 
                            value={selectedOverlay.fontWeight}
                            onChange={e => updateOverlay(selectedOverlayId, { fontWeight: e.target.value })}
                            className="p-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 bg-white"
                          >
                            <option value="normal">Normal</option>
                            <option value="500">Medium</option>
                            <option value="bold">Bold</option>
                            <option value="900">Black</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">줄 간격</label>
                          <input 
                            type="number" 
                            step="0.1"
                            min="0.5"
                            max="3"
                            value={selectedOverlay.lineHeight}
                            onChange={e => updateOverlay(selectedOverlayId, { lineHeight: Number(e.target.value) })}
                            className="w-16 p-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">정렬</label>
                          <select 
                            value={selectedOverlay.textAlign}
                            onChange={e => updateOverlay(selectedOverlayId, { textAlign: e.target.value as any })}
                            className="p-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 bg-white"
                          >
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="relative bg-gray-100 flex-1 min-h-[500px] flex flex-col items-center justify-center overflow-hidden">

                    {currentSection.generatedImage ? (
                      <div 
                        ref={imageContainerRef} 
                        className="relative w-full shadow-sm"
                      >
                        <img 
                          src={currentSection.generatedImage} 
                          alt={currentSection.section_name}
                          className="w-full h-auto block"
                          draggable={false}
                        />
                        
                        {/* Overlays */}
                        {currentOverlays.map(overlay => (
                          <Rnd
                            key={overlay.id}
                            position={{ x: overlay.x, y: overlay.y }}
                            size={{ width: overlay.width, height: overlay.height }}
                            onDragStop={(e, d) => {
                              updateOverlay(overlay.id, { x: d.x, y: d.y });
                            }}
                            onResizeStop={(e, direction, ref, delta, position) => {
                              updateOverlay(overlay.id, {
                                width: ref.style.width,
                                height: ref.style.height,
                                ...position
                              });
                            }}
                            bounds="parent"
                            cancel=".cancel"
                            className={`absolute ${selectedOverlayId === overlay.id ? 'ring-2 ring-blue-500 bg-blue-500/10' : 'hover:ring-1 hover:ring-blue-300'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOverlayId(overlay.id);
                            }}
                          >
                            <div 
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                setSelectedOverlayId(overlay.id);
                                setEditingOverlayId(overlay.id);
                              }}
                              style={{
                                width: '100%',
                                height: '100%',
                                fontSize: `${overlay.fontSize}px`,
                                color: overlay.color,
                                backgroundColor: overlay.backgroundColor,
                                fontFamily: overlay.fontFamily,
                                fontWeight: overlay.fontWeight,
                                textAlign: overlay.textAlign,
                                lineHeight: overlay.lineHeight || 1.2,
                                wordBreak: 'keep-all',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: overlay.textAlign === 'center' ? 'center' : overlay.textAlign === 'right' ? 'flex-end' : 'flex-start',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                cursor: editingOverlayId === overlay.id ? 'text' : 'move'
                              }}
                            >
                              {editingOverlayId === overlay.id ? (
                                <textarea
                                  autoFocus
                                  className="cancel"
                                  value={overlay.text}
                                  onChange={(e) => updateOverlay(overlay.id, { text: e.target.value })}
                                  onBlur={() => setEditingOverlayId(null)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      setEditingOverlayId(null);
                                    }
                                  }}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    fontSize: 'inherit',
                                    color: 'inherit',
                                    backgroundColor: 'transparent',
                                    fontFamily: 'inherit',
                                    fontWeight: 'inherit',
                                    textAlign: 'inherit',
                                    lineHeight: 'inherit',
                                    border: 'none',
                                    outline: 'none',
                                    resize: 'none',
                                    overflow: 'hidden',
                                    padding: 0,
                                    margin: 0,
                                  }}
                                />
                              ) : (
                                overlay.text
                              )}
                            </div>
                          </Rnd>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center space-y-4 max-w-xs mb-4">
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm text-gray-300">
                          <ImageIcon className="w-10 h-10" />
                        </div>
                        <div>
                          <p className="text-gray-500 text-sm mb-4">이 섹션의 이미지가 아직 생성되지 않았습니다.</p>
                          {error && (
                            <div className="text-red-500 text-xs mb-4 bg-red-50 p-2 rounded border border-red-100 flex items-start text-left">
                              <AlertCircle className="w-4 h-4 mr-1 flex-shrink-0 mt-0.5" />
                              <span>{error}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Image Generation Options */}
                    <div className="w-full max-w-md bg-white p-4 rounded-xl border border-gray-200 shadow-sm mt-auto z-10" onClick={e => e.stopPropagation()}>
                      <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
                        <Settings2 className="w-4 h-4 mr-1.5 text-gray-500" />
                        이미지 생성 옵션
                      </h4>
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">배경 스타일</label>
                          <div className="flex flex-wrap gap-2">
                            {(['studio', 'lifestyle', 'outdoor'] as const).map(style => (
                              <button
                                key={style}
                                onClick={() => updateCurrentOptions({ style })}
                                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${getCurrentOptions().style === style ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                              >
                                {style === 'studio' ? '스튜디오컷' : style === 'lifestyle' ? '라이프스타일컷' : '아웃도어컷'}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-3">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={getCurrentOptions().withModel}
                              onChange={(e) => updateCurrentOptions({ withModel: e.target.checked })}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm font-medium text-gray-700">모델컷 포함 (매력적인 인물과 함께 연출)</span>
                          </label>
                          
                          {getCurrentOptions().withModel && (
                            <div className="pl-6 flex gap-3">
                              <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name="modelGender"
                                  checked={getCurrentOptions().modelGender === 'female'}
                                  onChange={() => updateCurrentOptions({ modelGender: 'female' })}
                                  className="border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm text-gray-600">여자 모델 (20대)</span>
                              </label>
                              <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name="modelGender"
                                  checked={getCurrentOptions().modelGender === 'male'}
                                  onChange={() => updateCurrentOptions({ modelGender: 'male' })}
                                  className="border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm text-gray-600">남자 모델 (20대)</span>
                              </label>
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-gray-100 flex gap-2">
                          {currentSection.generatedImage ? (
                            <Button onClick={handleGenerateImage} disabled={isGeneratingImage} variant="outline" className="w-full">
                              {isGeneratingImage ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 다시 생성 중...</> : <><RefreshCw className="w-4 h-4 mr-2" /> 다시 만들기</>}
                            </Button>
                          ) : (
                            <Button onClick={handleGenerateImage} disabled={isGeneratingImage} className="w-full">
                              {isGeneratingImage ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 생성 중...</> : <><ImageIcon className="w-4 h-4 mr-2" /> 이미지 생성하기</>}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section Details Area */}
              <div className="space-y-6" onClick={e => e.stopPropagation()}>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
                  <div>
                    <div className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded mb-2">
                      {currentSection.section_id}
                    </div>
                    <h2 className="text-2xl font-extrabold text-gray-900 mb-1">{currentSection.section_name}</h2>
                    <p className="text-sm text-gray-500">{currentSection.goal}</p>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">Headline</h4>
                      <p 
                        className="text-lg font-bold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors group relative inline-block"
                        onClick={() => handleAddTextOverlay(currentSection.headline, 'headline')}
                      >
                        {currentSection.headline}
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-10 flex items-center gap-1">
                          <Type className="w-3 h-3" /> 이미지에 추가
                        </span>
                      </p>
                      
                      <h4 className="text-xs font-bold text-gray-400 uppercase mt-4 mb-1">Subheadline</h4>
                      <p 
                        className="text-sm text-gray-600 cursor-pointer hover:text-blue-600 transition-colors group relative inline-block"
                        onClick={() => handleAddTextOverlay(currentSection.subheadline, 'subheadline')}
                      >
                        {currentSection.subheadline}
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-10 flex items-center gap-1">
                          <Type className="w-3 h-3" /> 이미지에 추가
                        </span>
                      </p>
                    </div>

                    {currentSection.bullets && currentSection.bullets.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Key Points</h4>
                        <ul className="space-y-2">
                          {currentSection.bullets.map((bullet, idx) => (
                            <li 
                              key={idx} 
                              className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer hover:text-blue-600 transition-colors group relative w-fit"
                              onClick={() => handleAddTextOverlay(bullet, 'keypoint')}
                            >
                              <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                              <span>{bullet}</span>
                              <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-10 flex items-center gap-1">
                                <Type className="w-3 h-3" /> 이미지에 추가
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {currentSection.trust_or_objection_line && (
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                        <h4 className="text-xs font-bold text-blue-400 uppercase mb-1">Trust / Objection</h4>
                        <p className="text-sm text-blue-900">{currentSection.trust_or_objection_line}</p>
                      </div>
                    )}

                    {currentSection.CTA && (
                      <div className="pt-2">
                        <button className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm shadow-md hover:bg-gray-800 transition-colors">
                          {currentSection.CTA}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Design Guidelines */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
                  <h3 className="font-bold text-gray-800 border-b border-gray-100 pb-2">디자인 가이드라인</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">Image Purpose</h4>
                      <p className="text-sm text-gray-600">{currentSection.purpose}</p>
                    </div>
                    
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">On-Image Text</h4>
                      <p className="text-sm text-gray-600 font-medium">{currentSection.on_image_text}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">Layout Notes</h4>
                        <p className="text-sm text-gray-600">{currentSection.layout_notes}</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">Style Guide</h4>
                        <p className="text-sm text-gray-600">{currentSection.style_guide}</p>
                      </div>
                    </div>
                  </div>
                  
                  {currentSection.compliance_notes && (
                    <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 mt-4">
                      <h4 className="text-xs font-bold text-yellow-600 uppercase mb-1">Compliance Notes</h4>
                      <p className="text-sm text-yellow-800">{currentSection.compliance_notes}</p>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

