import React, { useState, useEffect } from 'react';
import { ImageUploader } from './components/ImageUploader';
import { BlueprintEditor } from './components/BlueprintEditor';
import { AppState, GeneratedResult, AspectRatio } from './types';
import { analyzeProductAndSuggest, generateProductBackground, fileToBase64 } from './services/geminiService';
import { Wand2, Loader2, AlertCircle, Square, RectangleHorizontal, RectangleVertical, Smartphone, Copy, CheckCircle2, Zap } from 'lucide-react';
import { Button } from './components/Button';

// Use a local file for the logo as requested. 
// If the file is missing, the onError handler will fallback to the placeholder.
const LOGO_URL = "/logo.png";
const FALLBACK_LOGO_URL = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&h=100&q=80";

export default function App() {
  const [appState, setAppState] = useState<AppState>(AppState.UPLOAD);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [detailedError, setDetailedError] = useState<string | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [showAllRatios, setShowAllRatios] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState<string>("");
  const [desiredTone, setDesiredTone] = useState<string>("");
  
  // AI Studio Key State
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    checkApiKey();
    // Re-check on window focus to catch external changes
    const onFocus = () => checkApiKey();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const checkApiKey = async () => {
    if (window.aistudio) {
      try {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } catch (e) {
        console.error("Error checking API key:", e);
      }
    }
  };

  const handleConnectKey = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
        
        // Polling to detect changes after dialog interaction
        // Sometimes the state update is not immediate
        await checkApiKey();
        const intervalId = setInterval(checkApiKey, 500);
        
        // Stop polling after 5 seconds
        setTimeout(() => clearInterval(intervalId), 5000);
      } catch (e) {
        console.error("Key selection failed", e);
      }
    } else {
        alert("이 기능은 Google AI Studio 환경에서만 동작합니다.");
    }
  };

  const handleImageSelect = async (file: File) => {
    setError(null);
    setDetailedError(null);
    setShowErrorDetails(false);

    // AI Studio injects the key into process.env.API_KEY
    const activeKey = process.env.API_KEY;

    // Double check connection status
    if (!activeKey) {
        // Try to re-sync status if key is missing
        await checkApiKey();
        if (!hasApiKey) {
             setError("API Key를 찾을 수 없습니다. 다시 연결해주세요.");
             return;
        }
        // If hasApiKey is true but process.env is empty, it might be a timing issue or needs a refresh
        // We will proceed and let the service fail if necessary, but showing UI error is safer
        setError("API Key가 로드되지 않았습니다. 페이지를 새로고침 하거나 다시 연결해주세요.");
        return;
    }

    try {
      const base64 = await fileToBase64(file);
      setOriginalImage(base64);
      setAppState(AppState.PROCESSING);
      await processImage(base64, activeKey);
    } catch (err: any) {
      console.error(err);
      handleError(err);
      setAppState(AppState.UPLOAD);
    }
  };

  const processImage = async (base64: string, currentApiKey: string) => {
    try {
      setLoadingStep("AI가 제품을 분석하고 전체 상세페이지 구조를 설계 중입니다...");
      const blueprint = await analyzeProductAndSuggest(currentApiKey, base64, additionalInfo, desiredTone);
      
      // We will generate the first section's image automatically
      if (blueprint.sections && blueprint.sections.length > 0) {
          setLoadingStep(`첫 번째 섹션(${blueprint.sections[0].section_name}) 이미지를 생성 중입니다...`);
          try {
              const firstSection = blueprint.sections[0];
              const generatedBg = await generateProductBackground(
                  currentApiKey, 
                  base64, 
                  firstSection.prompt_en, 
                  aspectRatio, 
                  desiredTone,
                  {
                    style: 'studio',
                    withModel: true,
                    modelGender: 'female',
                    headline: firstSection.headline,
                    subheadline: firstSection.subheadline
                  }
              );
              blueprint.sections[0].generatedImage = generatedBg;
          } catch (imgErr) {
              console.error("Failed to generate first image:", imgErr);
              // Continue even if first image fails
          }
      }

      setResult({
        originalImage: base64,
        blueprint: blueprint
      });

      setAppState(AppState.EDITOR);
    } catch (err: any) {
      console.error("Process Image Error:", err);
      handleError(err);
      setAppState(AppState.UPLOAD);
    }
  };

  const handleError = (err: any) => {
    const errorMessage = err?.message || JSON.stringify(err);
    const fullErrorLog = JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
    
    setDetailedError(fullErrorLog);

    if (errorMessage.includes("quota") || errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
      setError(
        <span className="text-left block">
          <span className="font-bold">⚠️ 429 Quota Error (사용량 초과)</span><br/>
          API 사용량이 초과되었습니다.<br/>
          <br/>
          <strong>💡 해결 방법:</strong><br/>
          Google Cloud Console에서 쿼터(Quota)를 확인하거나 유료 결제 계정이 연결된 프로젝트를 선택해주세요.
        </span>
      );
    } else {
      setError(`AI 처리 중 오류가 발생했습니다: ${errorMessage.substring(0, 100)}...`);
    }
  };

  const handleRegenerate = async () => {
      const activeKey = process.env.API_KEY;
      if(originalImage && activeKey) {
        setAppState(AppState.PROCESSING);
        await processImage(originalImage, activeKey);
      } else {
          setError("API Key가 누락되었습니다.");
          setAppState(AppState.UPLOAD);
      }
  };

  const ratios: { value: AspectRatio; label: string; icon: React.ReactNode }[] = [
    { value: "1:1", label: "정방형 (1:1)", icon: <Square className="w-5 h-5"/> },
    { value: "3:4", label: "일반 세로 (3:4)", icon: <RectangleVertical className="w-5 h-5"/> },
    { value: "9:16", label: "모바일 (9:16)", icon: <Smartphone className="w-5 h-5"/> },
    { value: "4:3", label: "일반 가로 (4:3)", icon: <RectangleHorizontal className="w-5 h-5"/> },
    { value: "16:9", label: "와이드 (16:9)", icon: <RectangleHorizontal className="w-5 h-5 scale-x-125"/> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      


      <main className={`${appState === AppState.EDITOR ? 'h-screen' : 'max-w-7xl mx-auto px-4 py-12'}`}>
        
        {appState === AppState.UPLOAD && (
          <div className="flex flex-col items-center justify-center space-y-12 animate-fadeIn">
            <div className="text-center space-y-4 max-w-2xl">
              <h2 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl leading-tight">
                클릭 한 번으로<br/>
                <span className="text-blue-600">매출을 부르는 상세페이지</span> 완성
              </h2>
              <p className="text-lg text-gray-600">
                지루한 제품을 세계적인 카피라이터가 만들어주는 팔리는 이미지로 바꿔보세요
              </p>
            </div>

            <div className="w-full max-w-xl space-y-8">
                
                {/* Connection Status */}
                {!hasApiKey ? (
                    <div className="bg-white p-8 rounded-2xl shadow-xl border border-blue-100 text-center space-y-6">
                        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto">
                            <Zap className="w-8 h-8 text-blue-600" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-bold text-gray-900">AI Studio 연결이 필요합니다</h3>
                            <p className="text-gray-500">
                                서비스를 이용하려면 Google AI Studio API Key를 연결해야 합니다.
                            </p>
                        </div>
                        <Button 
                            onClick={handleConnectKey} 
                            size="lg"
                            className="w-full shadow-lg shadow-blue-200"
                        >
                            API Key 연결하기
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between bg-green-50 p-4 rounded-lg border border-green-200">
                             <div className="flex items-center gap-2 text-green-700 font-medium">
                                <CheckCircle2 className="w-5 h-5" />
                                <span>연결이 완료 되었습니다.</span>
                             </div>
                             <button 
                                onClick={handleConnectKey}
                                className="text-xs text-green-600 underline hover:text-green-800"
                             >
                                변경
                             </button>
                        </div>

                        {/* Ratio Selector */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-semibold text-gray-700">생성할 이미지 비율 선택</label>
                                <button 
                                    onClick={() => setShowAllRatios(!showAllRatios)}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                >
                                    {showAllRatios ? "접기" : "다른 비율 보기"}
                                </button>
                            </div>
                            <div className={`grid grid-cols-2 md:grid-cols-3 gap-3 ${showAllRatios ? '' : 'hidden'}`}>
                                {ratios.map((r) => (
                                    <button
                                        key={r.value}
                                        onClick={() => setAspectRatio(r.value)}
                                        className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                                            aspectRatio === r.value 
                                            ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500' 
                                            : 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                                        }`}
                                    >
                                        {r.icon}
                                        <span className="text-sm font-medium">{r.label}</span>
                                    </button>
                                ))}
                            </div>
                            {!showAllRatios && (
                                <div className="flex items-center justify-center gap-2 p-3 rounded-lg border bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500">
                                    {ratios.find(r => r.value === aspectRatio)?.icon}
                                    <span className="text-sm font-medium">{ratios.find(r => r.value === aspectRatio)?.label}</span>
                                </div>
                            )}
                        </div>

                        {/* Options */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 block">추가정보 입력 (선택)</label>
                                <input 
                                    type="text" 
                                    value={additionalInfo}
                                    onChange={(e) => setAdditionalInfo(e.target.value)}
                                    placeholder="예: 여름 시즌 한정판, 20대 여성 타겟 등"
                                    className="w-full p-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
                                />
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-700 block">원하는 톤 (선택)</label>
                                <select 
                                    value={desiredTone}
                                    onChange={(e) => setDesiredTone(e.target.value)}
                                    className="w-full p-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm bg-white"
                                >
                                    <option value="">선택 안함 (AI 자동 추천)</option>
                                    <option value="프리미엄">프리미엄</option>
                                    <option value="모던">모던</option>
                                    <option value="테크">테크</option>
                                    <option value="미니멀">미니멀</option>
                                    <option value="팝아트">팝아트</option>
                                    <option value="인스타감성">인스타감성</option>
                                    <option value="레트로">레트로</option>
                                </select>
                            </div>
                        </div>

                        <ImageUploader onImageSelect={handleImageSelect} />
                    </div>
                )}
            </div>

            {error && (
               <div className="w-full max-w-xl animate-fadeIn space-y-2">
                  <div className="flex items-center text-red-600 bg-red-50 px-4 py-3 rounded-lg border border-red-100 text-sm">
                      <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                      <div className="flex-1 font-medium">{error}</div>
                      {detailedError && (
                        <button 
                          onClick={() => setShowErrorDetails(!showErrorDetails)}
                          className="ml-2 p-1 hover:bg-red-100 rounded text-red-500 underline text-xs whitespace-nowrap"
                        >
                          {showErrorDetails ? "로그 접기" : "로그 보기"}
                        </button>
                      )}
                  </div>
                  
                  {showErrorDetails && detailedError && (
                    <div className="bg-gray-800 text-gray-200 p-4 rounded-lg text-xs font-mono overflow-x-auto relative">
                      <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
                        <span className="font-bold text-gray-400">Error Log Detail</span>
                        <button 
                          onClick={() => navigator.clipboard.writeText(detailedError)}
                          className="text-gray-400 hover:text-white flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3"/> 복사
                        </button>
                      </div>
                      <pre className="whitespace-pre-wrap break-all">
                        {detailedError}
                      </pre>
                    </div>
                  )}
               </div>
            )}
            
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-4xl mt-4">
               {[
                 { title: "자동 배경 합성", desc: "제품에 딱 맞는 고퀄리티 배경 생성" },
                 { title: "마케팅 카피", desc: "구매 전환율을 높이는 문구 추천" },
                 { title: "쉬운 편집", desc: "드래그 앤 드롭으로 자유로운 수정" }
               ].map((feature, i) => (
                 <div key={i} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 text-center">
                    <div className="font-bold text-lg mb-2 text-gray-800">{feature.title}</div>
                    <div className="text-gray-500 text-sm">{feature.desc}</div>
                 </div>
               ))}
            </div>

          </div>
        )}

        {appState === AppState.PROCESSING && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-8 animate-fadeIn">
            <div className="relative">
                <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-20"></div>
                <div className="relative bg-white p-6 rounded-full shadow-xl border border-blue-100">
                    <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                </div>
            </div>
            
            <div className="text-center space-y-2">
                <h3 className="text-2xl font-bold text-gray-900">AI가 작업 중입니다</h3>
                <p className="text-gray-500 animate-pulse">{loadingStep}</p>
            </div>

            <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full animate-progress"></div>
            </div>
            <style>{`
                @keyframes progress {
                    0% { width: 0%; margin-left: 0; }
                    50% { width: 50%; margin-left: 25%; }
                    100% { width: 100%; margin-left: 0; }
                }
                .animate-progress {
                    animation: progress 2s infinite ease-in-out;
                }
            `}</style>
          </div>
        )}

        {appState === AppState.EDITOR && result && (
          <BlueprintEditor 
            result={result}
            aspectRatio={aspectRatio}
            desiredTone={desiredTone}
            onBack={() => setAppState(AppState.UPLOAD)}
            onRegenerate={handleRegenerate}
          />
        )}
      </main>
    </div>
  );
}