import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { normalizedBoxToPixels } from "./lib/crop-box.mjs";

type NormalizedBox = { x: number; y: number; width: number; height: number };
type Mask = { width: number; height: number; pixels: Uint8Array };

export type CroppedImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
  mimeType: "image/jpeg";
};

export async function cropImageBytes(
  source: Uint8Array,
  cropBox: NormalizedBox,
): Promise<CroppedImage> {
  const image = await Image.decode(source);
  const pixel = normalizedBoxToPixels(cropBox, image.width, image.height);
  const cropped = typeof image.clone === "function" ? image.clone() : image;
  cropped.crop(pixel.left, pixel.top, pixel.width, pixel.height);
  const bytes = await cropped.encodeJPEG(88);
  return {
    bytes,
    width: cropped.width,
    height: cropped.height,
    mimeType: "image/jpeg",
  };
}

export async function encodeMaskPng(mask: Mask): Promise<Uint8Array> {
  const image = new Image(mask.width, mask.height);
  image.fill(0x000000ff);
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.pixels[y * mask.width + x] === 255) {
        image.setPixelAt(x, y, 0xffffffff);
      }
    }
  }
  return await image.encode();
}

/** モック時にデコードできない画像でもジョブを完走させるための最小 JPEG */
export function placeholderJpeg(): Uint8Array {
  const base64 =
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxISEhUSEhIVFRUVFRUVFRUVFRUVFRUVFRUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGy0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAbAAABBQEBAAAAAAAAAAAAAAADAAIEBQYBB//EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmP/9k=";
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function cropImageOrPlaceholder(
  source: Uint8Array,
  cropBox: NormalizedBox,
  allowPlaceholder: boolean,
): Promise<CroppedImage> {
  try {
    return await cropImageBytes(source, cropBox);
  } catch (error) {
    if (!allowPlaceholder) throw error;
    return {
      bytes: placeholderJpeg(),
      width: 8,
      height: 8,
      mimeType: "image/jpeg",
    };
  }
}
