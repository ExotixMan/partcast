import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {normalizeProductPhoto} from '../src/utils/productPhotos.js';
test('photos are decoded, bounded and converted to private WebP; disguised SVG is rejected',async()=>{
 const source=await sharp({create:{width:1700,height:100,channels:3,background:'#eeeeee'}}).jpeg().toBuffer();
 const encoded=await normalizeProductPhoto(source,'image/jpeg'),info=await sharp(encoded).metadata();
 assert.equal(info.format,'webp');assert.equal(info.width,1600);assert.ok(!info.exif);
 await assert.rejects(normalizeProductPhoto(Buffer.from('not a picture'),'image/jpeg'),/not a readable photo/);
 await assert.rejects(normalizeProductPhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'),'image/jpeg'),/not a readable photo/);
 await assert.rejects(normalizeProductPhoto(source,'text/plain'),/JPEG/);
 await assert.rejects(normalizeProductPhoto(Buffer.alloc(5*1024*1024+1),'image/png'),/under 5 MB/);
});
