interface VirtualTryOnOptions {
    personImage: string;
    clothingImage: string;
    size?: '2k' | '3k' | '4k' | '1024x1024';
    prompt?: string;
}

interface VirtualTryOnResponse {
    id: string;
    data: Array<{
        url: string;
        b64_json?: string;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    created: number;
    model: string;
}

interface ApiError {
    error?: {
        message?: string;
        type?: string;
        code?: string;
    };
}

const LOG_PREFIX = '[VirtualTryOnService]';

// 简单的日志记录器
const logger = {
    info: (...args: unknown[]) => console.log(LOG_PREFIX, '[INFO]', ...args),
    error: (...args: unknown[]) => console.error(LOG_PREFIX, '[ERROR]', ...args),
    warn: (...args: unknown[]) => console.warn(LOG_PREFIX, '[WARN]', ...args),
    debug: (...args: unknown[]) => console.debug(LOG_PREFIX, '[DEBUG]', ...args),
};

// 获取配置
const getConfig = () => {
    const apiKey = import.meta.env.VITE_VOLC_ARK_API_KEY;
    const apiBase = import.meta.env.VITE_VOLC_ARK_API_BASE || 'https://ark.cn-beijing.volces.com/api/v3';
    const model = import.meta.env.VITE_VOLC_ARK_MODEL || 'doubao-seedream-5-0-260128';

    if (!apiKey) {
        logger.error('API Key 未配置');
        throw new Error('请配置 VITE_VOLC_ARK_API_KEY 环境变量');
    }

    return { apiKey, apiBase, model };
};

// 将 base64 图片上传到临时存储（简化版：直接使用 base64）
// 注意：火山引擎 API 支持 base64 编码的图片，格式为 "data:image/jpeg;base64,..."
const prepareImageForApi = (base64Data: string): string => {
    logger.debug('准备图片数据...');
    
    // 如果已经是 base64 格式，直接返回
    if (base64Data.startsWith('data:')) {
        return base64Data;
    }
    
    // 如果是纯 base64，添加前缀
    return `data:image/jpeg;base64,${base64Data}`;
};

// 调用火山引擎虚拟试衣 API
export const virtualTryOnService = {
    /**
     * 生成虚拟试衣效果
     */
    async generate(options: VirtualTryOnOptions): Promise<string> {
        const startTime = Date.now();
        logger.info('开始生成虚拟试衣效果...', {
            size: options.size || '2K',
            hasPersonImage: !!options.personImage,
            hasClothingImage: !!options.clothingImage,
        });

        try {
            const { apiKey, apiBase, model } = getConfig();

            // 准备图片数据
            const personImageUrl = prepareImageForApi(options.personImage);
            const clothingImageUrl = prepareImageForApi(options.clothingImage);

            const requestBody = {
                model: model,
                prompt: options.prompt || '将图1的服装换为图2的服装',
                image: [personImageUrl, clothingImageUrl],
                sequential_image_generation: 'disabled',
                response_format: 'url',
                size: options.size || '2k',
                stream: false,
                watermark: true,
            };

            logger.debug('API 请求体:', {
                model: requestBody.model,
                prompt: requestBody.prompt,
                imageCount: requestBody.image.length,
                size: requestBody.size,
            });

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时

            const response = await fetch(`${apiBase}/images/generations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            const responseTime = Date.now() - startTime;
            logger.info(`API 响应时间: ${responseTime}ms, 状态码: ${response.status}`);

            if (!response.ok) {
                let errorMessage = `请求失败 (${response.status})`;
                try {
                    const errorData: ApiError = await response.json();
                    errorMessage = errorData.error?.message || errorMessage;

                    if (errorMessage.includes('image size must be at least')) {
                        errorMessage = '图片尺寸太小！请使用至少 360 万像素的图片（建议 1920x1920 以上）';
                    }
                } catch {
                    errorMessage = `HTTP ${response.status}`;
                }
                logger.error('API 错误响应:', errorMessage);
                throw new Error(errorMessage);
            }

            const data: VirtualTryOnResponse = await response.json();
            logger.debug('API 响应数据:', {
                id: data.id,
                model: data.model,
                dataCount: data.data?.length || 0,
                usage: data.usage,
            });

            if (!data.data || data.data.length === 0) {
                logger.error('API 响应中没有图片数据');
                throw new Error('生成失败，没有返回图片');
            }

            const resultImageUrl = data.data[0].url;
            if (!resultImageUrl) {
                logger.error('图片 URL 为空');
                throw new Error('生成的图片 URL 为空');
            }

            const totalTime = Date.now() - startTime;
            logger.info(`虚拟试衣生成成功，总耗时: ${totalTime}ms`);

            return resultImageUrl;

        } catch (error) {
            const totalTime = Date.now() - startTime;
            logger.error('虚拟试衣生成失败', {
                error: error instanceof Error ? error.message : String(error),
                totalTime: `${totalTime}ms`,
            });

            // 检查是否是超时错误
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('请求超时！网络连接可能有问题，请检查网络后重试');
            }

            // 错误处理分类
            if (error instanceof Error) {
                if (error.message.includes('API Key')) {
                    throw new Error('API Key 配置错误，请检查环境变量');
                }
                if (error.message.includes('401')) {
                    throw new Error('API Key 无效，请检查是否正确');
                }
                if (error.message.includes('429')) {
                    throw new Error('请求过于频繁，请稍后再试');
                }
                if (error.message.includes('50')) {
                    throw new Error('服务器暂时不可用，请稍后再试');
                }
            }

            throw error;
        }
    },

    /**
     * 验证图片是否有效
     */
    validateImage(base64Data: string, fieldName: string): void {
        if (!base64Data) {
            throw new Error(`请上传${fieldName}`);
        }

        // 简单验证 base64 格式
        const isValid = base64Data.startsWith('data:image/') || 
            base64Data.length > 100;

        if (!isValid) {
            throw new Error(`${fieldName}格式无效`);
        }

        logger.debug(`图片验证通过: ${fieldName}`);
    },

    /**
     * 简单的图片尺寸估算（基于 base64 长度）
     */
    estimateImageSize(base64Data: string): boolean {
        // 粗略估算：base64 长度 / 1.37 约等于字节数
        const approxBytes = base64Data.length / 1.37;
        // 假设 3 字节/像素（RGB），计算估算的像素数
        // 实际这个估算不太准确，主要用于给用户提示
        const approxPixels = approxBytes / 3;
        
        // 3,686,400 像素的要求
        const minPixels = 3686400;
        
        if (approxPixels < minPixels) {
            logger.warn(`图片尺寸可能偏小，建议使用更大的图片`);
        }
        
        return true;
    }
};

export { logger };
