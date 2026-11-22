/* Lossless workspace transport. Business objects remain unchanged in memory and backups. */
(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('node:zlib'):null);
 if(typeof module==='object'&&module.exports)module.exports=api;else root.DSWorkspaceCodec=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(zlib){
 'use strict';
 const prefix='ds-workspace:zlib64:v1:',maxDecoded=32*1024*1024,maxDocument=900000;
 const bytes=value=>new TextEncoder().encode(value);
 function packed(value){return typeof value==='string'&&value.startsWith(prefix);}
 function error(message){const e=new Error(message);e.code='workspace-too-large';return e;}
 function pack(value){
  const text=JSON.stringify(value),input=bytes(text);
  if(input.length>maxDecoded)throw error('Der Workspace überschreitet 32 MB. Der lokale Stand bleibt erhalten. Bitte eine Sicherung herunterladen.');
  const compressed=zlib?zlib.deflateSync(input,{level:6}):globalThis.pako.deflate(input,{level:6});
  if(zlib)return prefix+compressed.toString('base64');
  let binary='';for(let i=0;i<compressed.length;i+=8192)binary+=String.fromCharCode(...compressed.subarray(i,i+8192));
  return prefix+btoa(binary);
 }
 function unpack(value){
  if(!packed(value))throw new Error('Unbekanntes Workspace-Speicherformat. Bitte die aktuelle App laden.');
  const encoded=value.slice(prefix.length);
  if(encoded.length>maxDocument||!encoded.length||encoded.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw new Error('Der gespeicherte Workspace ist beschädigt. Der lokale Stand bleibt erhalten.');
  let output;
  if(zlib)output=zlib.inflateSync(Buffer.from(encoded,'base64'),{maxOutputLength:maxDecoded});
  else{
   const binary=atob(encoded),input=Uint8Array.from(binary,c=>c.charCodeAt(0)),inflate=new globalThis.pako.Inflate({chunkSize:65536});
   let count=0;const chunks=[];
   inflate.onData=chunk=>{count+=chunk.length;if(count>maxDecoded)throw error('Der gespeicherte Workspace ist zu groß zum Öffnen. Der lokale Stand bleibt erhalten.');chunks.push(chunk);};
   inflate.push(input,true);if(inflate.err)throw new Error('Der gespeicherte Workspace konnte nicht vollständig gelesen werden.');
   output=new Uint8Array(count);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}
  }
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(output));
 }
 function read(document){
  if(!document||typeof document!=='object')return null;
  const payload=packed(document.payload)?unpack(document.payload):document.payload;
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Der Workspace-Serverstand enthält keinen gültigen Datenbestand. Bitte die aktuelle App laden.');
  return payload;
 }
 function size(document){return bytes(JSON.stringify(document)).length;}
 function envelope(previous,next){
  const merged={...(previous||{}),...next};
  if(packed(previous?.payload)||size(merged)>maxDocument)merged.payload=pack(next.payload);
  if(size(merged)>maxDocument){
   const extras={...merged};for(const key of ['payload','secureWorkflowVersion','updatedAt','updatedBy','legacyEnvelope'])delete extras[key];
   const archive=previous?.legacyEnvelope?unpack(previous.legacyEnvelope):{};
   // Every old envelope field is retained losslessly, rather than deleting old mirrors.
   const legacyEnvelope=pack({...archive,...extras});
   for(const key of Object.keys(extras))delete merged[key];
   merged.legacyEnvelope=legacyEnvelope;
  }
  if(size(merged)>maxDocument)throw error('Der Workspace überschreitet auch komprimiert die sichere Speichergröße. Die Cloud wurde nicht verändert; bitte den lokalen Stand sichern.');
  return merged;
 }
 return {packed,pack,unpack,read,envelope,size,maxDecoded,maxDocument};
});
