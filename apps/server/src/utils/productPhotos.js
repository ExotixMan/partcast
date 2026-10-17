import sharp from 'sharp';
export async function normalizeProductPhoto(buffer,mime){
 if(!buffer?.length||buffer.length>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(mime))throw Object.assign(new Error('Choose a JPEG, PNG, or WebP photo under 5 MB.'),{status:422});
 try{
 const metadata=await sharp(buffer,{limitInputPixels:20000000}).metadata();
 if(!['jpeg','png','webp'].includes(metadata.format))throw new Error('Unsupported image');
 return await sharp(buffer,{limitInputPixels:20000000,animated:false}).rotate().resize(1600,1600,{fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();
 }catch{throw Object.assign(new Error('This file is not a readable photo. Choose a JPEG, PNG, or WebP image.'),{status:422});}
}
