import { useState, useRef, useCallback } from 'react';
import { Upload, Download, RefreshCw, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { virtualTryOnService, logger } from '../services/virtualTryOnService';

interface GenerationResult {
    success: boolean;
    imageUrl?: string;
    error?: string;
}

const SIZE_OPTIONS = [
    { value: '2k', label: '2K (高清)' },
    { value: '3k', label: '3K (超清)' },
    { value: '4k', label: '4K (极高)' },
];

export default function VirtualTryOn() {
    const [personImage, setPersonImage] = useState<string | null>(null);
    const [clothingImage, setClothingImage] = useState<string | null>(null);
    const [size, setSize] = useState<string>('2k');
    const [isGenerating, setIsGenerating] = useState(false);
    const [result, setResult] = useState<GenerationResult | null>(null);

    const personInputRef = useRef<HTMLInputElement>(null);
    const clothingInputRef = useRef<HTMLInputElement>(null);

    const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>, type: 'person' | 'clothing') => {
        const file = e.target.files?.[0];
        if (!file) return;

        logger.info('上传图片:', { type, name: file.name, size: `${(file.size / 1024).toFixed(1)}KB` });

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            if (type === 'person') {
                setPersonImage(dataUrl);
            } else {
                setClothingImage(dataUrl);
            }
        };
        reader.readAsDataURL(file);
    }, []);

    const handleGenerate = async () => {
        logger.info('开始生成流程...');

        // 验证输入
        try {
            virtualTryOnService.validateImage(personImage || '', '人物图片');
            virtualTryOnService.validateImage(clothingImage || '', '衣服图片');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '请上传两张图片';
            setResult({ success: false, error: errorMessage });
            logger.error('输入验证失败:', errorMessage);
            return;
        }

        setIsGenerating(true);
        setResult(null);

        try {
            const resultImageUrl = await virtualTryOnService.generate({
                personImage: personImage!,
                clothingImage: clothingImage!,
                size: size as '2k' | '3k' | '4k' | '1024x1024',
            });

            setResult({ success: true, imageUrl: resultImageUrl });
            logger.info('生成成功，图片已展示');

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '生成失败，请重试';
            setResult({ success: false, error: errorMessage });
            logger.error('生成流程失败:', errorMessage);

        } finally {
            setIsGenerating(false);
        }
    };

    const downloadResult = useCallback(() => {
        if (!result?.imageUrl) return;

        logger.info('下载图片...');
        const link = document.createElement('a');
        link.href = result.imageUrl;
        link.download = `virtual-tryon-${Date.now()}.png`;
        link.click();
    }, [result]);

    const clearAll = () => {
        logger.info('清空所有内容');
        setPersonImage(null);
        setClothingImage(null);
        setResult(null);
        setSize('2k');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-8">
                    <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
                        AI 虚拟试衣
                    </h1>
                    <p className="text-gray-600">
                        上传人物和衣服图片，AI 自动生成试穿效果
                    </p>
                </div>

                <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
                    <div className="grid md:grid-cols-2 gap-6 mb-6">
                        {/* 人物图片 */}
                        <div>
                            <h3 className="text-lg font-medium text-gray-700 mb-3">人物图片</h3>
                            <div
                                onClick={() => personInputRef.current?.click()}
                                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-400 hover:bg-gray-50 transition-all"
                            >
                                {personImage ? (
                                    <img src={personImage} alt="人物" className="max-h-48 mx-auto rounded-lg" />
                                ) : (
                                    <div>
                                        <Upload className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                                        <p className="text-gray-600">上传人物图片</p>
                                        <p className="text-sm text-gray-400 mt-1">建议正面站立</p>
                                    </div>
                                )}
                            </div>
                            <input
                                ref={personInputRef}
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleImageUpload(e, 'person')}
                                className="hidden"
                            />
                        </div>

                        {/* 衣服图片 */}
                        <div>
                            <h3 className="text-lg font-medium text-gray-700 mb-3">衣服图片</h3>
                            <div
                                onClick={() => clothingInputRef.current?.click()}
                                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-400 hover:bg-gray-50 transition-all"
                            >
                                {clothingImage ? (
                                    <img src={clothingImage} alt="衣服" className="max-h-48 mx-auto rounded-lg" />
                                ) : (
                                    <div>
                                        <Upload className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                                        <p className="text-gray-600">上传衣服图片</p>
                                        <p className="text-sm text-gray-400 mt-1">平铺或挂拍</p>
                                    </div>
                                )}
                            </div>
                            <input
                                ref={clothingInputRef}
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleImageUpload(e, 'clothing')}
                                className="hidden"
                            />
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            输出尺寸
                        </label>
                        <div className="flex gap-4 flex-wrap">
                            {SIZE_OPTIONS.map((opt) => (
                                <label key={opt.value} className="flex items-center cursor-pointer">
                                    <input
                                        type="radio"
                                        name="size"
                                        value={opt.value}
                                        checked={size === opt.value}
                                        onChange={(e) => setSize(e.target.value)}
                                        className="mr-2"
                                    />
                                    <span className="text-gray-600">{opt.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={handleGenerate}
                            disabled={!personImage || !clothingImage || isGenerating}
                            className="flex-1 bg-indigo-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    正在生成...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="w-5 h-5" />
                                    开始生成
                                </>
                            )}
                        </button>
                        <button
                            onClick={clearAll}
                            className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            清空
                        </button>
                    </div>
                </div>

                {/* 生成结果 */}
                {result && (
                    <div className="mt-6 bg-white rounded-2xl shadow-xl p-6 md:p-8">
                        <h2 className="text-xl font-semibold text-gray-700 mb-4">生成结果</h2>

                        {result.success ? (
                            <div>
                                <div className="flex justify-center mb-4 overflow-auto max-h-[600px]">
                                    <div className="relative">
                                        <img
                                            src={result.imageUrl}
                                            alt="生成结果"
                                            className="max-w-full max-h-[600px] rounded-lg shadow-md object-contain"
                                        />
                                        <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-sm flex items-center gap-1">
                                            <CheckCircle className="w-4 h-4" />
                                            成功
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-center gap-4">
                                    <button
                                        onClick={downloadResult}
                                        className="flex items-center gap-2 bg-green-600 text-white py-2 px-6 rounded-lg font-medium hover:bg-green-700 transition-colors"
                                    >
                                        <Download className="w-5 h-5" />
                                        下载图片
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                                <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-medium text-red-800">生成失败</p>
                                    <p className="text-red-600 text-sm mt-1">{result.error}</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 使用说明 */}
                <div className="mt-6 bg-blue-50 rounded-xl p-4">
                    <h3 className="font-medium text-blue-800 mb-2">使用说明</h3>
                    <ul className="text-sm text-blue-700 space-y-1">
                        <li>• 人物图片：建议正面站立，穿着简单的衣服</li>
                        <li>• 衣服图片：建议平铺或挂拍，背景简单</li>
                        <li>• 图片尺寸：建议 1920x1920 以上（至少 360 万像素）</li>
                        <li>• 输出尺寸：2K/3K/4K 画质更高</li>
                        <li>• 生成时间：通常需要 10-30 秒，请耐心等待</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
