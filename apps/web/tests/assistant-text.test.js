import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replyBlocks,replyEmphasis} from '../src/lib/assistantText.js';
test('part lists preserve separate names, codes and quantities; steps stay numbered',()=>{
 const text='Check these parts:\n\n- OIL FILTER\n  Part no. 90915-YZZD2\n  Order: **2 pcs**\n- FUEL FILTER\n  Part no. 23303-64010\n  Order: **1 pc**\n\nCheck your shelves.';
 const blocks=replyBlocks(text);
 assert.equal(blocks[1].type,'list');assert.equal(blocks[1].items.length,2);
 assert.deepEqual(blocks[1].items[0],['OIL FILTER','Part no. 90915-YZZD2','Order: **2 pcs**']);
 assert.equal(blocks[2].lines[0],'Check your shelves.');
 const steps=replyBlocks('1. Choose a part.\n2. Check the price.\n3. Save the sale.');
 assert.equal(steps[0].type,'steps');assert.equal(steps[0].start,1);assert.equal(steps[0].items.length,3);
});
test('assistant formatting keeps HTML and links as literal text and only marks explicit emphasis',()=>{
 const text='<img src=x onerror=alert(1)> [Open](javascript:alert(1))';
 assert.equal(replyBlocks(text)[0].lines[0],text);
 assert.deepEqual(replyEmphasis('Order: **2 pcs**'),[{text:'Order: ',strong:false},{text:'2 pcs',strong:true}]);
 assert.equal(replyEmphasis('<script>**text**</script>')[0].text,'<script>');
});
