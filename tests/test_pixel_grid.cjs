const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{},Float64Array};vm.createContext(context);
vm.runInContext(fs.readFileSync('scripts/pixel_grid.js','utf8'),context);
const {compare}=context.window.GANTRY_PIXEL_GRID;
const fine=new Uint32Array(256*640);
for(let y=0;y<4;y++)for(let x=0;x<4;x++)fine[y*256+x]=y*4+x+1;
const before=fine.slice(),p=compare(fine,256,640,0,0);
assert.deepEqual([...p.fine],Array.from({length:16},(_,i)=>i+1));
assert.deepEqual([...p.coarse],[14,22,46,54]);assert.equal(p.total,136);
assert.equal(p.fine.reduce((a,b)=>a+b),p.total);
assert.equal(p.total/4,4*(p.total/16));assert.deepEqual(fine,before);
const coarse=new Uint32Array(128*320);coarse[0]=1;coarse[1]=3;coarse[128]=5;coarse[129]=7;
const q=compare(coarse,128,320,0,0);
assert.deepEqual([...q.coarse],[1,3,5,7]);assert.equal(q.fine[0],.25);
assert.equal(q.fine[15],1.75);assert.equal(q.fine.reduce((a,b)=>a+b),16);
// Last rows/columns and zero-count regions remain in bounds for whole-body images.
for(const [w,h] of [[64,64],[64,160],[128,128],[128,320],[256,256],[256,615]]){
 const pixels=new Uint32Array(w*h).fill(2),r=compare(pixels,w,h,1,1);
 assert(r.x+r.size<=w&&r.y+r.size<=h);assert(Number.isFinite(r.total));
 assert.equal(r.total,2*r.size*r.size);
}
assert.equal(compare(new Uint32Array(128*128),128,128).total,0);
const small=new Uint32Array(64*160);small[0]=4;small[1]=8;small[64]=12;small[65]=16;
const s=compare(small,64,160,0,0);
assert.equal(s.base,64);assert.equal(s.fineMatrix,128);
assert.deepEqual([...s.coarse],[4,8,12,16]);assert.equal(s.fine[0],1);
assert.equal(s.total,40);assert.equal(s.fine.reduce((a,b)=>a+b),40);
console.log('OK: actual 2x2 count sums, illustrative subdivision, identical region totals, rectangular boundaries, zero counts and immutable source.');
