import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

// Sunucu ~1 MB'tan büyük istekleri reddediyor (413). Fotoğrafları göndermeden
// önce uzun kenarı maxSide piksele indirip JPEG olarak sıkıştırır; sonuç hâlâ
// büyükse boyutu ve kaliteyi düşürerek tekrar dener.
export async function compressImage(asset, { maxSide = 1600, quality = 0.6, maxBase64 = 900_000 } = {}) {
    const { uri, width = 0, height = 0 } = asset;
    let side = maxSide;
    let q = quality;
    let result;

    for (let attempt = 0; attempt < 4; attempt++) {
        const actions = [];
        if (width >= height && width > side) actions.push({ resize: { width: side } });
        else if (height > width && height > side) actions.push({ resize: { height: side } });

        result = await manipulateAsync(uri, actions, {
            compress: q,
            format: SaveFormat.JPEG,
            base64: true,
        });
        if ((result.base64?.length ?? 0) <= maxBase64) break;
        side = Math.round(side * 0.75);
        q = Math.max(0.3, q - 0.1);
    }
    return { uri: result.uri, base64: result.base64 };
}
